/**
 * 자리페이 소유권 가드 (T2.1).
 *
 * 세입자 판정은 T1.3 `features/tenant/ownership.ts` 의 `requireTenant` 를 **그대로 재사용**하고,
 * 여기서는 "이 청구가 내가 수락한 계약의 청구인가" 한 단계만 더 내려간다.
 *
 * T1.3 이 대기 계약을 **전화번호**로 판정하는 것과 달리 결제는 **`tenantProfileId`** 로 판정한다 —
 * 수락 전(PENDING_TENANT) 계약은 아직 내 계약이 아니고, 돈을 받기 전에 계약이 성립해야 하기 때문이다.
 *
 * | 상황 | status · code |
 * |---|---|
 * | 비로그인·만료 세션 | 401 `UNAUTHORIZED` |
 * | 로그인했지만 세입자 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 청구 id | 404 `NOT_FOUND` |
 * | **내 계약의 청구가 아님** | 403 `FORBIDDEN` |
 */
import { prisma } from "@zari/db";
import type { Guarded } from "@/features/landlord/ownership";
import type { ChargeStatusValue } from "@/features/lease/types";
import type { TenantSession } from "@/features/tenant/ownership";
import { fail } from "@/lib/api/response";

/** 결제에 필요한 만큼의 청구 + 계약 + 호실·건물 + 임대인 이름 */
export type PayableCharge = {
  id: string;
  leaseId: string;
  year: number;
  month: number;
  dueDate: Date;
  totalDue: number;
  paidAmount: number;
  status: ChargeStatusValue;
  lease: {
    id: string;
    tenantProfileId: string | null;
    tenantName: string;
    unit: {
      label: string;
      building: { name: string; ownerProfile: { user: { name: string } } };
    };
  };
};

/** 청구 → 계약 → 호실 → 건물 → 임대인까지 한 번에 읽는 include */
export const payableChargeInclude = {
  lease: {
    include: {
      unit: {
        include: { building: { include: { ownerProfile: { include: { user: true } } } } },
      },
    },
  },
} as const;

/** 내가 수락한 계약의 청구인지 확인. 404(없음) · 403(남의 청구). */
export async function requireTenantCharge(
  tenant: TenantSession,
  chargeId: string,
): Promise<Guarded<PayableCharge>> {
  const charge = await prisma.rentCharge.findUnique({
    where: { id: chargeId },
    include: payableChargeInclude,
  });
  if (!charge) return { response: fail("NOT_FOUND", "청구를 찾을 수 없습니다.") };
  if (charge.lease.tenantProfileId !== tenant.profile.id) {
    return { response: fail("FORBIDDEN", "내 계약의 청구만 결제할 수 있습니다.") };
  }
  return { data: charge };
}
