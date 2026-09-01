/**
 * 계약·수납 API 테스트 픽스처 (T1.2·T1.5) — **테스트에서만 import 한다**.
 * 계정·건물·호실은 T1.1 의 `features/landlord/testing.ts` 를 그대로 재사용하고,
 * 여기서는 계약·청구·납부를 얹는 헬퍼만 더한다.
 */
import { LeaseStatus, PaymentMethod, prisma } from "@zari/db";
import { createBuildingWithUnits, createLandlord } from "@/features/landlord/testing";
import { buildChargeDraft, kstToday, kstYearMonth, utcDate } from "@/lib/rent";

/** 임대인 + 건물 + 호실 1개 — 대부분의 테스트가 여기서 시작한다 */
export async function createLandlordWithUnit(
  phone = "01011111111",
  labels: string[] = ["201호"],
) {
  const me = await createLandlord(phone);
  const building = await createBuildingWithUnits(me.profile.id, labels);
  const unit = building.units[0];
  if (!unit) throw new Error("호실 생성 실패");
  return { ...me, building, unit, units: building.units };
}

export const DEFAULT_TERMS = {
  monthlyRent: 650_000,
  maintenanceFee: 50_000,
  paymentDay: 5,
  lateFeeRatePct: 5,
};

/** 이번 달을 포함하는 1년짜리 계약 기간(`YYYY-MM-DD`) */
export function currentPeriod(): { startDate: string; endDate: string } {
  const { year, month } = kstYearMonth();
  const start = utcDate(year, month, 1);
  const end = utcDate(year + 1, month, 1);
  end.setUTCDate(end.getUTCDate() - 1);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

/** 계약 1건 + (옵션) 당월 청구 — 청구 금액은 원장 엔진 draft 그대로다 */
export async function createLeaseWithCharge(
  unitId: string,
  options: {
    status?: (typeof LeaseStatus)[keyof typeof LeaseStatus];
    withCharge?: boolean;
    tenantProfileId?: string;
  } = {},
) {
  const period = currentPeriod();
  const lease = await prisma.lease.create({
    data: {
      unitId,
      tenantName: "박세입",
      tenantPhone: "01022222222",
      tenantProfileId: options.tenantProfileId ?? null,
      deposit: 20_000_000,
      ...DEFAULT_TERMS,
      startDate: new Date(`${period.startDate}T00:00:00.000Z`),
      endDate: new Date(`${period.endDate}T00:00:00.000Z`),
      status: options.status ?? LeaseStatus.ACTIVE,
    },
  });

  if (options.withCharge === false) return { lease, charge: null };

  const { year, month } = kstYearMonth();
  const draft = buildChargeDraft({
    lease: DEFAULT_TERMS,
    year,
    month,
    previousCharge: null,
    asOf: kstToday(),
  });
  const charge = await prisma.rentCharge.create({ data: { leaseId: lease.id, ...draft } });
  return { lease, charge };
}

/** 납부 1건 직접 적재(재계산 경로를 거치지 않는다 — 삭제 테스트의 사전 상태용) */
export async function addPayment(
  chargeId: string,
  amount: number,
  method: (typeof PaymentMethod)[keyof typeof PaymentMethod] = PaymentMethod.MANUAL_CHECK,
) {
  return prisma.rentPayment.create({ data: { chargeId, amount, method } });
}
