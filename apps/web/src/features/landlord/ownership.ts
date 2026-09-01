/**
 * 임대인 소유권 가드 (T1.1) — **Phase 1 전체가 재사용한다.**
 *
 * 임대인 화면·API 는 예외 없이 "이 건물/호실이 로그인한 임대인 프로필 것인가" 를 먼저 묻는다.
 * 그 판정을 여기 한 곳에 모아 두고, 라우트 핸들러는 결과만 early return 한다.
 *
 * ```ts
 * const landlord = await requireLandlord();
 * if (landlord.response) return landlord.response;          // 401 · 403
 *
 * const owned = await requireOwnedBuilding(landlord.data, id);
 * if (owned.response) return owned.response;                // 404 · 403
 * const building = owned.data;
 * ```
 *
 * 반환 형태(`Guarded<T>`)는 `lib/api/response.ts` 의 `Parsed<T>` 와 같은 규약이다 —
 * 성공하면 `{ data }`, 실패하면 `{ response }`(이미 D1 규약 본문이 담긴 Response).
 *
 * ## 상태 코드 규칙
 *
 * | 상황 | status · code |
 * |---|---|
 * | 비로그인·만료 세션 | 401 `UNAUTHORIZED` |
 * | 로그인했지만 임대인 프로필이 없음 | 403 `FORBIDDEN` |
 * | 없는 건물·호실 id | 404 `NOT_FOUND` |
 * | 남의 건물·호실 | 403 `FORBIDDEN` |
 *
 * 남의 자원을 404 로 감추지 않고 403 으로 돌려준다 — 데모 계정이 서로를 아는 폐쇄 환경이고,
 * task 최소 테스트가 "타인 건물 403" 을 요구한다.
 */
import { prisma, ProfileType, type Building, type Profile, type Unit } from "@zari/db";
import { fail } from "@/lib/api/response";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";

/** 성공하면 `{ data }`, 실패하면 `{ response }` — 호출부에서 early return 한다. */
export type Guarded<T> =
  | { data: T; response?: undefined }
  | { data?: undefined; response: Response };

/** 로그인 사용자 + 그 계정의 임대인 프로필 */
export type LandlordSession = { user: SessionUser; profile: Profile };

/** 호실 + 그 호실이 속한 건물 (소유권 판정은 건물의 `ownerProfileId` 로 한다) */
export type UnitWithBuilding = Unit & { building: Building };

/**
 * 계정의 임대인 프로필을 고른다.
 * `@@unique([userId, type])` 라 유형별로 최대 1개다 — 활성 프로필 쿠키와 무관하게 유형으로 찾는다
 * (임대인 화면은 임대인 프로필로만 동작하므로 쿠키가 세입자를 가리켜도 결과가 같아야 한다).
 */
export function findLandlordProfile(user: SessionUser): Profile | null {
  return user.profiles.find((profile) => profile.type === ProfileType.LANDLORD) ?? null;
}

/** 로그인 + 임대인 프로필 확인. 401(비로그인) · 403(임대인 프로필 없음). */
export async function requireLandlord(): Promise<Guarded<LandlordSession>> {
  const user = await getCurrentUser();
  if (!user) return { response: fail("UNAUTHORIZED", "로그인이 필요합니다.") };

  const profile = findLandlordProfile(user);
  if (!profile) {
    return { response: fail("FORBIDDEN", "임대인 프로필이 필요합니다.") };
  }
  return { data: { user, profile } };
}

/** 내 건물인지 확인. 404(없음) · 403(남의 건물). */
export async function requireOwnedBuilding(
  landlord: LandlordSession,
  buildingId: string,
): Promise<Guarded<Building>> {
  const building = await prisma.building.findUnique({ where: { id: buildingId } });
  if (!building) return { response: fail("NOT_FOUND", "건물을 찾을 수 없습니다.") };
  if (building.ownerProfileId !== landlord.profile.id) {
    return { response: fail("FORBIDDEN", "내 건물만 관리할 수 있습니다.") };
  }
  return { data: building };
}

/** 내 호실인지 확인(호실 → 건물 → 소유자). 404(없음) · 403(남의 호실). */
export async function requireOwnedUnit(
  landlord: LandlordSession,
  unitId: string,
): Promise<Guarded<UnitWithBuilding>> {
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, include: { building: true } });
  if (!unit) return { response: fail("NOT_FOUND", "호실을 찾을 수 없습니다.") };
  if (unit.building.ownerProfileId !== landlord.profile.id) {
    return { response: fail("FORBIDDEN", "내 호실만 관리할 수 있습니다.") };
  }
  return { data: unit };
}
