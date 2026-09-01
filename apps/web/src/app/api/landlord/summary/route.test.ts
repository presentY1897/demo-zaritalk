/**
 * `GET /api/landlord/summary` 라우트 테스트 (T1.9).
 *
 * Route Handler 를 `Request` 없이 직접 부르고(인자가 없는 GET), 쿠키는 `next/headers` 를
 * 통째로 바꿔 끼워 다룬다(T0.3 패턴).
 *
 * **시계 비의존** — 라우트는 `kstToday()`(진짜 오늘)로 판정하므로, 픽스처 날짜도 오늘에서
 * 역산해 만든다(지난달 5일 = 반드시 기한 경과, 오늘+30일 만기 = 반드시 90일 이내).
 * 고정 날짜 시나리오(시드 기준 1,015,500원)는 `features/dashboard/queries.test.ts` 가
 * `now` 를 주입해 검증한다.
 */
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createBuildingWithUnits,
  createLandlord,
  createTenantOnlyUser,
  loginAs,
} from "@/features/landlord/testing";
import { createCharge, createLease } from "@/features/dashboard/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { addDays, kstToday, kstYearMonth, previousMonth } from "@/lib/rent";
import { GET } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

const TODAY = kstToday();
const THIS_MONTH = kstYearMonth();
const LAST_MONTH = previousMonth(THIS_MONTH);

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

async function summaryOf(response: Response) {
  return (await response.json()).summary;
}

/**
 * 오늘 기준으로 시드와 같은 모양을 만든다(청구는 `@@unique([leaseId, year, month])` 라
 * 계약 하나에 같은 달 청구를 두 개 둘 수 없다 — 부분납 청구는 다른 계약에 붙인다).
 *
 * | 호실 | 계약 | 청구 |
 * |---|---|---|
 * | 101호 | 없음(공실) | — |
 * | 201호 | ACTIVE, 만기 **30일** 남음 | 지난달 1,015,500원 **전액 미납 = 연체** · 이번 달 700,000원 **완납** |
 * | 301호 | ACTIVE, 만기 120일 남음 | 지난달 25일 700,000원 중 400,000원 **부분납 = 미납이지만 연체 아님** |
 */
async function createScenario(ownerProfileId: string) {
  const building = await createBuildingWithUnits(ownerProfileId, ["101호", "201호", "301호"]);
  const unit = (label: string) => building.units.find((u) => u.label === label)!;

  const overdueLease = await createLease({
    unitId: unit("201호").id,
    endDate: addDays(TODAY, 30),
  });
  await createCharge({
    leaseId: overdueLease.id,
    year: LAST_MONTH.year,
    month: LAST_MONTH.month,
    carriedOverAmount: 300_000,
    lateFeeAmount: 15_500,
    totalDue: 1_015_500,
  });
  await createCharge({
    leaseId: overdueLease.id,
    year: THIS_MONTH.year,
    month: THIS_MONTH.month,
    paidAmount: 700_000,
  });

  const farLease = await createLease({
    unitId: unit("301호").id,
    tenantName: "홍미가",
    tenantPhone: "01077777777",
    endDate: addDays(TODAY, 120),
  });
  await createCharge({
    leaseId: farLease.id,
    year: LAST_MONTH.year,
    month: LAST_MONTH.month,
    day: 25,
    paidAmount: 400_000,
  });

  return { building, overdueLease, farLease };
}

test("비로그인이면 401", async () => {
  const response = await GET();
  expect(response.status).toBe(401);
  expect((await response.json()).error.code).toBe("UNAUTHORIZED");
});

test("임대인 프로필이 없는 계정(세입자)이면 403", async () => {
  const { user } = await createTenantOnlyUser();
  await loginAs(user.id);

  const response = await GET();
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe("FORBIDDEN");
});

describe("200 — 대시보드 집계", () => {
  test("연체(한 푼도 안 낸 청구)와 미납(부분납 포함)을 따로 준다", async () => {
    const me = await createLandlord();
    await createScenario(me.profile.id);
    await loginAs(me.user.id);

    const summary = await summaryOf(await GET());

    expect(summary.overdue.count).toBe(1);
    expect(summary.overdue.amount).toBe(1_015_500);
    expect(summary.overdue.items[0]).toMatchObject({
      buildingName: "행당해피빌",
      unitLabel: "201호",
      tenantName: "박세입",
      outstanding: 1_015_500,
    });
    // 부분납 300,000 이 더해져 미납은 2건이다
    expect(summary.delinquent).toEqual({ count: 2, amount: 1_315_500 });
  });

  test("연체 행에 원장 엔진의 항목 분해가 함께 온다", async () => {
    const me = await createLandlord();
    await createScenario(me.profile.id);
    await loginAs(me.user.id);

    const summary = await summaryOf(await GET());

    expect(summary.overdue.items[0].lines).toEqual([
      { key: "RENT", label: "월세", amount: 650_000, paid: 0 },
      { key: "MAINTENANCE", label: "관리비", amount: 50_000, paid: 0 },
      { key: "CARRY_OVER", label: "전월 이월", amount: 300_000, paid: 0 },
      { key: "LATE_FEE", label: "연체료", amount: 15_500, paid: 0 },
    ]);
  });

  test("이번 달 수납 현황은 이번 달 청구만 센다", async () => {
    const me = await createLandlord();
    await createScenario(me.profile.id);
    await loginAs(me.user.id);

    const summary = await summaryOf(await GET());

    expect(summary.month).toEqual({
      year: THIS_MONTH.year,
      month: THIS_MONTH.month,
      label: `${THIS_MONTH.year}년 ${THIS_MONTH.month}월`,
    });
    expect(summary.collection).toMatchObject({
      chargeCount: 1,
      billedAmount: 700_000,
      paidAmount: 700_000,
      outstandingAmount: 0,
      paidCount: 1,
      unpaidCount: 0,
      collectedPct: 100,
    });
    expect(summary.collection.statusCounts.PAID).toBe(1);
  });

  test("만기 90일 이내 계약만 나온다", async () => {
    const me = await createLandlord();
    await createScenario(me.profile.id);
    await loginAs(me.user.id);

    const summary = await summaryOf(await GET());

    expect(summary.expiring.withinDays).toBe(90);
    expect(summary.expiring.count).toBe(1);
    expect(summary.expiring.items[0]).toMatchObject({ unitLabel: "201호", daysLeft: 30 });
  });

  test("자산 요약과 기준일(KST 오늘)이 함께 온다", async () => {
    const me = await createLandlord();
    await createScenario(me.profile.id);
    await loginAs(me.user.id);

    const summary = await summaryOf(await GET());

    expect(summary.asOf).toBe(TODAY.toISOString().slice(0, 10));
    expect(summary.portfolio).toEqual({
      buildingCount: 1,
      unitCount: 3,
      statusCounts: { OCCUPIED: 1, PENDING: 0, OVERDUE: 1, VACANT: 1 },
    });
  });

  test("민원·견적이 없으면 배지는 0 이고 링크 대상도 null 이다", async () => {
    const me = await createLandlord();
    await createScenario(me.profile.id);
    await loginAs(me.user.id);

    const summary = await summaryOf(await GET());

    expect(summary.inbox).toEqual({
      complaintCount: 0,
      quoteCount: 0,
      total: 0,
      latestComplaintId: null,
      latestQuoteWorkOrderId: null,
    });
  });

  test("남의 임대인 데이터는 섞이지 않는다", async () => {
    const me = await createLandlord("01011111111", "김임대");
    const other = await createLandlord("01099999999", "남임대");
    await createScenario(other.profile.id);
    await loginAs(me.user.id);

    const summary = await summaryOf(await GET());

    expect(summary.overdue.count).toBe(0);
    expect(summary.portfolio.buildingCount).toBe(0);
    expect(summary.collection.chargeCount).toBe(0);
  });

  test("계약이 없는 임대인도 0으로 채운 응답을 받는다(빈 상태)", async () => {
    const me = await createLandlord();
    await loginAs(me.user.id);

    const response = await GET();
    expect(response.status).toBe(200);

    const summary = await summaryOf(response);
    expect(summary.overdue).toEqual({ count: 0, amount: 0, items: [] });
    expect(summary.expiring.items).toEqual([]);
    expect(summary.portfolio.unitCount).toBe(0);
  });
});
