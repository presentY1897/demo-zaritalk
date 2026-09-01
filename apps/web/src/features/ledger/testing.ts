/**
 * 임대장부 API 테스트 픽스처 (T1.6) — **테스트에서만 import 한다.**
 *
 * 계정·건물·계약 픽스처는 T1.1 의 `features/landlord/testing.ts` 를 그대로 재사용하고,
 * 여기서는 장부에 필요한 **납부가 딸린 청구**만 더한다.
 */
import { ChargeStatus, PaymentMethod, prisma } from "@zari/db";

/** `@db.Date` 컬럼용 — UTC 자정 (시드의 `d()` 와 같은 규칙) */
export const d = (s: string) => new Date(`${s}T00:00:00Z`);
/** 타임스탬프 컬럼용 — "그날 한국시간 자정" (시드의 `at()` 과 같은 규칙) */
export const at = (s: string) => new Date(`${s}T00:00:00+09:00`);

export type ChargeFixture = {
  year: number;
  month: number;
  /** 없으면 `year-month-05` */
  dueDate?: Date;
  rentAmount?: number;
  maintenanceAmount?: number;
  carriedOverAmount?: number;
  lateFeeAmount?: number;
  status?: (typeof ChargeStatus)[keyof typeof ChargeStatus];
  /** `paidAt` 은 타임스탬프다 — 월 경계 테스트가 여기를 흔든다 */
  payments?: { amount: number; paidAt: Date }[];
};

/** 청구 1건 + 납부들. `totalDue`·`paidAmount` 는 항목·납부 합에서 그대로 계산한다 */
export async function createChargeWithPayments(leaseId: string, fixture: ChargeFixture) {
  const rentAmount = fixture.rentAmount ?? 650_000;
  const maintenanceAmount = fixture.maintenanceAmount ?? 50_000;
  const carriedOverAmount = fixture.carriedOverAmount ?? 0;
  const lateFeeAmount = fixture.lateFeeAmount ?? 0;
  const payments = fixture.payments ?? [];
  const paidAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalDue = rentAmount + maintenanceAmount + carriedOverAmount + lateFeeAmount;

  return prisma.rentCharge.create({
    data: {
      leaseId,
      year: fixture.year,
      month: fixture.month,
      dueDate:
        fixture.dueDate ??
        d(`${fixture.year}-${String(fixture.month).padStart(2, "0")}-05`),
      rentAmount,
      maintenanceAmount,
      carriedOverAmount,
      lateFeeAmount,
      totalDue,
      paidAmount,
      status:
        fixture.status ??
        (paidAmount >= totalDue
          ? ChargeStatus.PAID
          : paidAmount > 0
            ? ChargeStatus.PARTIALLY_PAID
            : ChargeStatus.SCHEDULED),
      payments: {
        create: payments.map((payment) => ({
          amount: payment.amount,
          method: PaymentMethod.MANUAL_CHECK,
          paidAt: payment.paidAt,
        })),
      },
    },
  });
}
