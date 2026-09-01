/**
 * 고지서 API 테스트 픽스처 (T1.7 · T1.8) — **테스트에서만 import 한다**.
 *
 * 계정·건물은 T1.1 의 `features/landlord/testing.ts` 를 그대로 재사용하고,
 * 여기서는 계약·청구(시드 201호 시나리오와 같은 금액)만 더한다.
 */
import { ChargeStatus, LeaseStatus, prisma } from "@zari/db";
import { createBuildingWithUnits, createLandlord } from "@/features/landlord/testing";

/** `@db.Date` 컬럼용 — UTC 자정 (시드의 `d()` 와 같은 규칙) */
export const d = (value: string): Date => new Date(`${value}T00:00:00Z`);

export type NoticeScenario = Awaited<ReturnType<typeof createNoticeScenario>>;

/**
 * 임대인 1 + 건물 1(호실 201호) + ACTIVE 계약 1 + 8월 연체 청구 1.
 * 금액은 시드(`packages/db/prisma/seed.ts`) 8월분과 같다 — 이월 300,000 · 연체료 15,500.
 */
export async function createNoticeScenario(
  options: { phone?: string; name?: string; tenantPhone?: string } = {},
) {
  const landlord = await createLandlord(options.phone ?? "01011111111", options.name ?? "김임대");
  const building = await createBuildingWithUnits(landlord.profile.id, ["201호"]);
  const unit = building.units[0];
  if (!unit) throw new Error("호실 생성 실패");

  const lease = await prisma.lease.create({
    data: {
      unitId: unit.id,
      tenantName: "박세입",
      tenantPhone: options.tenantPhone ?? "01022222222",
      deposit: 20_000_000,
      monthlyRent: 650_000,
      maintenanceFee: 50_000,
      paymentDay: 5,
      startDate: d("2026-03-01"),
      endDate: d("2027-02-28"),
      lateFeeRatePct: 5,
      status: LeaseStatus.ACTIVE,
    },
  });

  const charge = await prisma.rentCharge.create({
    data: {
      leaseId: lease.id,
      year: 2026,
      month: 8,
      dueDate: d("2026-08-05"),
      rentAmount: 650_000,
      maintenanceAmount: 50_000,
      carriedOverAmount: 300_000,
      lateFeeAmount: 15_500,
      totalDue: 1_015_500,
      paidAmount: 0,
      status: ChargeStatus.OVERDUE,
    },
  });

  return { landlord, building, unit, lease, charge };
}

/** 공개 고지서 1건(토큰 지정). 기본은 아직 열람 전. */
export async function createNoticeLog(
  input: {
    token: string;
    leaseId: string;
    chargeId?: string | null;
    toPhone?: string;
    openedAt?: Date | null;
  },
) {
  return prisma.messageLog.create({
    data: {
      kind: "RENT_NOTICE",
      toPhone: input.toPhone ?? "01022222222",
      title: "2026년 8월 월세 고지서",
      body: "행당해피빌 201호 8월분 고지서입니다.",
      token: input.token,
      leaseId: input.leaseId,
      chargeId: input.chargeId ?? null,
      openedAt: input.openedAt ?? null,
    },
  });
}
