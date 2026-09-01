/**
 * 일일 크론 통합 테스트 (T1.4) — 실제 DB(`zari_engine_test`)에 쓰고 읽는다.
 *
 * 최소 테스트 축 ① **멱등 생성**과 통합 축(**크론 실행 → 신규 월 청구 + OVERDUE 전환 DB 검증**)이 여기 있다.
 * `runDailyCron({ now })` 로 실행 시각을 못 박아 시계에 의존하지 않는다 —
 * 시나리오는 시드(`packages/db/prisma/seed.ts`)의 201호 계약을 그대로 옮겼다.
 */
import { ChargeStatus, LeaseStatus, MessageKind, prisma, ProfileType } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, describe, expect, test } from "vitest";
import { runDailyCron } from "./cron-runner";
import { utcDate } from "./date";

/** KST 2026-09-01 09:30 — 시드가 상정한 "오늘" */
const NOW = new Date("2026-09-01T00:30:00Z");

type LeaseOverrides = {
  paymentDay?: number;
  lateFeeRatePct?: number | null;
  status?: LeaseStatus;
  startDate?: Date;
  endDate?: Date;
  monthlyRent?: number;
  maintenanceFee?: number;
};

/** 시드 201호와 같은 조건의 계약 하나 (건물·호실 포함) */
async function createLease(overrides: LeaseOverrides = {}) {
  const landlord = await prisma.user.create({
    data: {
      phone: "01011111111",
      name: "김임대",
      profiles: { create: { type: ProfileType.LANDLORD } },
    },
    include: { profiles: true },
  });
  const profileId = landlord.profiles[0]!.id;

  const building = await prisma.building.create({
    data: {
      ownerProfileId: profileId,
      name: "행당해피빌",
      address: "서울 성동구 행당로 79",
      lat: 37.56152,
      lng: 127.03648,
      units: { create: [{ label: "201호", floor: 2 }] },
    },
    include: { units: true },
  });

  return prisma.lease.create({
    data: {
      unitId: building.units[0]!.id,
      tenantName: "박세입",
      tenantPhone: "01022222222",
      deposit: 20_000_000,
      monthlyRent: overrides.monthlyRent ?? 650_000,
      maintenanceFee: overrides.maintenanceFee ?? 50_000,
      paymentDay: overrides.paymentDay ?? 5,
      startDate: overrides.startDate ?? utcDate(2026, 3, 1),
      endDate: overrides.endDate ?? utcDate(2027, 2, 28),
      lateFeeRatePct: overrides.lateFeeRatePct === undefined ? 5 : overrides.lateFeeRatePct,
      status: overrides.status ?? LeaseStatus.ACTIVE,
    },
  });
}

type ChargeInput = {
  leaseId: string;
  year: number;
  month: number;
  day?: number;
  rentAmount?: number;
  maintenanceAmount?: number;
  carriedOverAmount?: number;
  lateFeeAmount?: number;
  totalDue: number;
  paidAmount?: number;
  status: ChargeStatus;
};

async function createCharge(input: ChargeInput) {
  return prisma.rentCharge.create({
    data: {
      leaseId: input.leaseId,
      year: input.year,
      month: input.month,
      dueDate: utcDate(input.year, input.month, input.day ?? 5),
      rentAmount: input.rentAmount ?? 650_000,
      maintenanceAmount: input.maintenanceAmount ?? 50_000,
      carriedOverAmount: input.carriedOverAmount ?? 0,
      lateFeeAmount: input.lateFeeAmount ?? 0,
      totalDue: input.totalDue,
      paidAmount: input.paidAmount ?? 0,
      status: input.status,
    },
  });
}

const findCharge = (leaseId: string, year: number, month: number) =>
  prisma.rentCharge.findUnique({ where: { leaseId_year_month: { leaseId, year, month } } });

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
});

describe("축 ① 멱등 생성", () => {
  test("두 번 돌려도 당월 청구는 1개뿐", async () => {
    const lease = await createLease();
    await createCharge({
      leaseId: lease.id,
      year: 2026,
      month: 8,
      totalDue: 1_015_000,
      carriedOverAmount: 300_000,
      lateFeeAmount: 15_000,
      status: ChargeStatus.OVERDUE,
    });

    const first = await runDailyCron({ now: NOW });
    expect(first.targetMonth).toEqual({ year: 2026, month: 9 });
    expect(first.chargesCreated).toBe(1);
    expect(first.chargesSkipped).toBe(0);

    const second = await runDailyCron({ now: NOW });
    expect(second.chargesCreated).toBe(0);
    expect(second.chargesSkipped).toBe(1);

    const septembers = await prisma.rentCharge.findMany({
      where: { leaseId: lease.id, year: 2026, month: 9 },
    });
    expect(septembers).toHaveLength(1);
    expect(await prisma.rentCharge.count()).toBe(2);
  });

  test("두 번 돌려도 만기 알림은 1건뿐", async () => {
    // 만기 2026-11-15 = 오늘(2026-09-01) 기준 75일 뒤 → 90일 창 안
    const lease = await createLease({ endDate: utcDate(2026, 11, 15) });

    const first = await runDailyCron({ now: NOW });
    expect(first.expiryNoticesSent).toBe(1);
    expect(first.expiryNoticesSkipped).toBe(0);

    const second = await runDailyCron({ now: NOW });
    expect(second.expiryNoticesSent).toBe(0);
    expect(second.expiryNoticesSkipped).toBe(1);

    const logs = await prisma.messageLog.findMany({
      where: { kind: MessageKind.CONTRACT_EXPIRY, leaseId: lease.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.toPhone).toBe("01022222222");
    expect(logs[0]?.title).toBe("행당해피빌 201호 계약 만기 안내");
    expect(logs[0]?.body).toContain("2026-11-15");
  });

  test("만기가 90일보다 멀면 알리지 않는다 (시드 201호 = 2027-02-28)", async () => {
    await createLease();
    const result = await runDailyCron({ now: NOW });
    expect(result.expiryNoticesSent).toBe(0);
    expect(await prisma.messageLog.count()).toBe(0);
  });
});

describe("통합 — 크론 실행 → 신규 월 청구 + OVERDUE 전환", () => {
  test("시드 6~9월 시나리오를 그대로 재현한다", async () => {
    const lease = await createLease();
    // 6월 완납 / 7월 부분납(잔액 30만) / 8월 이월+연체료, 아직 SCHEDULED 로 방치된 상태
    await createCharge({
      leaseId: lease.id, year: 2026, month: 6, totalDue: 700_000,
      paidAmount: 700_000, status: ChargeStatus.PAID,
    });
    await createCharge({
      leaseId: lease.id, year: 2026, month: 7, totalDue: 700_000,
      paidAmount: 400_000, status: ChargeStatus.PARTIALLY_PAID,
    });
    await createCharge({
      leaseId: lease.id, year: 2026, month: 8, totalDue: 1_015_000,
      carriedOverAmount: 300_000, lateFeeAmount: 15_000,
      status: ChargeStatus.SCHEDULED, // ← 크론이 OVERDUE 로 바꿔야 한다
    });

    const result = await runDailyCron({ now: NOW });

    // 신규 9월 청구 — 8월 미납 전액이 이월되고 8/5~9/5(31일)치 연체료가 붙는다
    const september = await findCharge(lease.id, 2026, 9);
    expect(september).toBeTruthy();
    expect(september?.dueDate.toISOString()).toBe("2026-09-05T00:00:00.000Z");
    expect(september?.carriedOverAmount).toBe(1_015_000);
    // 1,015,000 × 5% × 31/30 = 52,441.67 → 내림 52,441
    expect(september?.lateFeeAmount).toBe(52_441);
    expect(september?.totalDue).toBe(1_767_441);
    expect(september?.status).toBe(ChargeStatus.SCHEDULED);

    // OVERDUE 전환
    expect((await findCharge(lease.id, 2026, 8))?.status).toBe(ChargeStatus.OVERDUE);
    expect(result.statusChanged).toBe(1);
    expect(result.statusBreakdown.OVERDUE).toBe(1);

    // 이미 만들어진 8월 청구의 금액은 크론이 건드리지 않는다
    expect((await findCharge(lease.id, 2026, 8))?.totalDue).toBe(1_015_000);
    expect((await findCharge(lease.id, 2026, 8))?.lateFeeAmount).toBe(15_000);

    // 부분납·완납은 상태가 유지된다 (기한이 지나도 부분납은 부분납)
    expect((await findCharge(lease.id, 2026, 7))?.status).toBe(ChargeStatus.PARTIALLY_PAID);
    expect((await findCharge(lease.id, 2026, 6))?.status).toBe(ChargeStatus.PAID);
  });

  test("전월 청구가 없으면 이월 없이 월세+관리비만", async () => {
    const lease = await createLease();
    await runDailyCron({ now: NOW });
    const september = await findCharge(lease.id, 2026, 9);
    expect(september?.carriedOverAmount).toBe(0);
    expect(september?.lateFeeAmount).toBe(0);
    expect(september?.totalDue).toBe(700_000);
  });

  test("연체이율이 없는 계약은 이월만 되고 연체료 0", async () => {
    const lease = await createLease({ lateFeeRatePct: null });
    await createCharge({
      leaseId: lease.id, year: 2026, month: 8, totalDue: 700_000, status: ChargeStatus.OVERDUE,
    });
    await runDailyCron({ now: NOW });
    const september = await findCharge(lease.id, 2026, 9);
    expect(september?.carriedOverAmount).toBe(700_000);
    expect(september?.lateFeeAmount).toBe(0);
    expect(september?.totalDue).toBe(1_400_000);
  });

  test("말일 보정 — paymentDay 31, 2027년 2월 크론", async () => {
    const lease = await createLease({ paymentDay: 31 });
    // KST 2027-02-10
    const february = await runDailyCron({ now: new Date("2027-02-10T00:30:00Z") });
    expect(february.targetMonth).toEqual({ year: 2027, month: 2 });
    const charge = await findCharge(lease.id, 2027, 2);
    expect(charge?.dueDate.toISOString()).toBe("2027-02-28T00:00:00.000Z");
  });
});

describe("청구 생성 대상", () => {
  test("ACTIVE 가 아닌 계약은 만들지 않는다", async () => {
    await createLease({ status: LeaseStatus.PENDING_TENANT });
    const result = await runDailyCron({ now: NOW });
    expect(result.leasesScanned).toBe(0);
    expect(result.chargesCreated).toBe(0);
    expect(await prisma.rentCharge.count()).toBe(0);
  });

  test("당월이 계약기간 밖이면 만들지 않는다", async () => {
    await createLease({ startDate: utcDate(2025, 1, 1), endDate: utcDate(2026, 8, 31) });
    const result = await runDailyCron({ now: NOW });
    expect(result.leasesScanned).toBe(0);
    expect(await prisma.rentCharge.count()).toBe(0);
  });

  test("계약이 당월 중간에 끝나도 그 달 청구는 만든다", async () => {
    const lease = await createLease({ endDate: utcDate(2026, 9, 10) });
    await runDailyCron({ now: NOW });
    expect(await findCharge(lease.id, 2026, 9)).toBeTruthy();
  });
});

describe("이월 정정", () => {
  test("전월이 뒤늦게 완납되면 기한 전 청구의 이월액을 내린다", async () => {
    const lease = await createLease();
    await createCharge({
      leaseId: lease.id, year: 2026, month: 8, totalDue: 1_015_000,
      paidAmount: 1_015_000, carriedOverAmount: 300_000, lateFeeAmount: 15_000,
      status: ChargeStatus.PAID,
    });
    // 9월 청구는 8월이 미납이던 시점에 만들어졌다
    await createCharge({
      leaseId: lease.id, year: 2026, month: 9, totalDue: 1_767_441,
      carriedOverAmount: 1_015_000, lateFeeAmount: 52_441, status: ChargeStatus.SCHEDULED,
    });

    const result = await runDailyCron({ now: NOW });
    expect(result.carriedOverAdjusted).toBe(1);

    const september = await findCharge(lease.id, 2026, 9);
    expect(september?.carriedOverAmount).toBe(0);
    expect(september?.lateFeeAmount).toBe(0);
    expect(september?.totalDue).toBe(700_000);
  });

  test("기한이 지난 청구는 금액을 정정하지 않는다 (확정 청구 불변)", async () => {
    const lease = await createLease();
    await createCharge({
      leaseId: lease.id, year: 2026, month: 7, totalDue: 700_000,
      paidAmount: 700_000, status: ChargeStatus.PAID,
    });
    await createCharge({
      leaseId: lease.id, year: 2026, month: 8, totalDue: 1_015_000,
      carriedOverAmount: 300_000, lateFeeAmount: 15_000, status: ChargeStatus.OVERDUE,
    });

    const result = await runDailyCron({ now: NOW });
    expect(result.carriedOverAdjusted).toBe(0);
    expect((await findCharge(lease.id, 2026, 8))?.carriedOverAmount).toBe(300_000);
  });

  test("이월이 없는 청구는 뒤늦게 이월을 얹지 않는다", async () => {
    const lease = await createLease();
    await createCharge({
      leaseId: lease.id, year: 2026, month: 8, totalDue: 700_000, status: ChargeStatus.OVERDUE,
    });
    await createCharge({
      leaseId: lease.id, year: 2026, month: 9, totalDue: 700_000, status: ChargeStatus.SCHEDULED,
    });

    const result = await runDailyCron({ now: NOW });
    expect(result.carriedOverAdjusted).toBe(0);
    expect((await findCharge(lease.id, 2026, 9))?.totalDue).toBe(700_000);
  });
});

describe("실행 결과 요약", () => {
  test("무엇을 몇 건 처리했는지 담는다", async () => {
    await createLease();
    const result = await runDailyCron({ now: NOW });
    expect(result).toMatchObject({
      today: "2026-09-01",
      targetMonth: { year: 2026, month: 9 },
      leasesScanned: 1,
      chargesCreated: 1,
      chargesSkipped: 0,
      carriedOverAdjusted: 0,
      expiryNoticesSent: 0,
    });
    expect(result.ranAt).toBe(NOW.toISOString());
    expect(typeof result.durationMs).toBe("number");
  });

  test("계약이 하나도 없어도 안전하게 0건으로 끝난다", async () => {
    const result = await runDailyCron({ now: NOW });
    expect(result.leasesScanned).toBe(0);
    expect(result.chargesCreated).toBe(0);
    expect(result.statusChanged).toBe(0);
  });
});
