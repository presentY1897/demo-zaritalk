/**
 * 커뮤니티·신고 화면 DTO (T4.1·T4.2).
 *
 * **`@zari/db` 를 import 하지 않는다** — 보드·상세·글쓰기 폼이 전부 클라이언트 컴포넌트라
 * Prisma 타입을 끌어오면 클라이언트 번들이 깨진다(T1.1 `features/landlord/types.ts` 미러 패턴).
 */
import type { PostSort } from "./cursor";
import type { ModerationState } from "./moderation";

/** `ProfileType` 미러 — 스키마 enum 과 값이 같아야 한다 */
export type ProfileTypeValue = "LANDLORD" | "TENANT" | "REALTOR" | "MASTER";

/** `ReportTargetType` 미러 */
export type ReportTargetTypeValue = "POST" | "COMMENT";

/** `ReportStatus` 미러 */
export type ReportStatusValue = "OPEN" | "ACTIONED" | "DISMISSED";

/** 글쓴이 — 목록의 프로필 유형 배지가 이 값을 그린다 */
export type PostAuthorDto = {
  profileId: string;
  name: string;
  type: ProfileTypeValue;
};

/** 목록 카드 1장. 블라인드 글은 `bodyHidden: true` 이고 제목·본문이 안내문으로 바뀌어 온다 */
export type PostSummaryDto = {
  id: string;
  regionCode: string;
  /** 저장 시점의 표시명("서울 성동구") */
  regionName: string;
  title: string;
  /** 목록에서는 발췌(최대 120자), 상세에서는 전문 */
  body: string;
  viewCount: number;
  likeCount: number;
  /** 스레드에 실제로 보이는 댓글 수(작성자 삭제 댓글 제외, 블라인드 댓글 포함) */
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  author: PostAuthorDto;
  /** 모더레이션 상태 — 목록에는 `REMOVED` 가 오지 않는다 */
  moderation: ModerationState;
  /** 본문이 가려졌는가(= 안내문으로 대체됐는가) */
  bodyHidden: boolean;
  /** 내가 쓴 글인가(내 프로필 어느 것으로든) */
  mine: boolean;
  /** 내가 좋아요를 눌렀는가 */
  liked: boolean;
};

/** 스레드의 댓글 1건 */
export type PostCommentDto = {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  author: PostAuthorDto;
  moderation: ModerationState;
  bodyHidden: boolean;
  mine: boolean;
  /** 내가 지울 수 있는가(= 내 댓글이고 아직 살아 있다) */
  canDelete: boolean;
};

/** 상세 = 목록 카드(본문 전문) + 댓글 + 내가 할 수 있는 것 */
export type PostDetailDto = PostSummaryDto & {
  /** 오래된 순 */
  comments: PostCommentDto[];
  /** 수정·삭제 가능(내 글 + 정상 상태) */
  canEdit: boolean;
  /** 좋아요·댓글·신고 가능(정상 상태) */
  canInteract: boolean;
};

/** 화면의 지역 셀렉트 항목 — `features/community/regions.ts` 상수표에서 온다 */
export type RegionOptionDto = { code: string; name: string; label: string };

/** `GET /api/posts` 응답 */
export type PostListResult = {
  posts: PostSummaryDto[];
  /** 다음 페이지 커서. `null` 이면 끝 */
  nextCursor: string | null;
  sort: PostSort;
  region: RegionOptionDto;
};

/** `POST·PATCH /api/posts…` 응답 */
export type PostResult = { post: PostDetailDto };

/** `POST·DELETE /api/posts/[id]/like` 응답 */
export type LikeResult = { liked: boolean; likeCount: number };

/** `GET /api/posts/[id]/comments` 응답 */
export type CommentListResult = { comments: PostCommentDto[] };

/** `POST /api/posts/[id]/comments` 응답 — 갱신된 스레드를 함께 준다 */
export type CommentResult = { comment: PostCommentDto; post: PostDetailDto };

/** `DELETE /api/comments/[id]` 응답 */
export type CommentDeleteResult = { post: PostDetailDto };

/** `DELETE /api/posts/[id]` 응답 */
export type PostDeleteResult = { deleted: true; postId: string };

// ── 신고 (T4.2) ─────────────────────────────────────────────────────────────

/** 신고 사유 선택지 — 화면 라디오와 서버 검증이 같은 배열을 본다 */
export const REPORT_REASONS = [
  "광고·홍보성 글",
  "욕설·비방",
  "허위·사기 의심",
  "음란·불쾌감",
  "기타",
] as const;
export type ReportReasonPreset = (typeof REPORT_REASONS)[number];

/** 신고 접수 결과 — 같은 사람이 같은 대상을 또 신고하면 `duplicated: true` 로 기존 건을 돌려준다 */
export type ReportDto = {
  id: string;
  targetType: ReportTargetTypeValue;
  targetId: string;
  reason: string;
  status: ReportStatusValue;
  createdAt: string;
};
export type ReportResult = { report: ReportDto; duplicated: boolean };

/** 어드민 큐가 그리는 대상 미리보기 */
export type ReportTargetPreviewDto = {
  type: ReportTargetTypeValue;
  id: string;
  /** 글이면 자기 자신, 댓글이면 달린 원글 id — 어드민이 원글로 이동할 때 쓴다 */
  postId: string;
  /** 댓글이면 원글 제목, 글이면 자기 제목 */
  postTitle: string;
  regionName: string;
  /** 원문 그대로 — 어드민은 블라인드된 글도 원문을 본다(moderation.ts 규칙표) */
  body: string;
  authorName: string;
  authorProfileType: ProfileTypeValue;
  createdAt: string;
  moderation: ModerationState;
};

/** 어드민이 누를 수 있는 버튼 — **화면은 이 배열을 그대로 그린다**(규칙을 들지 않는다) */
export type ReportActionValue = "BLIND" | "DISMISS";
export type ReportActionOptionDto = {
  action: ReportActionValue;
  label: string;
  /** `Badge`·버튼 톤 — 어드민에 색을 하드코딩하지 않게 응답이 실어 보낸다 */
  tone: "danger" | "neutral";
  description: string;
};

/** 어드민 큐의 신고 1건 */
export type AdminReportDto = {
  id: string;
  targetType: ReportTargetTypeValue;
  targetId: string;
  reason: string;
  status: ReportStatusValue;
  statusLabel: string;
  statusTone: "warning" | "danger" | "neutral";
  createdAt: string;
  reporterName: string;
  reporterProfileType: ProfileTypeValue;
  handledByName: string | null;
  handledAt: string | null;
  /** 같은 대상에 걸려 있는 다른 **대기** 신고 수 */
  openSiblingCount: number;
  target: ReportTargetPreviewDto | null;
  availableActions: ReportActionOptionDto[];
};

/** `GET /api/reports` 응답 */
export type ReportQueueResult = {
  reports: AdminReportDto[];
  counts: Record<ReportStatusValue, number>;
};

/** `POST /api/reports/[id]/action` 응답 */
export type ReportActionResult = {
  report: AdminReportDto;
  /** 같은 대상의 다른 대기 신고까지 함께 닫혔으면 그 id 들 */
  alsoClosedReportIds: string[];
};
