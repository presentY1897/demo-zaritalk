/**
 * 세입자 API 테스트 픽스처 (T1.3) — **테스트에서만 import 한다**(앱 코드에서 쓰지 않는다).
 * 계정·건물·호실은 T1.1 `features/landlord/testing.ts`, 계약 기본 조건은 T1.2
 * `features/lease/testing.ts` 를 그대로 재사용하고, 여기서는 **대기 계약**만 더한다.
 */
import { LeaseStatus, MessageKind, prisma, ProfileType } from "@zari/db";
import { currentPeriod, DEFAULT_TERMS } from "@/features/lease/testing";
import { buildChargeDraft, kstToday } from "@/lib/rent";

/** 시드의 미가입 세입자(홍미가)와 같은 번호 — 202호 대기 계약이 걸린 번호다 */
export const TENANT_PHONE = "01055555555";

/** 세입자 계정 + TENANT 프로필 */
export async function createTenant(phone = TENANT_PHONE, name = "홍미가") {
  const user = await prisma.user.create({
    data: { phone, name, profiles: { create: { type: ProfileType.TENANT } } },
    include: { profiles: true },
  });
  const profile = user.profiles[0];
  if (!profile) throw new Error("세입자 프로필 생성 실패");
  return { user, profile };
}

export type PendingLeaseOptions = {
  tenantPhone?: string;
  tenantName?: string;
  status?: (typeof LeaseStatus)[keyof typeof LeaseStatus];
  tenantProfileId?: string;
  /** `YYYY-MM-DD` — 기본은 이번 달 1일부터 1년 */
  startDate?: string;
  endDate?: string;
  terms?: Partial<typeof DEFAULT_TERMS>;
  deposit?: number;
};

/** 임대인이 등록해 둔 대기 계약 1건 (청구는 만들지 않는다 — 필요하면 `addCharge`) */
export async function createPendingLease(unitId: string, options: PendingLeaseOptions = {}) {
  const period = currentPeriod();
  return prisma.lease.create({
    data: {
      unitId,
      tenantName: options.tenantName ?? "홍미가",
      tenantPhone: options.tenantPhone ?? TENANT_PHONE,
      tenantProfileId: options.tenantProfileId ?? null,
      deposit: options.deposit ?? 10_000_000,
      ...DEFAULT_TERMS,
      ...options.terms,
      startDate: new Date(`${options.startDate ?? period.startDate}T00:00:00.000Z`),
      endDate: new Date(`${options.endDate ?? period.endDate}T00:00:00.000Z`),
      status: options.status ?? LeaseStatus.PENDING_TENANT,
    },
  });
}

/** 특정 월의 청구 1건 — 금액은 원장 엔진 draft 그대로다(테스트 사전 상태용) */
export async function addCharge(
  lease: { id: string; monthlyRent: number; maintenanceFee: number; paymentDay: number; lateFeeRatePct: number | null },
  ym: { year: number; month: number },
  overrides: { paidAmount?: number } = {},
) {
  const draft = buildChargeDraft({
    lease: {
      monthlyRent: lease.monthlyRent,
      maintenanceFee: lease.maintenanceFee,
      paymentDay: lease.paymentDay,
      lateFeeRatePct: lease.lateFeeRatePct,
    },
    year: ym.year,
    month: ym.month,
    previousCharge: null,
    asOf: kstToday(),
    paidAmount: overrides.paidAmount,
  });
  return prisma.rentCharge.create({
    data: { leaseId: lease.id, ...draft, paidAmount: overrides.paidAmount ?? draft.paidAmount },
  });
}

/** 청구에 납부 1건 (거절 시 "근거 있는 청구는 남긴다" 검증용) */
export async function addPaymentTo(chargeId: string, amount: number) {
  return prisma.rentPayment.create({ data: { chargeId, amount, method: "MANUAL_CHECK" } });
}

/** 청구에 발송 고지서 1건 (T1.7·T1.8 이 만든 공개 고지서를 흉내낸다) */
export async function addNoticeTo(leaseId: string, chargeId: string) {
  return prisma.messageLog.create({
    data: {
      kind: MessageKind.RENT_NOTICE,
      toPhone: TENANT_PHONE,
      title: "월세 고지서",
      body: "고지서입니다.",
      leaseId,
      chargeId,
    },
  });
}
