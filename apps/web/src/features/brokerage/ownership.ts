/**
 * 중개인 가드 (T3.7).
 *
 * 임대인(T1.1)·세입자(T1.3)·마스터(T5.2) 가드와 **같은 규약**(`Guarded<T>`)이다.
 * 중개인 화면·API 는 예외 없이 "로그인했는가 → 중개인 프로필이 있는가 →
 * 활동지역(`RealtorDetail`)이 등록돼 있는가" 를 먼저 묻는다 —
 * 수신함은 전부 **사무소 좌표 + 반경**으로 발송된 것이라 그 둘이 없으면 화면이 성립하지 않는다.
 *
 * | 상황 | status · code |
 * |---|---|
 * | 비로그인·만료 세션 | 401 `UNAUTHORIZED` |
 * | 중개인 프로필 없음 | 403 `FORBIDDEN` |
 * | 중개인 프로필은 있는데 활동지역 미등록 | 403 `FORBIDDEN` |
 * | 없는 타겟 id | 404 `NOT_FOUND` |
 * | **다른 중개인에게 간 타겟** | 403 `FORBIDDEN` |
 *
 * 프로필은 활성 프로필 쿠키가 아니라 **유형으로** 고른다(`@@unique([userId, type])`) —
 * T1.1 `findLandlordProfile` 과 같은 규칙이다.
 */
import { prisma, ProfileType, type Profile, type RealtorDetail } from "@zari/db";
import type { Guarded } from "@/features/landlord/ownership";
import { fail } from "@/lib/api/response";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";

/** 로그인 사용자 + 중개인 프로필 + 활동지역 */
export type RealtorSession = {
  user: SessionUser;
  profile: Profile;
  detail: RealtorDetail;
};

/** 계정의 중개인 프로필을 고른다(유형별 최대 1개) */
export function findRealtorProfile(user: SessionUser): Profile | null {
  return user.profiles.find((profile) => profile.type === ProfileType.REALTOR) ?? null;
}

/** 로그인 + 중개인 프로필 + `RealtorDetail` 확인. 401 · 403. */
export async function requireRealtor(): Promise<Guarded<RealtorSession>> {
  const user = await getCurrentUser();
  if (!user) return { response: fail("UNAUTHORIZED", "로그인이 필요합니다.") };

  const profile = findRealtorProfile(user);
  if (!profile) return { response: fail("FORBIDDEN", "중개인 프로필이 필요합니다.") };

  const detail = await prisma.realtorDetail.findUnique({ where: { profileId: profile.id } });
  if (!detail) {
    return { response: fail("FORBIDDEN", "사무소 위치·활동반경을 먼저 등록해 주세요.") };
  }
  return { data: { user, profile, detail } };
}

/** 타겟 + 그 타겟이 붙은 요청·호실·건물 (응답 처리에 필요한 만큼 전부 읽는다) */
export type OwnedTarget = Awaited<ReturnType<typeof findTargetWithRequest>>;

function findTargetWithRequest(targetId: string) {
  return prisma.brokerageTarget.findUnique({
    where: { id: targetId },
    include: {
      request: {
        include: {
          unit: { include: { building: true } },
          landlordProfile: { include: { user: { select: { name: true, phone: true } } } },
        },
      },
    },
  });
}

/**
 * **내게 온 타겟인지** 확인한다. 404(없는 id) · 403(다른 중개인에게 간 타겟).
 *
 * 남의 타겟을 404 로 감추지 않고 403 을 준다 — T1.1 이 정한 규칙 그대로다
 * (화면은 같은 상황에서 `notFound()` 로 막는다).
 */
export async function requireOwnedTarget(
  session: RealtorSession,
  targetId: string,
): Promise<Guarded<NonNullable<OwnedTarget>>> {
  const target = await findTargetWithRequest(targetId);
  if (!target) return { response: fail("NOT_FOUND", "중개 요청을 찾을 수 없습니다.") };
  if (target.realtorProfileId !== session.profile.id) {
    return { response: fail("FORBIDDEN", "나에게 온 중개 요청만 볼 수 있습니다.") };
  }
  return { data: target };
}
