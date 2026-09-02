/**
 * 커뮤니티 권한 가드 — **판정의 단일 출처** (T4.1·T4.2).
 *
 * ```ts
 * const session = await requireCommunityProfile();
 * if (session.response) return session.response;   // 401 · 403
 *
 * const owned = await requireOwnPost(session.data, id);
 * if (owned.response) return owned.response;       // 404 · 403
 * ```
 *
 * ## 상태 코드 규칙 (T1.1·T2.4·T2.6 과 같다)
 *
 * | 상황 | status · code |
 * |---|---|
 * | 비로그인·만료 세션 | 401 `UNAUTHORIZED` |
 * | 로그인했지만 프로필이 하나도 없음(온보딩 전) | 403 `FORBIDDEN` |
 * | 없는 글·댓글 id, **작성자가 지운 글·댓글** | 404 `NOT_FOUND` |
 * | **남의 글·댓글** 수정·삭제 | 403 `FORBIDDEN` |
 * | 블라인드된 글·댓글에 참여(좋아요·댓글·신고·수정) | 409 `CONFLICT` (라우트가 판정) |
 *
 * ## 어느 프로필로 쓰는가 — **활성 프로필**
 *
 * 커뮤니티는 네 유형 모두의 공용 탭이라 "임대인 API" 처럼 유형으로 프로필을 고를 수 없다.
 * 그래서 **활성 프로필 쿠키**(`zari_profile`, T0.5)가 가리키는 프로필로 쓰고, 그 유형이
 * 목록의 배지가 된다("임대인" · "세입자" …). 프로필을 바꿔 달고 쓰는 것이 자연스럽다.
 *
 * 반대로 **"내 글인가" 는 계정 단위로 본다**(`profileIds` 전체와 비교) — 세입자 프로필로 쓴 글을
 * 임대인 프로필로 전환한 뒤에도 지울 수 있어야 하기 때문이다. 쓰기는 활성 프로필, 소유는 계정.
 *
 * ## 어드민 판정은 **환급 심사와 같은 함수**를 쓴다
 *
 * 신고 큐도 어드민 앱(3001)이 로그인 없이 `x-admin-secret` 으로 web 을 부르는 구조라
 * 판정 규칙이 T2.5 와 완전히 같다. 규칙을 한 벌 더 만들면 한쪽만 고쳐서 구멍이 나므로
 * `features/refund/ownership.ts` 의 `requireRefundAdmin` 을 **그대로 다시 내보낸다**
 * (T6.3 이 어드민 로그인을 붙이면 두 큐가 함께 바뀐다). 이름만 도메인에 맞게 바꿨다.
 */
import { prisma, type Comment, type Post, type Profile } from "@zari/db";
import type { Guarded } from "@/features/landlord/ownership";
import { requireRefundAdmin } from "@/features/refund/ownership";
import { fail } from "@/lib/api/response";
import { getActiveProfile, getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { moderationStateOf, type ModerationState } from "./moderation";

export { ADMIN_SECRET_HEADER, type AdminActor } from "@/features/refund/ownership";

/**
 * 신고 큐 어드민 판정 — **`User.isAdmin` 이 유일한 기준**이고, 통로는 세션 쿠키와
 * 서비스 시크릿(`x-admin-secret`) 둘이다. 자세한 표는 `features/refund/ownership.ts` 참고.
 */
export const requireModerationAdmin = requireRefundAdmin;

/** 로그인 사용자 + 글을 남길 프로필(활성) + 계정의 모든 프로필 id */
export type CommunitySession = {
  user: SessionUser;
  /** 활성 프로필 — 새 글·댓글·좋아요·신고의 주인 */
  profile: Profile;
  /** 계정이 가진 모든 프로필 id — "내 글" 판정용 */
  profileIds: string[];
};

/** 조회 함수가 DTO 를 만들 때 보는 최소한의 시점 정보 */
export type CommunityViewer = {
  profileIds: string[];
  isAdmin: boolean;
};

export function toViewer(session: CommunitySession): CommunityViewer {
  return { profileIds: session.profileIds, isAdmin: session.user.isAdmin };
}

/** 어드민 전용 시점(신고 큐 미리보기) — 원문을 전부 본다 */
export const ADMIN_VIEWER: CommunityViewer = { profileIds: [], isAdmin: true };

/**
 * 로그인 + 프로필 확인. 401(비로그인) · 403(프로필 없음).
 *
 * 커뮤니티는 유형을 가리지 않으므로 "임대인 프로필이 필요합니다" 같은 유형 조건이 없다 —
 * 온보딩을 마쳐 프로필이 하나라도 있으면 참여할 수 있다.
 */
export async function requireCommunityProfile(): Promise<Guarded<CommunitySession>> {
  const user = await getCurrentUser();
  if (!user) return { response: fail("UNAUTHORIZED", "로그인이 필요합니다.") };

  const profile = await getActiveProfile(user);
  if (!profile) return { response: fail("FORBIDDEN", "프로필이 필요합니다.") };

  return {
    data: { user, profile, profileIds: user.profiles.map((item) => item.id) },
  };
}

/** 글 1건 + 모더레이션 상태. 없으면 null */
export type LoadedPost = { post: Post; state: ModerationState };

export async function loadPost(id: string): Promise<LoadedPost | null> {
  const post = await prisma.post.findUnique({
    where: { id },
    include: { reports: { where: { status: "ACTIONED" }, select: { id: true }, take: 1 } },
  });
  if (!post) return null;
  const { reports, ...rest } = post;
  return {
    post: rest,
    state: moderationStateOf({ deletedAt: post.deletedAt, hasActionedReport: reports.length > 0 }),
  };
}

/**
 * 볼 수 있는 글인지 — 없거나 **작성자가 지운 글**이면 404.
 * 블라인드 글은 통과시킨다(본문 가림은 DTO 가, 참여 차단은 라우트가 한다).
 */
export async function requireVisiblePost(id: string): Promise<Guarded<LoadedPost>> {
  const loaded = await loadPost(id);
  if (!loaded || loaded.state === "REMOVED") {
    return { response: fail("NOT_FOUND", "글을 찾을 수 없습니다.") };
  }
  return { data: loaded };
}

/** 내 글인지 — 404(없음·삭제됨) · 403(남의 글) */
export async function requireOwnPost(
  session: CommunitySession,
  id: string,
): Promise<Guarded<LoadedPost>> {
  const visible = await requireVisiblePost(id);
  if (visible.response) return { response: visible.response };

  if (!session.profileIds.includes(visible.data.post.authorProfileId)) {
    return { response: fail("FORBIDDEN", "내 글만 수정·삭제할 수 있습니다.") };
  }
  return { data: visible.data };
}

/** 댓글 1건 + 모더레이션 상태 */
export type LoadedComment = { comment: Comment; state: ModerationState };

export async function loadComment(id: string): Promise<LoadedComment | null> {
  const comment = await prisma.comment.findUnique({
    where: { id },
    include: { reports: { where: { status: "ACTIONED" }, select: { id: true }, take: 1 } },
  });
  if (!comment) return null;
  const { reports, ...rest } = comment;
  return {
    comment: rest,
    state: moderationStateOf({
      deletedAt: comment.deletedAt,
      hasActionedReport: reports.length > 0,
    }),
  };
}

/** 볼 수 있는 댓글인지 — 없거나 작성자가 지웠으면 404 */
export async function requireVisibleComment(id: string): Promise<Guarded<LoadedComment>> {
  const loaded = await loadComment(id);
  if (!loaded || loaded.state === "REMOVED") {
    return { response: fail("NOT_FOUND", "댓글을 찾을 수 없습니다.") };
  }
  return { data: loaded };
}

/** 내 댓글인지 — 404(없음·삭제됨) · 403(남의 댓글) */
export async function requireOwnComment(
  session: CommunitySession,
  id: string,
): Promise<Guarded<LoadedComment>> {
  const visible = await requireVisibleComment(id);
  if (visible.response) return { response: visible.response };

  if (!session.profileIds.includes(visible.data.comment.authorProfileId)) {
    return { response: fail("FORBIDDEN", "내 댓글만 삭제할 수 있습니다.") };
  }
  return { data: visible.data };
}
