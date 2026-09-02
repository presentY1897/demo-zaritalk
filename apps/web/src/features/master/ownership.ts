/**
 * 마스터 소유권 가드 (T5.2).
 *
 * 임대인(T1.1)·세입자(T1.3)·민원(T2.6) 가드와 **같은 규약**(`Guarded<T>`)이다.
 * 마스터 화면·API 는 예외 없이 "로그인했는가 → 마스터 프로필이 있는가 →
 * 업종·활동지역(`MasterDetail`)이 등록돼 있는가" 를 먼저 묻는다 —
 * 피드·추천은 전부 **업종 + 좌표 + 반경**으로 계산되므로 그 셋이 없으면 화면 자체가 성립하지 않는다.
 *
 * | 상황 | status · code |
 * |---|---|
 * | 비로그인·만료 세션 | 401 `UNAUTHORIZED` |
 * | 마스터 프로필 없음 | 403 `FORBIDDEN` |
 * | 마스터 프로필은 있는데 업종·활동지역 미등록 | 403 `FORBIDDEN` |
 *
 * 프로필은 활성 프로필 쿠키가 아니라 **유형으로** 고른다(`@@unique([userId, type])`) —
 * T1.1 `findLandlordProfile` 과 같은 규칙이다.
 */
import { prisma, ProfileType, type MasterDetail, type Profile } from "@zari/db";
import type { Guarded } from "@/features/landlord/ownership";
import { fail } from "@/lib/api/response";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";

/** 로그인 사용자 + 마스터 프로필 + 업종·활동지역 */
export type MasterSession = {
  user: SessionUser;
  profile: Profile;
  detail: MasterDetail;
};

/** 계정의 마스터 프로필을 고른다(유형별 최대 1개) */
export function findMasterProfile(user: SessionUser): Profile | null {
  return user.profiles.find((profile) => profile.type === ProfileType.MASTER) ?? null;
}

/** 로그인 + 마스터 프로필 + `MasterDetail` 확인. 401 · 403. */
export async function requireMaster(): Promise<Guarded<MasterSession>> {
  const user = await getCurrentUser();
  if (!user) return { response: fail("UNAUTHORIZED", "로그인이 필요합니다.") };

  const profile = findMasterProfile(user);
  if (!profile) return { response: fail("FORBIDDEN", "마스터 프로필이 필요합니다.") };

  const detail = await prisma.masterDetail.findUnique({ where: { profileId: profile.id } });
  if (!detail) {
    return { response: fail("FORBIDDEN", "업종·활동지역을 먼저 등록해 주세요.") };
  }
  return { data: { user, profile, detail } };
}
