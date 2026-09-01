/**
 * 계약 소유권 가드 (T1.7) — 임대인이 **자기 계약에만** 고지서를 보낼 수 있게 한다.
 *
 * 판정 규칙·응답 코드는 T1.1 `features/landlord/ownership.ts` 와 같다(401·403·404).
 * 그 파일에 `requireOwnedLease` 를 더하지 않고 여기 둔 이유는 **T1.2(계약)가 같은 파일을
 * 동시에 손대고 있기 때문**이다 — 머지 시 T1.2 가 같은 헬퍼를 만들었다면 그쪽으로 합치고
 * 이 파일은 지운다(중복 판정이 두 곳에 남지 않게).
 */
import { prisma, type Building, type Lease, type Unit } from "@zari/db";
import { type Guarded, type LandlordSession } from "@/features/landlord/ownership";
import { fail } from "@/lib/api/response";

export type LeaseWithUnit = Lease & { unit: Unit & { building: Building } };

/** 내 계약인지 확인(계약 → 호실 → 건물 → 소유자). 404(없음) · 403(남의 계약). */
export async function requireOwnedLease(
  landlord: LandlordSession,
  leaseId: string,
): Promise<Guarded<LeaseWithUnit>> {
  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: { unit: { include: { building: true } } },
  });
  if (!lease) return { response: fail("NOT_FOUND", "계약을 찾을 수 없습니다.") };
  if (lease.unit.building.ownerProfileId !== landlord.profile.id) {
    return { response: fail("FORBIDDEN", "내 계약에만 고지서를 보낼 수 있습니다.") };
  }
  return { data: lease };
}
