/**
 * 대시보드 조회 테스트 (T1.9) — 실제 DB(`zari_home_test`)에 쓰고 읽는다.
 *
 * 시나리오는 시드(`packages/db/prisma/seed.ts`)를 그대로 재현하고, 기준 시각을 `now` 로 못 박아
 * **시계에 의존하지 않는다**(T1.4 크론 테스트와 같은 방식).
 * 완료 기준의 "연체 1건 1,015,500원" 이 여기서 검증된다.
 */
import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, describe, expect, test } from "vitest";
import {
  createBuildingWithUnits,
  createLandlord,
  createTenantOnlyUser,
} from "@/features/landlord/testing";
import { utcDate } from "@/lib/rent";
import { getLandlordSummary } from "./queries";
import {
  createCharge,
  createComplaint,
  createLease,
  createMasterProfile,
  createSeedScenario,
  createWorkOrderQuote,
} from "./testing";

/** KST 2026-09-01 09:30 — 시드가 상정한 "오늘" */
const NOW = new Date("2026-09-01T00:30:00Z");

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
});

describe("시드 시나리오", () => {
  test("연체는 1건 · 1,015,500원 (status OVERDUE = 한 푼도 안 낸 청구)", async () => {
    const me = await createLandlord();
    await createSeedScenario(me.profile.id);

    const summary = await getLandlordSummary(me.profile.id, { now: NOW });

    expect(summary.overdue.count).toBe(1);
    expect(summary.overdue.amount).toBe(1_015_500);
    expect(summary.overdue.items[0]).toMatchObject({
      buildingName: "행당해피빌",
      unitLabel: "201호",
      tenantName: "박세입",
      year: 2026,
      month: 8,
      dueDate: "2026-08-05",
      overdueDays: 27,
      outstanding: 1_015_500,
    });
  });

  test("부분납 포함 미납은 2건 · 1,315,500원 — 연체와 다른 숫자다", async () => {
    const me = await createLandlord();
    await createSeedScenario(me.profile.id);

    const summary = await getLandlordSummary(me.profile.id, { now: NOW });

    expect(summary.delinquent).toEqual({ count: 2, amount: 1_315_500 });
    expect(summary.overdue.count).toBe(1);
  });

  test("이번 달(2026년 9월) 수납 현황 — 청구 1건 700,000원, 수납 0원", async () => {
    const me = await createLandlord();
    await createSeedScenario(me.profile.id);

    const summary = await getLandlordSummary(me.profile.id, { now: NOW });

    expect(summary.asOf).toBe("2026-09-01");
    expect(summary.month).toEqual({ year: 2026, month: 9, label: "2026년 9월" });
    expect(summary.collection).toMatchObject({
      chargeCount: 1,
      billedAmount: 700_000,
      paidAmount: 0,
      outstandingAmount: 700_000,
      paidCount: 0,
      collectedPct: 0,
    });
  });

  test("만기 임박은 0건 — 시드 계약 만기는 2027-02-28 · 2027-07-24 라 90일 밖이다", async () => {
    const me = await createLandlord();
    await createSeedScenario(me.profile.id);

    const summary = await getLandlordSummary(me.profile.id, { now: NOW });

    expect(summary.expiring.withinDays).toBe(90);
    expect(summary.expiring.count).toBe(0);
  });

  test("자산 요약 — 건물 1 · 호실 3 (연체 1 · 대기 1 · 공실 1)", async () => {
    const me = await createLandlord();
    await createSeedScenario(me.profile.id);

    const summary = await getLandlordSummary(me.profile.id, { now: NOW });

    expect(summary.portfolio).toEqual({
      buildingCount: 1,
      unitCount: 3,
      statusCounts: { OCCUPIED: 0, PENDING: 1, OVERDUE: 1, VACANT: 1 },
    });
  });
});

describe("만기 90일 필터", () => {
  test("90일째는 포함하고 91일째는 제외한다", async () => {
    const me = await createLandlord();
    const building = await createBuildingWithUnits(me.profile.id, ["101호", "201호", "301호"]);
    const unit = (label: string) => building.units.find((u) => u.label === label)!;

    await createLease({ unitId: unit("101호").id, endDate: utcDate(2026, 11, 30) }); // +90일
    await createLease({ unitId: unit("201호").id, endDate: utcDate(2026, 12, 1) }); // +91일
    await createLease({ unitId: unit("301호").id, endDate: utcDate(2026, 10, 1) }); // +30일

    const summary = await getLandlordSummary(me.profile.id, { now: NOW });

    expect(summary.expiring.count).toBe(2);
    // 만기가 가까운 것부터
    expect(summary.expiring.items.map((item) => [item.unitLabel, item.daysLeft])).toEqual([
      ["301호", 30],
      ["101호", 90],
    ]);
  });
});

describe("소유·격리", () => {
  test("남의 임대인 데이터는 섞이지 않는다", async () => {
    const me = await createLandlord("01011111111", "김임대");
    const other = await createLandlord("01099999999", "남임대");
    await createSeedScenario(me.profile.id);
    await createSeedScenario(other.profile.id);

    const summary = await getLandlordSummary(me.profile.id, { now: NOW });

    // 두 임대인이 같은 시나리오를 갖고 있어도 내 것만 센다
    expect(summary.overdue.count).toBe(1);
    expect(summary.overdue.amount).toBe(1_015_500);
    expect(summary.portfolio.buildingCount).toBe(1);
  });

  test("계약이 하나도 없는 임대인은 전부 0인 빈 상태를 받는다", async () => {
    const me = await createLandlord();

    const summary = await getLandlordSummary(me.profile.id, { now: NOW });

    expect(summary.portfolio.buildingCount).toBe(0);
    expect(summary.collection.chargeCount).toBe(0);
    expect(summary.overdue).toEqual({ count: 0, amount: 0, items: [] });
    expect(summary.delinquent).toEqual({ count: 0, amount: 0 });
    expect(summary.expiring.count).toBe(0);
    expect(summary.inbox.total).toBe(0);
  });
});

describe("미확인 민원·견적 (T2.6 · T5.3 데이터가 들어오면 자동으로 채워진다)", () => {
  test("시드에는 데이터가 없어 0 이고 링크 대상도 null 이다", async () => {
    const me = await createLandlord();
    await createSeedScenario(me.profile.id);

    const summary = await getLandlordSummary(me.profile.id, { now: NOW });

    expect(summary.inbox).toEqual({
      complaintCount: 0,
      quoteCount: 0,
      total: 0,
      latestComplaintId: null,
      latestQuoteWorkOrderId: null,
    });
  });

  test("OPEN 민원과 PROPOSED 견적만 센다 — 처리된 건은 빠진다", async () => {
    const me = await createLandlord();
    const tenant = await createTenantOnlyUser();
    const master = await createMasterProfile();
    const { activeLease } = await createSeedScenario(me.profile.id);

    const open = await createComplaint({
      leaseId: activeLease.id,
      tenantProfileId: tenant.profile.id,
    });
    await createComplaint({
      leaseId: activeLease.id,
      tenantProfileId: tenant.profile.id,
      status: "RESOLVED",
      title: "이미 처리된 민원",
    });
    const { workOrder } = await createWorkOrderQuote({
      requesterProfileId: me.profile.id,
      masterProfileId: master.id,
    });
    await createWorkOrderQuote({
      requesterProfileId: me.profile.id,
      masterProfileId: master.id,
      status: "REJECTED",
    });

    const summary = await getLandlordSummary(me.profile.id, { now: NOW });

    expect(summary.inbox).toEqual({
      complaintCount: 1,
      quoteCount: 1,
      total: 2,
      latestComplaintId: open.id,
      latestQuoteWorkOrderId: workOrder.id,
    });
  });

  test("남의 민원·견적은 세지 않는다", async () => {
    const me = await createLandlord("01011111111", "김임대");
    const other = await createLandlord("01099999999", "남임대");
    const tenant = await createTenantOnlyUser();
    const master = await createMasterProfile();
    const otherScenario = await createSeedScenario(other.profile.id);
    await createSeedScenario(me.profile.id);

    await createComplaint({
      leaseId: otherScenario.activeLease.id,
      tenantProfileId: tenant.profile.id,
    });
    await createWorkOrderQuote({
      requesterProfileId: other.profile.id,
      masterProfileId: master.id,
    });

    const summary = await getLandlordSummary(me.profile.id, { now: NOW });
    expect(summary.inbox.total).toBe(0);
  });
});

describe("저장된 status 컬럼이 낡아 있어도 (크론 전)", () => {
  test("실효 상태로 다시 판정해 연체를 센다", async () => {
    const me = await createLandlord();
    const building = await createBuildingWithUnits(me.profile.id, ["101호"]);
    const lease = await createLease({ unitId: building.units[0]!.id });
    // 기한(8/5)이 지났는데 크론이 아직 안 돌아 SCHEDULED 로 남아 있는 청구
    await createCharge({ leaseId: lease.id, year: 2026, month: 8, status: "SCHEDULED" });

    const summary = await getLandlordSummary(me.profile.id, { now: NOW });

    expect(summary.overdue.count).toBe(1);
    expect(summary.overdue.amount).toBe(700_000);
    expect(await prisma.rentCharge.count({ where: { status: "OVERDUE" } })).toBe(0);
  });
});
