/**
 * 임대장부 집계 단위 테스트 (T1.6) — **DB 없이** 순수 함수만 돌린다.
 *
 * task 문서가 요구하는 최소 두 축:
 * ① 월 경계(`paidAt` 기준, KST 달력)  ② 항목 구분 합계(충당 순서대로)
 */
import { describe, expect, test } from "vitest";
import { aggregateLedger, kstYearRange, type LedgerChargeInput } from "./aggregate";

/** 그날 한국시간 자정 — 시드의 `at()` 과 같은 규칙 */
const at = (s: string) => new Date(`${s}T00:00:00+09:00`);
/** UTC 시각 그대로 */
const utc = (s: string) => new Date(`${s}Z`);

const BUILDING = "b1";

/** 시드 201호 계약과 같은 조건(월세 65만 · 관리비 5만)의 청구 */
function charge(
  over: Partial<LedgerChargeInput> & { payments: LedgerChargeInput["payments"] },
): LedgerChargeInput {
  return {
    buildingId: BUILDING,
    rentAmount: 650_000,
    maintenanceAmount: 50_000,
    carriedOverAmount: 0,
    lateFeeAmount: 0,
    ...over,
  };
}

function run(year: number, charges: LedgerChargeInput[], buildingIds = [BUILDING]) {
  return aggregateLedger({ year, charges, buildingIds });
}

// ===================== 축 ① 월 경계 (paidAt 기준) =====================

describe("축 ① 월 경계 — paidAt 기준, KST 달력", () => {
  test("청구 월이 아니라 실제 납부 월로 잡힌다 (시드: 7월 청구를 7/10 부분납)", () => {
    const result = run(2026, [
      charge({ payments: [{ amount: 400_000, paidAt: at("2026-07-10") }] }),
    ]);

    expect(result.months[6]!.month).toBe(7);
    expect(result.months[6]!.total).toBe(400_000);
    expect(result.months[6]!.paymentCount).toBe(1);
  });

  test("청구는 6월인데 7월에 내면 7월 수입이다 (청구 월과 납부 월이 갈린다)", () => {
    // 6월 청구를 기한(6/5)이 지난 7/3 에 완납한 경우
    const result = run(2026, [
      charge({ payments: [{ amount: 700_000, paidAt: at("2026-07-03") }] }),
    ]);

    expect(result.months[5]!.total).toBe(0); // 6월 수입 아님
    expect(result.months[6]!.total).toBe(700_000); // 7월 수입
  });

  test("KST 자정 직후(= UTC 로는 전달 15:00)는 KST 달로 잡힌다", () => {
    // 2026-07-01 00:30 KST = 2026-06-30 15:30Z — UTC 로 묶으면 6월로 새어 나간다
    const result = run(2026, [
      charge({ payments: [{ amount: 700_000, paidAt: utc("2026-06-30T15:30:00") }] }),
    ]);

    expect(result.months[5]!.total).toBe(0);
    expect(result.months[6]!.total).toBe(700_000);
  });

  test("KST 자정 직전(= 그달 마지막 순간)은 그 달에 남는다", () => {
    // 2026-06-30 23:59:59 KST = 2026-06-30 14:59:59Z
    const result = run(2026, [
      charge({ payments: [{ amount: 700_000, paidAt: utc("2026-06-30T14:59:59") }] }),
    ]);

    expect(result.months[5]!.total).toBe(700_000);
    expect(result.months[6]!.total).toBe(0);
  });

  test("연 경계 — 12/31 23:00 KST 는 그해, 1/1 00:00 KST 는 다음 해", () => {
    const payments = [
      { amount: 100_000, paidAt: utc("2026-12-31T14:00:00") }, // KST 2026-12-31 23:00
      { amount: 200_000, paidAt: utc("2026-12-31T15:00:00") }, // KST 2027-01-01 00:00
    ];
    const c = charge({ rentAmount: 300_000, maintenanceAmount: 0, payments });

    const y2026 = run(2026, [c]);
    expect(y2026.months[11]!.total).toBe(100_000);
    expect(y2026.totals.total).toBe(100_000);

    const y2027 = run(2027, [c]);
    expect(y2027.months[0]!.total).toBe(200_000);
    expect(y2027.totals.total).toBe(200_000);
  });

  test("kstYearRange 는 KST 연도를 UTC 구간 [from, to) 로 바꾼다", () => {
    const range = kstYearRange(2026);
    expect(range.from.toISOString()).toBe("2025-12-31T15:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-12-31T15:00:00.000Z");
  });

  test("납부가 없는 달은 0 으로 채워 항상 12개월이 나온다", () => {
    const result = run(2026, [
      charge({ payments: [{ amount: 700_000, paidAt: at("2026-06-05") }] }),
    ]);

    expect(result.months).toHaveLength(12);
    expect(result.months.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(result.months.filter((m) => m.total === 0)).toHaveLength(11);
    expect(result.months[0]!).toMatchObject({ rent: 0, maintenance: 0, total: 0, paymentCount: 0 });
  });

  test("다른 해 납부는 섞이지 않는다", () => {
    const result = run(2026, [
      charge({ payments: [{ amount: 700_000, paidAt: at("2025-12-05") }] }),
    ]);
    expect(result.totals.total).toBe(0);
  });
});

// ===================== 축 ② 항목 구분 합계 (충당 순서) =====================

describe("축 ② 항목 구분 — 원장 엔진의 충당 순서(이월 → 연체료 → 관리비 → 월세)", () => {
  test("완납이면 청구 항목 그대로 나뉜다", () => {
    const result = run(2026, [
      charge({ payments: [{ amount: 700_000, paidAt: at("2026-06-05") }] }),
    ]);

    expect(result.months[5]!).toMatchObject({
      rent: 650_000,
      maintenance: 50_000,
      carriedOver: 0,
      lateFee: 0,
      excess: 0,
      total: 700_000,
    });
  });

  test("부분납은 관리비를 먼저 채우고 남은 만큼만 월세로 간다 (시드 7월 40만)", () => {
    const result = run(2026, [
      charge({ payments: [{ amount: 400_000, paidAt: at("2026-07-10") }] }),
    ]);

    // 이월·연체료 0 → 관리비 50,000 먼저 → 나머지 350,000 이 월세
    expect(result.months[6]!).toMatchObject({
      carriedOver: 0,
      lateFee: 0,
      maintenance: 50_000,
      rent: 350_000,
      total: 400_000,
    });
  });

  test("이월·연체료가 있으면 그것부터 지운다 (시드 8월 청구 조건)", () => {
    // 시드 8월: 월세 650,000 · 관리비 50,000 · 이월 300,000 · 연체료 15,500 = 1,015,500
    const result = run(2026, [
      charge({
        carriedOverAmount: 300_000,
        lateFeeAmount: 15_500,
        payments: [{ amount: 400_000, paidAt: at("2026-09-02") }],
      }),
    ]);

    // 400,000 → 이월 300,000 · 연체료 15,500 · 관리비 50,000 · 월세 34,500
    expect(result.months[8]!).toMatchObject({
      carriedOver: 300_000,
      lateFee: 15_500,
      maintenance: 50_000,
      rent: 34_500,
      total: 400_000,
    });
  });

  test("여러 번 나눠 내면 앞선 납부부터 충당되고, 각 납부는 자기 달에 잡힌다", () => {
    const result = run(2026, [
      charge({
        carriedOverAmount: 300_000,
        lateFeeAmount: 15_500,
        payments: [
          { amount: 320_000, paidAt: at("2026-08-20") }, // 이월 300,000 + 연체료 15,500 + 관리비 4,500
          { amount: 695_500, paidAt: at("2026-09-01") }, // 관리비 잔액 45,500 + 월세 650,000
        ],
      }),
    ]);

    expect(result.months[7]!).toMatchObject({
      carriedOver: 300_000,
      lateFee: 15_500,
      maintenance: 4_500,
      rent: 0,
      total: 320_000,
    });
    expect(result.months[8]!).toMatchObject({
      carriedOver: 0,
      lateFee: 0,
      maintenance: 45_500,
      rent: 650_000,
      total: 695_500,
    });
    expect(result.totals.total).toBe(1_015_500);
  });

  test("납부 입력 순서가 뒤죽박죽이어도 paidAt 오름차순으로 충당한다", () => {
    const payments = [
      { amount: 695_500, paidAt: at("2026-09-01") },
      { amount: 320_000, paidAt: at("2026-08-20") },
    ];
    const result = run(2026, [
      charge({ carriedOverAmount: 300_000, lateFeeAmount: 15_500, payments }),
    ]);

    expect(result.months[7]!.carriedOver).toBe(300_000);
    expect(result.months[8]!.carriedOver).toBe(0);
  });

  test("연간 합계는 월별 합과 같고, 항목 합 = total 이다(불변식)", () => {
    const result = run(2026, [
      charge({ payments: [{ amount: 700_000, paidAt: at("2026-06-05") }] }),
      charge({ payments: [{ amount: 400_000, paidAt: at("2026-07-10") }] }),
    ]);

    expect(result.totals).toMatchObject({
      rent: 1_000_000,
      maintenance: 100_000,
      carriedOver: 0,
      lateFee: 0,
      excess: 0,
      total: 1_100_000,
      paymentCount: 2,
    });
    const summed = result.months.reduce((sum, month) => sum + month.total, 0);
    expect(summed).toBe(result.totals.total);

    for (const month of result.months) {
      expect(month.rent + month.maintenance + month.carriedOver + month.lateFee + month.excess).toBe(
        month.total,
      );
    }
  });

  test("총액 초과 납부는 excess 로 남아 합계가 실제 입금액과 어긋나지 않는다", () => {
    const result = run(2026, [
      charge({ payments: [{ amount: 750_000, paidAt: at("2026-06-05") }] }),
    ]);

    expect(result.months[5]!).toMatchObject({
      rent: 650_000,
      maintenance: 50_000,
      excess: 50_000,
      total: 750_000,
    });
  });
});

// ===================== 건물 분리 (월×건물 matrix) =====================

describe("월×건물 matrix", () => {
  test("건물별로 나뉘고, 수입이 없는 건물도 0 행으로 남는다", () => {
    const result = aggregateLedger({
      year: 2026,
      charges: [
        charge({ buildingId: "b1", payments: [{ amount: 700_000, paidAt: at("2026-06-05") }] }),
        charge({
          buildingId: "b2",
          rentAmount: 550_000,
          maintenanceAmount: 30_000,
          payments: [{ amount: 580_000, paidAt: at("2026-08-25") }],
        }),
      ],
      buildingIds: ["b1", "b2", "b3"],
    });

    expect(result.buildings.map((b) => b.buildingId)).toEqual(["b1", "b2", "b3"]);
    expect(result.buildings[0]!.months[5]!.total).toBe(700_000);
    expect(result.buildings[1]!.months[7]!.total).toBe(580_000);
    expect(result.buildings[2]!.totals.total).toBe(0);
    expect(result.buildings[2]!.months).toHaveLength(12);

    // 전체 합 = 건물별 합의 합
    const perBuilding = result.buildings.reduce((sum, b) => sum + b.totals.total, 0);
    expect(perBuilding).toBe(result.totals.total);
    expect(result.totals.total).toBe(1_280_000);
  });

  test("입력 건물 목록에 없는 청구가 들어와도 전체 합계에서 빠지지 않는다", () => {
    const result = aggregateLedger({
      year: 2026,
      charges: [
        charge({ buildingId: "unknown", payments: [{ amount: 700_000, paidAt: at("2026-06-05") }] }),
      ],
      buildingIds: [],
    });

    expect(result.totals.total).toBe(700_000);
    expect(result.buildings).toHaveLength(1);
  });
});
