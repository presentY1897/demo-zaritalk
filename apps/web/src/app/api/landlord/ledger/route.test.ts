/**
 * `GET /api/landlord/ledger` API 테스트 (T1.6).
 *
 * Route Handler 를 `Request` 로 직접 부른다(T0.3 패턴). `next/headers` 는 통째로 바꿔 끼운다.
 * 집계 규칙 자체는 DB 없는 단위 테스트(`features/ledger/aggregate.test.ts`)가 덮고,
 * 여기서는 **소유권·파라미터 검증·DB 조회 결과의 모양**을 본다.
 */
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  createBuildingWithUnits,
  createLandlord,
  createLease,
  createTenantOnlyUser,
  loginAs,
} from "@/features/landlord/testing";
import { at, createChargeWithPayments } from "@/features/ledger/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { GET } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

function get(query = ""): Promise<Response> {
  return GET(new Request(`http://localhost/api/landlord/ledger${query}`));
}

async function body(query = ""): Promise<any> {
  const response = await get(query);
  expect(response.status).toBe(200);
  return response.json();
}

/**
 * 시드와 같은 시나리오를 만든다 — 행당해피빌 201호(ACTIVE):
 * 6월 완납(6/5 70만) · 7월 부분납(7/10 40만) · 8월 연체(납부 0) · 9월 예정(납부 0)
 * 그리고 202호(PENDING_TENANT): 8월 완납(8/25 58만)
 */
async function seedLikeLedger(ownerProfileId: string) {
  const building = await createBuildingWithUnits(ownerProfileId, ["101호", "201호", "202호"]);
  const unit = (label: string) => building.units.find((u) => u.label === label)!;

  const activeLease = await createLease(unit("201호").id, "ACTIVE");
  await createChargeWithPayments(activeLease.id, {
    year: 2026,
    month: 6,
    payments: [{ amount: 700_000, paidAt: at("2026-06-05") }],
  });
  await createChargeWithPayments(activeLease.id, {
    year: 2026,
    month: 7,
    payments: [{ amount: 400_000, paidAt: at("2026-07-10") }],
  });
  await createChargeWithPayments(activeLease.id, {
    year: 2026,
    month: 8,
    carriedOverAmount: 300_000,
    lateFeeAmount: 15_500,
    status: "OVERDUE",
  });
  await createChargeWithPayments(activeLease.id, { year: 2026, month: 9 });

  const pendingLease = await createLease(unit("202호").id, "PENDING_TENANT");
  await createChargeWithPayments(pendingLease.id, {
    year: 2026,
    month: 8,
    rentAmount: 550_000,
    maintenanceAmount: 30_000,
    payments: [{ amount: 580_000, paidAt: at("2026-08-25") }],
  });

  return building;
}

// ===================== 인증·권한 =====================

test("비로그인이면 401", async () => {
  const response = await get("?year=2026");
  expect(response.status).toBe(401);
  expect((await response.json()).error.code).toBe("UNAUTHORIZED");
});

test("임대인 프로필이 없는 계정(세입자)이면 403", async () => {
  const { user } = await createTenantOnlyUser();
  await loginAs(user.id);

  const response = await get("?year=2026");
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe("FORBIDDEN");
});

// ===================== 파라미터 검증 =====================

test.each(["?year=abcd", "?year=20265", "?year=1999", "?year=", "?year=2026.5"])(
  "잘못된 연도 %s 는 400",
  async (query) => {
    const me = await createLandlord();
    await loginAs(me.user.id);

    const response = await get(query);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  },
);

test("연도를 생략하면 KST 기준 올해를 집계한다", async () => {
  const me = await createLandlord();
  await loginAs(me.user.id);

  const json = await body();
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  expect(json.year).toBe(kstNow.getUTCFullYear());
  expect(json.months).toHaveLength(12);
});

test("없는 건물 id 는 404, 타인 건물 id 는 403", async () => {
  const me = await createLandlord("01011111111", "김임대");
  const other = await createLandlord("01099999999", "남임대");
  const otherBuilding = await createBuildingWithUnits(other.profile.id, ["101호"], "남의건물");
  await loginAs(me.user.id);

  expect((await get("?year=2026&buildingId=cmf00000000000000000000")).status).toBe(404);

  const forbidden = await get(`?year=2026&buildingId=${otherBuilding.id}`);
  expect(forbidden.status).toBe(403);
  expect((await forbidden.json()).error.code).toBe("FORBIDDEN");
});

// ===================== 집계 =====================

test("시드 시나리오 — 월별·항목별로 정확히 집계된다(paidAt 기준)", async () => {
  const me = await createLandlord();
  await seedLikeLedger(me.profile.id);
  await loginAs(me.user.id);

  const json = await body("?year=2026");

  expect(json.year).toBe(2026);
  expect(json.buildingId).toBeNull();
  expect(json.months).toHaveLength(12);

  const month = (m: number) => json.months[m - 1];
  // 6월: 완납 70만 (월세 65만 + 관리비 5만)
  expect(month(6)).toMatchObject({
    month: 6,
    rent: 650_000,
    maintenance: 50_000,
    carriedOver: 0,
    lateFee: 0,
    total: 700_000,
    paymentCount: 1,
  });
  // 7월: 부분납 40만 — 관리비 5만 먼저, 나머지 35만이 월세
  expect(month(7)).toMatchObject({
    month: 7,
    rent: 350_000,
    maintenance: 50_000,
    total: 400_000,
    paymentCount: 1,
  });
  // 8월: 202호 58만만 들어온다(201호 8월 청구는 연체 = 납부 0)
  expect(month(8)).toMatchObject({
    month: 8,
    rent: 550_000,
    maintenance: 30_000,
    total: 580_000,
    paymentCount: 1,
  });
  // 9월: 청구는 있지만 납부가 없다 → 0
  expect(month(9)).toMatchObject({ month: 9, total: 0, paymentCount: 0 });

  expect(json.totals).toMatchObject({
    rent: 1_550_000,
    maintenance: 130_000,
    carriedOver: 0,
    lateFee: 0,
    excess: 0,
    total: 1_680_000,
    paymentCount: 3,
  });
});

test("납부가 없는 달은 0 으로 채워진다 (12개월 전부)", async () => {
  const me = await createLandlord();
  await seedLikeLedger(me.profile.id);
  await loginAs(me.user.id);

  const json = await body("?year=2026");
  const zeroMonths = json.months.filter((m: any) => m.total === 0).map((m: any) => m.month);
  expect(zeroMonths).toEqual([1, 2, 3, 4, 5, 9, 10, 11, 12]);
  for (const m of json.months) {
    expect(m).toMatchObject({ rent: expect.any(Number), total: expect.any(Number) });
  }
});

test("납부가 아예 없는 해는 12개월 모두 0", async () => {
  const me = await createLandlord();
  await seedLikeLedger(me.profile.id);
  await loginAs(me.user.id);

  const json = await body("?year=2025");
  expect(json.totals.total).toBe(0);
  expect(json.months.every((m: any) => m.total === 0)).toBe(true);
});

test("월 경계는 KST — 12/31 15:00Z 납부는 이듬해 1월 수입이다", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, ["101호"]);
  const lease = await createLease(building.units[0]!.id, "ACTIVE");
  await createChargeWithPayments(lease.id, {
    year: 2026,
    month: 12,
    payments: [
      { amount: 100_000, paidAt: new Date("2026-12-31T14:59:59Z") }, // KST 12/31 23:59
      { amount: 600_000, paidAt: new Date("2026-12-31T15:00:00Z") }, // KST 2027-01-01 00:00
    ],
  });
  await loginAs(me.user.id);

  const y2026 = await body("?year=2026");
  expect(y2026.months[11]!.total).toBe(100_000);
  expect(y2026.totals.total).toBe(100_000);

  const y2027 = await body("?year=2027");
  expect(y2027.months[0]!.total).toBe(600_000);
  expect(y2027.totals.total).toBe(600_000);
});

test("건물 필터 — 그 건물 수입만 남고 matrix 도 한 행이 된다", async () => {
  const me = await createLandlord();
  const first = await createBuildingWithUnits(me.profile.id, ["101호"], "행당해피빌");
  const second = await createBuildingWithUnits(me.profile.id, ["201호"], "성수리버뷰");

  const leaseA = await createLease(first.units[0]!.id, "ACTIVE");
  await createChargeWithPayments(leaseA.id, {
    year: 2026,
    month: 6,
    payments: [{ amount: 700_000, paidAt: at("2026-06-05") }],
  });
  const leaseB = await createLease(second.units[0]!.id, "ACTIVE");
  await createChargeWithPayments(leaseB.id, {
    year: 2026,
    month: 6,
    rentAmount: 500_000,
    maintenanceAmount: 0,
    payments: [{ amount: 500_000, paidAt: at("2026-06-07") }],
  });
  await loginAs(me.user.id);

  const all = await body("?year=2026");
  expect(all.totals.total).toBe(1_200_000);
  expect(all.matrix).toHaveLength(2);
  expect(all.matrix.map((row: any) => row.buildingName)).toEqual(["행당해피빌", "성수리버뷰"]);
  expect(all.matrix[0]!.months[5].total).toBe(700_000);
  expect(all.matrix[1]!.months[5].total).toBe(500_000);

  const filtered = await body(`?year=2026&buildingId=${second.id}`);
  expect(filtered.buildingId).toBe(second.id);
  expect(filtered.totals.total).toBe(500_000);
  expect(filtered.matrix).toHaveLength(1);
  expect(filtered.matrix[0]!.buildingId).toBe(second.id);
  // 필터를 걸어도 선택지 목록은 내 건물 전부
  expect(filtered.buildings).toHaveLength(2);
});

test("남의 수입은 섞이지 않는다", async () => {
  const me = await createLandlord("01011111111", "김임대");
  const other = await createLandlord("01099999999", "남임대");
  await seedLikeLedger(other.profile.id);

  const mine = await createBuildingWithUnits(me.profile.id, ["101호"], "내건물");
  const lease = await createLease(mine.units[0]!.id, "ACTIVE");
  await createChargeWithPayments(lease.id, {
    year: 2026,
    month: 6,
    rentAmount: 300_000,
    maintenanceAmount: 0,
    payments: [{ amount: 300_000, paidAt: at("2026-06-05") }],
  });
  await loginAs(me.user.id);

  const json = await body("?year=2026");
  expect(json.totals.total).toBe(300_000);
  expect(json.buildings).toHaveLength(1);
  expect(json.matrix).toHaveLength(1);
  expect(json.matrix[0]!.buildingName).toBe("내건물");
});

test("이월·연체료가 섞인 납부도 충당 순서대로 항목이 나뉜다", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, ["201호"]);
  const lease = await createLease(building.units[0]!.id, "ACTIVE");
  await createChargeWithPayments(lease.id, {
    year: 2026,
    month: 8,
    carriedOverAmount: 300_000,
    lateFeeAmount: 15_500,
    payments: [{ amount: 400_000, paidAt: at("2026-09-02") }],
  });
  await loginAs(me.user.id);

  const json = await body("?year=2026");
  expect(json.months[8]!).toMatchObject({
    carriedOver: 300_000,
    lateFee: 15_500,
    maintenance: 50_000,
    rent: 34_500,
    total: 400_000,
  });
  expect(json.totals).toMatchObject({ carriedOver: 300_000, lateFee: 15_500 });
});

test("연도 선택지(availableYears)에는 납부가 있는 해와 요청 연도가 들어간다", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, ["101호"]);
  const lease = await createLease(building.units[0]!.id, "ACTIVE");
  await createChargeWithPayments(lease.id, {
    year: 2025,
    month: 12,
    payments: [{ amount: 700_000, paidAt: at("2025-12-05") }],
  });
  await createChargeWithPayments(lease.id, {
    year: 2026,
    month: 6,
    payments: [{ amount: 700_000, paidAt: at("2026-06-05") }],
  });
  await loginAs(me.user.id);

  const json = await body("?year=2026");
  expect(json.availableYears).toContain(2025);
  expect(json.availableYears).toContain(2026);
  // 내림차순
  expect([...json.availableYears].sort((a: number, b: number) => b - a)).toEqual(
    json.availableYears,
  );
});
