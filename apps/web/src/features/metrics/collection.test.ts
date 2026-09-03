/**
 * 수납률 집계 (T6.2) — **DB 없이** 도는 최소 테스트.
 */
import { expect, test } from "vitest";
import { buildCollectionRate, type CollectionChargeInput } from "./collection";
import { recentMonths } from "./series";

/** 2026-06-15 KST 기준 6개월(2026.01 ~ 2026.06) */
const NOW = new Date("2026-06-15T03:00:00.000Z");
const MONTHS = recentMonths(6, NOW);

function charge(
  year: number,
  month: number,
  amounts: Partial<CollectionChargeInput>,
  payments: number[] = [],
): CollectionChargeInput {
  return {
    year,
    month,
    rentAmount: 500_000,
    maintenanceAmount: 0,
    carriedOverAmount: 0,
    lateFeeAmount: 0,
    ...amounts,
    payments: payments.map((amount) => ({ amount })),
  };
}

test("수납률 = (청구액 − 미납액) / 청구액", () => {
  const result = buildCollectionRate(
    [
      charge(2026, 6, { rentAmount: 500_000, maintenanceAmount: 30_000 }, [530_000]), // 완납
      charge(2026, 6, { rentAmount: 500_000, maintenanceAmount: 30_000 }, [200_000]), // 부분납
    ],
    MONTHS,
  );

  const june = result.months.find((month) => month.month === 6);
  expect(june?.chargedAmount).toBe(1_060_000);
  expect(june?.collectedAmount).toBe(730_000);
  expect(june?.outstandingAmount).toBe(330_000);
  expect(june?.chargeCount).toBe(2);
  expect(june?.settledCount).toBe(1);
  expect(june?.rate).toBeCloseTo(730_000 / 1_060_000, 10);
});

test("청구액은 원장 엔진의 `calcTotalDue` — 이월·연체료까지 분모에 들어간다", () => {
  const result = buildCollectionRate(
    [
      charge(
        2026,
        5,
        {
          rentAmount: 500_000,
          maintenanceAmount: 30_000,
          carriedOverAmount: 100_000,
          lateFeeAmount: 5_000,
        },
        [],
      ),
    ],
    MONTHS,
  );

  const may = result.months.find((month) => month.month === 5);
  expect(may?.chargedAmount).toBe(635_000);
  expect(may?.outstandingAmount).toBe(635_000);
  expect(may?.rate).toBe(0);
});

test("초과 납부가 있어도 100% 를 넘지 않고 다른 청구의 미납을 가리지 않는다", () => {
  const result = buildCollectionRate(
    [
      charge(2026, 4, { rentAmount: 500_000 }, [900_000]), // 400,000 초과 납부
      charge(2026, 4, { rentAmount: 500_000 }, []), // 전액 미납
    ],
    MONTHS,
  );

  const april = result.months.find((month) => month.month === 4);
  expect(april?.chargedAmount).toBe(1_000_000);
  expect(april?.collectedAmount).toBe(500_000);
  expect(april?.outstandingAmount).toBe(500_000);
  expect(april?.rate).toBe(0.5); // 납부합/청구액이면 1.4 가 되어 미납이 사라진다
});

test("청구가 없는 달도 0 으로 남는다 — 차트에 구멍이 생기지 않게", () => {
  const result = buildCollectionRate([charge(2026, 6, {}, [500_000])], MONTHS);

  expect(result.months).toHaveLength(6);
  expect(result.months.map((month) => month.label)).toEqual([
    "2026.01",
    "2026.02",
    "2026.03",
    "2026.04",
    "2026.05",
    "2026.06",
  ]);
  const january = result.months.find((month) => month.month === 1);
  expect(january?.chargedAmount).toBe(0);
  expect(january?.rate).toBe(0);
});

test("빈 데이터는 전부 0 (0으로 나누지 않는다)", () => {
  const result = buildCollectionRate([], MONTHS);
  expect(result.total).toEqual({
    chargedAmount: 0,
    collectedAmount: 0,
    outstandingAmount: 0,
    chargeCount: 0,
    settledCount: 0,
    rate: 0,
  });
  expect(Number.isNaN(result.total.rate)).toBe(false);
});

test("버킷 밖(범위 밖 달)의 청구는 세지 않는다", () => {
  const result = buildCollectionRate(
    [charge(2025, 12, {}, []), charge(2026, 6, {}, [500_000])],
    MONTHS,
  );
  expect(result.total.chargeCount).toBe(1);
  expect(result.total.rate).toBe(1);
});

test("합계는 월별 합과 같다", () => {
  const result = buildCollectionRate(
    [
      charge(2026, 5, { rentAmount: 400_000 }, [400_000]),
      charge(2026, 6, { rentAmount: 600_000 }, [300_000]),
    ],
    MONTHS,
  );

  expect(result.total.chargedAmount).toBe(
    result.months.reduce((sum, month) => sum + month.chargedAmount, 0),
  );
  expect(result.total.outstandingAmount).toBe(300_000);
  expect(result.total.rate).toBeCloseTo(700_000 / 1_000_000, 10);
});
