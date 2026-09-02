/**
 * 커뮤니티 조회·DTO 매핑 (T4.1·T4.2) — **서버 전용**(`@zari/db` 를 쓴다).
 *
 * 라우트 핸들러와 서버 컴포넌트가 **같은 함수**를 쓴다(T1.1 이 세운 규칙) — 그래야 페이지가
 * 내려주는 초기 데이터와 API 응답 모양이 어긋나지 않는다.
 *
 * 노출 규칙은 여기서 새로 정하지 않는다. 전부 `features/community/moderation.ts` 의
 * 순수 함수(`moderationStateOf`·`canSeeOriginal`·`canInteract`)를 부른다.
 */
import { prisma, ReportStatus, ReportTargetType, type Prisma } from "@zari/db";
import {
  cursorWhere,
  encodeCursor,
  orderByFor,
  type PostCursor,
  type PostSort,
} from "./cursor";
import {
  BLIND_NOTICE,
  canInteract,
  canSeeOriginal,
  moderationStateOf,
  type ModerationState,
  type ViewerRelation,
} from "./moderation";
import type { CommunityViewer } from "./ownership";
import { COMMUNITY_REGIONS, findRegion, regionLabel } from "./regions";
import type {
  AdminReportDto,
  PostAuthorDto,
  PostCommentDto,
  PostDetailDto,
  PostSummaryDto,
  ProfileTypeValue,
  RegionOptionDto,
  ReportActionOptionDto,
  ReportStatusValue,
  ReportTargetPreviewDto,
} from "./types";

/** 목록 카드의 본문 발췌 길이 */
const EXCERPT_LENGTH = 120;

/**
 * 목록·스레드에 자리를 남기는 행 조건 —
 * "살아 있거나(`deletedAt == null`), 블라인드(처리된 신고가 있는)" 인 것만.
 * 즉 **작성자가 지운 것만 SQL 단계에서 빠진다.** 나중에 걸러 내면 `take: limit + 1` 로 잡은
 * 페이지 크기가 깨져 커서 경계가 어긋나므로 반드시 쿼리에서 뺀다.
 */
const LISTED_POST_WHERE = {
  OR: [{ deletedAt: null }, { reports: { some: { status: ReportStatus.ACTIONED } } }],
} satisfies Prisma.PostWhereInput;

const LISTED_COMMENT_WHERE = {
  OR: [{ deletedAt: null }, { reports: { some: { status: ReportStatus.ACTIONED } } }],
} satisfies Prisma.CommentWhereInput;

const AUTHOR_INCLUDE = {
  authorProfile: { include: { user: { select: { name: true } } } },
} as const;

type AuthorRow = { id: string; type: string; user: { name: string } };

function toAuthor(profile: AuthorRow): PostAuthorDto {
  return {
    profileId: profile.id,
    name: profile.user.name,
    type: profile.type as ProfileTypeValue,
  };
}

/** 보는 사람과 글쓴이의 관계 — 본인이 곧 어드민이어도 본인이 먼저다(결과는 같다) */
function relationOf(authorProfileId: string, viewer: CommunityViewer): ViewerRelation {
  if (viewer.profileIds.includes(authorProfileId)) return "AUTHOR";
  return viewer.isAdmin ? "ADMIN" : "OTHER";
}

function excerpt(body: string): string {
  return body.length > EXCERPT_LENGTH ? `${body.slice(0, EXCERPT_LENGTH)}…` : body;
}

export function toRegionOption(code: string, name: string): RegionOptionDto {
  const region = findRegion(code);
  return { code, name: region?.name ?? name, label: region ? regionLabel(region) : name };
}

type PostRow = {
  id: string;
  regionCode: string;
  regionName: string;
  title: string;
  body: string;
  viewCount: number;
  likeCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  authorProfileId: string;
  authorProfile: AuthorRow;
};

type PostView = {
  row: PostRow;
  state: ModerationState;
  liked: boolean;
  commentCount: number;
  viewer: CommunityViewer;
};

/** 목록 카드 — 본문은 발췌. 가려야 하면 제목까지 안내문으로 바꾼다 */
export function toPostSummary(view: PostView, options: { full?: boolean } = {}): PostSummaryDto {
  const { row, state, viewer } = view;
  const visible = canSeeOriginal(state, relationOf(row.authorProfileId, viewer));
  const body = options.full ? row.body : excerpt(row.body);

  return {
    id: row.id,
    regionCode: row.regionCode,
    regionName: row.regionName,
    title: visible ? row.title : BLIND_NOTICE.postTitle,
    body: visible ? body : BLIND_NOTICE.postBody,
    viewCount: row.viewCount,
    likeCount: row.likeCount,
    commentCount: view.commentCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: toAuthor(row.authorProfile),
    moderation: state,
    bodyHidden: !visible,
    mine: viewer.profileIds.includes(row.authorProfileId),
    liked: view.liked,
  };
}

type CommentRow = {
  id: string;
  postId: string;
  body: string;
  createdAt: Date;
  deletedAt: Date | null;
  authorProfileId: string;
  authorProfile: AuthorRow;
  reports: { id: string }[];
};

function toCommentDto(row: CommentRow, viewer: CommunityViewer): PostCommentDto {
  const state = moderationStateOf({
    deletedAt: row.deletedAt,
    hasActionedReport: row.reports.length > 0,
  });
  const visible = canSeeOriginal(state, relationOf(row.authorProfileId, viewer));
  const mine = viewer.profileIds.includes(row.authorProfileId);

  return {
    id: row.id,
    postId: row.postId,
    body: visible ? row.body : BLIND_NOTICE.commentBody,
    createdAt: row.createdAt.toISOString(),
    author: toAuthor(row.authorProfile),
    moderation: state,
    bodyHidden: !visible,
    mine,
    canDelete: mine && canInteract(state),
  };
}

// ── 목록 ────────────────────────────────────────────────────────────────────

export type ListPostsParams = {
  regionCode: string;
  sort: PostSort;
  cursor: PostCursor | null;
  limit: number;
};

/**
 * 지역 보드 한 페이지.
 *
 * `take: limit + 1` 로 한 줄 더 읽어 **다음 페이지가 있는지**를 판단하고, 마지막으로 내보낸 행으로
 * 다음 커서를 만든다. 정렬·조건은 `cursor.ts` 의 규약을 그대로 부른다.
 */
export async function listPosts(
  params: ListPostsParams,
  viewer: CommunityViewer,
): Promise<{ posts: PostSummaryDto[]; nextCursor: string | null }> {
  const rows = await prisma.post.findMany({
    where: {
      regionCode: params.regionCode,
      AND: [LISTED_POST_WHERE, ...(params.cursor ? [cursorWhere(params.cursor)] : [])],
    },
    orderBy: [...orderByFor(params.sort)],
    take: params.limit + 1,
    include: AUTHOR_INCLUDE,
  });

  const hasMore = rows.length > params.limit;
  const page = rows.slice(0, params.limit);
  const last = page.at(-1);

  const ids = page.map((row) => row.id);
  const [commentCounts, likedIds] = await Promise.all([
    countComments(ids),
    findLikedPostIds(ids, viewer.profileIds),
  ]);

  return {
    posts: page.map((row) =>
      toPostSummary({
        row,
        // 목록 쿼리가 작성자 삭제분을 이미 뺐으므로 `deletedAt` 이 있으면 블라인드다
        state: row.deletedAt ? "BLINDED" : "VISIBLE",
        liked: likedIds.has(row.id),
        commentCount: commentCounts.get(row.id) ?? 0,
        viewer,
      }),
    ),
    nextCursor: hasMore && last ? encodeCursor(params.sort, last) : null,
  };
}

/** 스레드에 보이는 댓글 수 — 작성자 삭제분만 뺀다(블라인드 댓글은 자리를 남기므로 센다) */
async function countComments(postIds: string[]): Promise<Map<string, number>> {
  if (postIds.length === 0) return new Map();
  const rows = await prisma.comment.groupBy({
    by: ["postId"],
    where: { postId: { in: postIds }, ...LISTED_COMMENT_WHERE },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.postId, row._count._all]));
}

/** 내가 좋아요를 누른 글 id — 계정의 **모든 프로필**을 본다 */
async function findLikedPostIds(postIds: string[], profileIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0 || profileIds.length === 0) return new Set();
  const rows = await prisma.postLike.findMany({
    where: { postId: { in: postIds }, profileId: { in: profileIds } },
    select: { postId: true },
  });
  return new Set(rows.map((row) => row.postId));
}

// ── 상세 ────────────────────────────────────────────────────────────────────

/**
 * 글 상세 + 댓글. 없거나 **작성자가 지운 글**이면 `null`(라우트 404 · 화면 `notFound()`).
 *
 * `countView: true` 면 조회수를 1 올린다. `@updatedAt` 을 건드리지 않으려고 **raw UPDATE** 를 쓴다 —
 * Prisma 의 `update` 로 올리면 조회할 때마다 `updatedAt` 이 바뀌어 "언제 고친 글인지" 가 사라진다.
 */
export async function getPostDetail(
  postId: string,
  viewer: CommunityViewer,
  options: { countView?: boolean } = {},
): Promise<PostDetailDto | null> {
  if (options.countView) {
    await prisma.$executeRaw`UPDATE "Post" SET "viewCount" = "viewCount" + 1 WHERE id = ${postId}`;
  }

  const row = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      ...AUTHOR_INCLUDE,
      reports: { where: { status: ReportStatus.ACTIONED }, select: { id: true }, take: 1 },
    },
  });
  if (!row) return null;

  const state = moderationStateOf({
    deletedAt: row.deletedAt,
    hasActionedReport: row.reports.length > 0,
  });
  if (state === "REMOVED") return null;

  const [comments, likedIds, commentCounts] = await Promise.all([
    prisma.comment.findMany({
      where: { postId, ...LISTED_COMMENT_WHERE },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        ...AUTHOR_INCLUDE,
        reports: { where: { status: ReportStatus.ACTIONED }, select: { id: true }, take: 1 },
      },
    }),
    findLikedPostIds([postId], viewer.profileIds),
    countComments([postId]),
  ]);

  const summary = toPostSummary(
    {
      row,
      state,
      liked: likedIds.has(postId),
      commentCount: commentCounts.get(postId) ?? 0,
      viewer,
    },
    { full: true },
  );

  return {
    ...summary,
    comments: comments.map((comment) => toCommentDto(comment, viewer)),
    canEdit: summary.mine && canInteract(state),
    canInteract: canInteract(state),
  };
}

/** 댓글 목록만 (GET /api/posts/[id]/comments) */
export async function listComments(
  postId: string,
  viewer: CommunityViewer,
): Promise<PostCommentDto[]> {
  const rows = await prisma.comment.findMany({
    where: { postId, ...LISTED_COMMENT_WHERE },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      ...AUTHOR_INCLUDE,
      reports: { where: { status: ReportStatus.ACTIONED }, select: { id: true }, take: 1 },
    },
  });
  return rows.map((row) => toCommentDto(row, viewer));
}

/** 화면의 지역 셀렉트 — 상수표를 DTO 로 편 것(원본은 `regions.ts` 하나뿐이다) */
export const REGION_OPTIONS: RegionOptionDto[] = COMMUNITY_REGIONS.map((region) => ({
  code: region.code,
  name: region.name,
  label: regionLabel(region),
}));

// ── 신고 큐 (T4.2) ───────────────────────────────────────────────────────────

const REPORT_STATUS_META: Record<
  ReportStatusValue,
  { label: string; tone: AdminReportDto["statusTone"] }
> = {
  OPEN: { label: "대기", tone: "warning" },
  ACTIONED: { label: "블라인드", tone: "danger" },
  DISMISSED: { label: "기각", tone: "neutral" },
};

/**
 * 어드민이 누를 수 있는 버튼 — **대기 중일 때만** 있다.
 * 어드민 화면은 이 배열을 그대로 그린다(규칙을 복사하지 않는다 — T2.5 와 같은 방식).
 */
export function availableReportActions(status: ReportStatusValue): ReportActionOptionDto[] {
  if (status !== "OPEN") return [];
  return [
    {
      action: "BLIND",
      label: "블라인드",
      tone: "danger",
      description: "대상 글·댓글을 가리고, 같은 대상의 다른 대기 신고도 함께 종결합니다.",
    },
    {
      action: "DISMISS",
      label: "기각",
      tone: "neutral",
      description: "이 신고만 기각합니다. 다른 사람이 낸 신고는 큐에 남습니다.",
    },
  ];
}

const REPORT_INCLUDE = {
  reporterProfile: { include: { user: { select: { name: true } } } },
  handledBy: { select: { name: true } },
  post: {
    include: {
      ...AUTHOR_INCLUDE,
      reports: { where: { status: ReportStatus.ACTIONED }, select: { id: true }, take: 1 },
    },
  },
  comment: {
    include: {
      ...AUTHOR_INCLUDE,
      post: { select: { id: true, title: true, regionCode: true, regionName: true } },
      reports: { where: { status: ReportStatus.ACTIONED }, select: { id: true }, take: 1 },
    },
  },
} as const;

type ReportRow = Prisma.ReportGetPayload<{ include: typeof REPORT_INCLUDE }>;

/** 대상 미리보기 — **어드민은 블라인드된 원문도 그대로 본다**(moderation.ts 규칙표) */
function toTargetPreview(row: ReportRow): ReportTargetPreviewDto | null {
  if (row.targetType === ReportTargetType.POST) {
    const post = row.post;
    if (!post) return null;
    return {
      type: "POST",
      id: post.id,
      postId: post.id,
      postTitle: post.title,
      regionName: post.regionName,
      body: post.body,
      authorName: post.authorProfile.user.name,
      authorProfileType: post.authorProfile.type as ProfileTypeValue,
      createdAt: post.createdAt.toISOString(),
      moderation: moderationStateOf({
        deletedAt: post.deletedAt,
        hasActionedReport: post.reports.length > 0,
      }),
    };
  }

  const comment = row.comment;
  if (!comment) return null;
  return {
    type: "COMMENT",
    id: comment.id,
    postId: comment.post.id,
    postTitle: comment.post.title,
    regionName: comment.post.regionName,
    body: comment.body,
    authorName: comment.authorProfile.user.name,
    authorProfileType: comment.authorProfile.type as ProfileTypeValue,
    createdAt: comment.createdAt.toISOString(),
    moderation: moderationStateOf({
      deletedAt: comment.deletedAt,
      hasActionedReport: comment.reports.length > 0,
    }),
  };
}

function toAdminReport(row: ReportRow, openSiblingCount: number): AdminReportDto {
  const status = row.status as ReportStatusValue;
  const meta = REPORT_STATUS_META[status];
  return {
    id: row.id,
    targetType: row.targetType as ReportTargetTypeValueLocal,
    targetId: (row.targetType === ReportTargetType.POST ? row.postId : row.commentId) ?? "",
    reason: row.reason,
    status,
    statusLabel: meta.label,
    statusTone: meta.tone,
    createdAt: row.createdAt.toISOString(),
    reporterName: row.reporterProfile.user.name,
    reporterProfileType: row.reporterProfile.type as ProfileTypeValue,
    handledByName: row.handledBy?.name ?? null,
    handledAt: row.handledAt?.toISOString() ?? null,
    openSiblingCount,
    target: toTargetPreview(row),
    availableActions: availableReportActions(status),
  };
}

type ReportTargetTypeValueLocal = AdminReportDto["targetType"];

/** 같은 대상에 걸린 **다른** 대기 신고 수 */
async function countOpenSiblings(rows: ReportRow[]): Promise<Map<string, number>> {
  const postIds = rows.map((row) => row.postId).filter((id): id is string => Boolean(id));
  const commentIds = rows.map((row) => row.commentId).filter((id): id is string => Boolean(id));
  if (postIds.length === 0 && commentIds.length === 0) return new Map();

  const open = await prisma.report.findMany({
    where: {
      status: ReportStatus.OPEN,
      OR: [{ postId: { in: postIds } }, { commentId: { in: commentIds } }],
    },
    select: { id: true, postId: true, commentId: true },
  });

  const byTarget = new Map<string, string[]>();
  for (const item of open) {
    const key = item.postId ? `POST:${item.postId}` : `COMMENT:${item.commentId}`;
    byTarget.set(key, [...(byTarget.get(key) ?? []), item.id]);
  }

  return new Map(
    rows.map((row) => {
      const key = row.postId ? `POST:${row.postId}` : `COMMENT:${row.commentId}`;
      const ids = byTarget.get(key) ?? [];
      return [row.id, ids.filter((id) => id !== row.id).length];
    }),
  );
}

/** 신고 큐 — **오래 기다린 순**(접수 시각 오름차순). T2.5 환급 큐와 같은 정렬 */
export async function listReportQueue(statuses: ReportStatusValue[]): Promise<AdminReportDto[]> {
  const rows = await prisma.report.findMany({
    where: statuses.length > 0 ? { status: { in: statuses as ReportStatus[] } } : undefined,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: REPORT_INCLUDE,
  });
  const siblings = await countOpenSiblings(rows);
  return rows.map((row) => toAdminReport(row, siblings.get(row.id) ?? 0));
}

/** 상태별 건수 — 어드민 필터 탭의 배지 */
export async function reportStatusCounts(): Promise<Record<ReportStatusValue, number>> {
  const rows = await prisma.report.groupBy({ by: ["status"], _count: { _all: true } });
  const counts: Record<ReportStatusValue, number> = { OPEN: 0, ACTIONED: 0, DISMISSED: 0 };
  for (const row of rows) counts[row.status as ReportStatusValue] = row._count._all;
  return counts;
}

/** 신고 1건(액션 응답용) */
export async function getAdminReport(id: string): Promise<AdminReportDto | null> {
  const row = await prisma.report.findUnique({ where: { id }, include: REPORT_INCLUDE });
  if (!row) return null;
  const siblings = await countOpenSiblings([row]);
  return toAdminReport(row, siblings.get(row.id) ?? 0);
}
