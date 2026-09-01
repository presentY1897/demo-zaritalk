/**
 * 세입자 소유권 가드 (T1.3).
 *
 * 임대인 쪽(T1.1 `features/landlord/ownership.ts`)과 **같은 규약**을 세입자 시점으로 뒤집은 것이다.
 * 임대인은 "이 계약이 내 건물인가"로 판정하지만, 세입자는 아직 계약에 연결되기 **전**이라
 * 판정 기준이 **전화번호**다 — 임대인이 적어 둔 `Lease.tenantPhone` 과 내 계정의 번호가 같은가.
 *
 * ```ts
 * const tenant = await requireTenant();
 * if (tenant.response) return tenant.response;            // 401 · 403
 *
 * const matched = await requireMatchedLease(tenant.data, id);
 * if (matched.response) return matched.response;          // 404 · 403
 * ```
 *
 * ## 상태 코드 규칙 (T1.1·T1.2 와 같다)
 *
 * | 상황 | status · code |
 * |---|---|
 * | 비로그인·만료 세션 | 401 `UNAUTHORIZED` |
 * | 로그인했지만 세입자 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 계약 id | 404 `NOT_FOUND` |
 * | **내 번호로 등록된 계약이 아님** | 403 `FORBIDDEN` |
 *
 * 번호가 다른 계약을 404 로 감추지 않고 403 으로 돌려주는 것도 T1.1 과 같은 선택이다
 * (데모 계정이 서로를 아는 폐쇄 환경 + task 최소 테스트가 "전화번호 불일치 403" 을 요구한다).
 */
import { prisma, ProfileType, type Building, type Lease, type Profile, type Unit } from "@zari/db";
import type { Guarded } from "@/features/landlord/ownership";
import { fail } from "@/lib/api/response";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/phone";

/** 로그인 사용자 + 그 계정의 세입자 프로필 */
export type TenantSession = { user: SessionUser; profile: Profile };

/** 계약 + 호실 + 건물 — 화면 문구("행당해피빌 202호")와 청구 생성에 필요한 만큼 */
export type MatchedLease = Lease & { unit: Unit & { building: Building } };

/**
 * 계정의 세입자 프로필을 고른다.
 * `@@unique([userId, type])` 라 유형별 최대 1개다 — 활성 프로필 쿠키와 무관하게 유형으로 찾는다
 * (임대인 프로필이 활성이어도 세입자 API 결과가 달라지면 안 된다. T1.1 `findLandlordProfile` 과 같은 규칙).
 */
export function findTenantProfile(user: SessionUser): Profile | null {
  return user.profiles.find((profile) => profile.type === ProfileType.TENANT) ?? null;
}

/** 로그인 + 세입자 프로필 확인. 401(비로그인) · 403(세입자 프로필 없음). */
export async function requireTenant(): Promise<Guarded<TenantSession>> {
  const user = await getCurrentUser();
  if (!user) return { response: fail("UNAUTHORIZED", "로그인이 필요합니다.") };

  const profile = findTenantProfile(user);
  if (!profile) return { response: fail("FORBIDDEN", "세입자 프로필이 필요합니다.") };
  return { data: { user, profile } };
}

/**
 * 내 번호로 등록된 계약인지 확인. 404(없는 계약) · 403(번호 불일치).
 *
 * 비교는 양쪽 다 `normalizePhone` 을 태운 뒤에 한다 — 저장 시점에도 정규화하지만
 * (T0.3 `phoneSchema`) 시드·수기 입력이 하이픈을 남길 수 있으므로 판정에서 한 번 더 맞춘다.
 * **상태(PENDING_TENANT 인지)는 여기서 보지 않는다** — 수락과 거절이 요구하는 상태가 달라서
 * 409 판정은 각 라우트가 한다.
 */
export async function requireMatchedLease(
  tenant: TenantSession,
  leaseId: string,
): Promise<Guarded<MatchedLease>> {
  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: { unit: { include: { building: true } } },
  });
  if (!lease) return { response: fail("NOT_FOUND", "계약을 찾을 수 없습니다.") };
  if (normalizePhone(lease.tenantPhone) !== normalizePhone(tenant.user.phone)) {
    return { response: fail("FORBIDDEN", "내 번호로 등록된 계약이 아닙니다.") };
  }
  return { data: lease };
}
