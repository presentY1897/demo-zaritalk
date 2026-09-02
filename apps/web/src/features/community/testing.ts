/**
 * 커뮤니티·신고 테스트 픽스처 (T4.1·T4.2) — **테스트에서만 import 한다**(앱 코드에서 쓰지 않는다).
 *
 * 커뮤니티는 프로필 유형을 가리지 않으므로 계정 픽스처도 유형을 받는다.
 * 로그인은 T1.1 `features/landlord/testing.ts` 의 `loginAs` 를 그대로 쓴다.
 */
import {
  prisma,
  ProfileType,
  ReportStatus,
  ReportTargetType,
  type Post,
  type Profile,
  type User,
} from "@zari/db";
import { DEFAULT_REGION_CODE, findRegion, regionLabel } from "./regions";

export type CommunityActor = { user: User; profile: Profile };

/** 계정 + 프로필 1개 — 유형은 커뮤니티 배지에 그대로 뜬다 */
export async function createCommunityUser(
  phone: string,
  name: string,
  type: ProfileType = ProfileType.TENANT,
  options: { isAdmin?: boolean } = {},
): Promise<CommunityActor> {
  const user = await prisma.user.create({
    data: { phone, name, isAdmin: options.isAdmin ?? false, profiles: { create: { type } } },
    include: { profiles: true },
  });
  const profile = user.profiles[0];
  if (!profile) throw new Error("프로필 생성 실패");
  return { user, profile };
}

/** 시드 관리자와 같은 번호의 어드민 계정 */
export function createAdminUser(phone = "01000000000", name = "관리자") {
  return createCommunityUser(phone, name, ProfileType.LANDLORD, { isAdmin: true });
}

export type PostOverrides = {
  regionCode?: string;
  title?: string;
  body?: string;
  likeCount?: number;
  viewCount?: number;
  createdAt?: Date;
  deletedAt?: Date | null;
};

/**
 * 글 1건. `likeCount` 를 직접 넣을 수 있다 — 인기 탭 정렬·커서 경계 검증에서
 * `PostLike` 를 일일이 만들지 않고 순서를 짜기 위해서다(정합성 검증은 좋아요 토글 테스트가 한다).
 */
export async function createPost(
  authorProfileId: string,
  overrides: PostOverrides = {},
): Promise<Post> {
  const region = findRegion(overrides.regionCode ?? DEFAULT_REGION_CODE)!;
  return prisma.post.create({
    data: {
      authorProfileId,
      regionCode: region.code,
      regionName: regionLabel(region),
      title: overrides.title ?? "관리비가 갑자기 올랐어요",
      body: overrides.body ?? "이번 달 관리비가 두 배가 됐는데 다들 어떠신가요?",
      likeCount: overrides.likeCount ?? 0,
      viewCount: overrides.viewCount ?? 0,
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
      ...(overrides.deletedAt !== undefined ? { deletedAt: overrides.deletedAt } : {}),
    },
  });
}

/** 같은 지역에 글 n개 — 커서 페이지네이션 경계 검증용. 반환은 **정렬된 기대 순서**가 아니다 */
export async function createPosts(
  authorProfileId: string,
  count: number,
  overridesFor: (index: number) => PostOverrides = () => ({}),
): Promise<Post[]> {
  const posts: Post[] = [];
  for (let index = 0; index < count; index += 1) {
    posts.push(await createPost(authorProfileId, overridesFor(index)));
  }
  return posts;
}

export function addComment(postId: string, authorProfileId: string, body = "저희도 그래요.") {
  return prisma.comment.create({ data: { postId, authorProfileId, body } });
}

/** 좋아요 1건 + 비정규화 카운트 동기화 — "이미 눌린 상태" 를 만들 때 쓴다 */
export async function addLike(postId: string, profileId: string) {
  await prisma.postLike.create({ data: { postId, profileId } });
  const likeCount = await prisma.postLike.count({ where: { postId } });
  await prisma.post.update({ where: { id: postId }, data: { likeCount } });
}

export type ReportOverrides = {
  reason?: string;
  status?: ReportStatus;
  handledById?: string;
  handledAt?: Date;
};

export function addPostReport(
  postId: string,
  reporterProfileId: string,
  overrides: ReportOverrides = {},
) {
  return prisma.report.create({
    data: {
      targetType: ReportTargetType.POST,
      postId,
      reporterProfileId,
      reason: overrides.reason ?? "광고·홍보성 글",
      status: overrides.status ?? ReportStatus.OPEN,
      handledById: overrides.handledById,
      handledAt: overrides.handledAt,
    },
  });
}

export function addCommentReport(
  commentId: string,
  reporterProfileId: string,
  overrides: ReportOverrides = {},
) {
  return prisma.report.create({
    data: {
      targetType: ReportTargetType.COMMENT,
      commentId,
      reporterProfileId,
      reason: overrides.reason ?? "욕설·비방",
      status: overrides.status ?? ReportStatus.OPEN,
      handledById: overrides.handledById,
      handledAt: overrides.handledAt,
    },
  });
}

/** 이미 블라인드된 글 — 처리된 신고 + `deletedAt` 이 함께 있어야 블라인드로 판정된다 */
export async function blindPost(postId: string, reporterProfileId: string, adminUserId: string) {
  const handledAt = new Date();
  await prisma.post.update({ where: { id: postId }, data: { deletedAt: handledAt } });
  return addPostReport(postId, reporterProfileId, {
    status: ReportStatus.ACTIONED,
    handledById: adminUserId,
    handledAt,
  });
}

/** 이미 블라인드된 댓글 */
export async function blindComment(
  commentId: string,
  reporterProfileId: string,
  adminUserId: string,
) {
  const handledAt = new Date();
  await prisma.comment.update({ where: { id: commentId }, data: { deletedAt: handledAt } });
  return addCommentReport(commentId, reporterProfileId, {
    status: ReportStatus.ACTIONED,
    handledById: adminUserId,
    handledAt,
  });
}
