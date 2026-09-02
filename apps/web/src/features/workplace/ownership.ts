/**
 * 근무지 소유권 가드 (T3.4) — **본인 프로필 것만**.
 *
 * 로그인·세입자 프로필 판정은 T1.3 의 `requireTenant`(`features/tenant/ownership.ts`)를
 * 그대로 쓴다. 여기서는 "그 근무지가 내 세입자 프로필 것인가" 한 가지만 더 본다.
 *
 * | 상황 | status · code |
 * |---|---|
 * | 비로그인·만료 세션 | 401 `UNAUTHORIZED` |
 * | 세입자 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 근무지 id | 404 `NOT_FOUND` |
 * | **남의 근무지** | 403 `FORBIDDEN` |
 *
 * 남의 자원을 404 로 감추지 않고 403 을 주는 것은 T1.1·T1.3 과 같은 선택이다.
 */
import { prisma, type Workplace } from "@zari/db";
import type { Guarded } from "@/features/landlord/ownership";
import type { TenantSession } from "@/features/tenant/ownership";
import { fail } from "@/lib/api/response";

export async function requireOwnWorkplace(
  tenant: TenantSession,
  workplaceId: string,
): Promise<Guarded<Workplace>> {
  const workplace = await prisma.workplace.findUnique({ where: { id: workplaceId } });
  if (!workplace) return { response: fail("NOT_FOUND", "근무지를 찾을 수 없습니다.") };
  if (workplace.tenantProfileId !== tenant.profile.id) {
    return { response: fail("FORBIDDEN", "내 근무지만 관리할 수 있습니다.") };
  }
  return { data: workplace };
}
