/**
 * 계약·청구·납부 소유권 가드 (T1.2·T1.5).
 *
 * 로그인·임대인 프로필 판정은 T1.1 의 `features/landlord/ownership.ts` 를 **그대로 재사용**하고
 * (`requireLandlord`·`requireOwnedUnit`), 여기서는 계약 → 호실 → 건물 → 소유자로 한 단계씩
 * 더 내려가는 가드만 더한다. 상태 코드 규칙도 T1.1 과 같다:
 *
 * | 상황 | status · code |
 * |---|---|
 * | 비로그인·만료 세션 | 401 `UNAUTHORIZED` |
 * | 로그인했지만 임대인 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 계약·청구·납부 id | 404 `NOT_FOUND` |
 * | 타인의 계약·청구·납부 | 403 `FORBIDDEN` |
 */
import { prisma, type Building, type Lease, type Unit } from "@zari/db";
import type { Guarded, LandlordSession } from "@/features/landlord/ownership";
import { fail } from "@/lib/api/response";

/**
 * 계약 + 호실 + 건물. 고지서 템플릿(T1.7)이 건물명·호실 라벨을 쓰므로 한 번에 실어 온다 —
 * 소유권 판정이 두 곳에 갈라지지 않게 이 프로젝트의 유일한 계약 가드로 쓴다.
 */
export type OwnedLease = Lease & { unit: Unit & { building: Building } };

/** @deprecated `OwnedLease` 와 같다. T1.7 이 쓰던 이름을 호환용으로 남긴다. */
export type LeaseWithUnit = OwnedLease;

/** 내 계약인지 확인(계약 → 호실 → 건물 → 소유자). 404(없음) · 403(남의 계약). */
export async function requireOwnedLease(
  landlord: LandlordSession,
  leaseId: string,
): Promise<Guarded<OwnedLease>> {
  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: { unit: { include: { building: true } } },
  });
  if (!lease) return { response: fail("NOT_FOUND", "계약을 찾을 수 없습니다.") };
  if (lease.unit.building.ownerProfileId !== landlord.profile.id) {
    return { response: fail("FORBIDDEN", "내 계약만 관리할 수 있습니다.") };
  }
  return { data: lease };
}

export type OwnedCharge = {
  id: string;
  leaseId: string;
  dueDate: Date;
  totalDue: number;
  paidAmount: number;
};

/** 내 청구인지 확인. 404(없음) · 403(남의 청구). */
export async function requireOwnedCharge(
  landlord: LandlordSession,
  chargeId: string,
): Promise<Guarded<OwnedCharge>> {
  const charge = await prisma.rentCharge.findUnique({
    where: { id: chargeId },
    include: {
      lease: { include: { unit: { include: { building: { select: { ownerProfileId: true } } } } } },
    },
  });
  if (!charge) return { response: fail("NOT_FOUND", "청구를 찾을 수 없습니다.") };
  if (charge.lease.unit.building.ownerProfileId !== landlord.profile.id) {
    return { response: fail("FORBIDDEN", "내 청구만 관리할 수 있습니다.") };
  }
  return { data: charge };
}

export type OwnedPayment = {
  id: string;
  chargeId: string;
  amount: number;
  method: "MANUAL_CHECK" | "VIRTUAL_TRANSFER" | "CARD";
};

/** 내 납부 기록인지 확인. 404(없음) · 403(남의 납부). */
export async function requireOwnedPayment(
  landlord: LandlordSession,
  paymentId: string,
): Promise<Guarded<OwnedPayment>> {
  const payment = await prisma.rentPayment.findUnique({
    where: { id: paymentId },
    include: {
      charge: {
        include: {
          lease: {
            include: { unit: { include: { building: true } } },
          },
        },
      },
    },
  });
  if (!payment) return { response: fail("NOT_FOUND", "납부 기록을 찾을 수 없습니다.") };
  if (payment.charge.lease.unit.building.ownerProfileId !== landlord.profile.id) {
    return { response: fail("FORBIDDEN", "내 납부 기록만 관리할 수 있습니다.") };
  }
  return { data: payment };
}
