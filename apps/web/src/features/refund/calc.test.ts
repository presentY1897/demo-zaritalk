import { expect, test } from "vitest";
import { utcDate } from "@/lib/rent";
import {
  addMonthsClamped,
  calculateRefund,
  defaultRefundPeriod,
  isFutureStart,
  rentMonthsByYear,
  type RefundCalcInput,
} from "./calc";
import {
  REFUND_RETRO_YEARS,
  REFUND_TAX_RULES,
  resolveCreditRatePercent,
  resolveRefundRule,
  retroYearRange,
} from "./rules";

/**
 * 환급 계산 엔진 (T2.3) — **DB 없이** 도는 순수 함수 테스트.
 *
 * "오늘"은 전부 `ASOF` 로 주입한다. 계산이 시계에 의존하면 같은 테스트가 날짜에 따라
 * 통과했다 실패했다 한다(크론 T1.4 가 `now` 를 주입받는 것과 같은 이유).
 *
 * 세액 계산은 돈 로직이라 **경계값**이 핵심이다 — 공제율 구간·연 한도·소급 연도·부분 연도.
 */

/** 기준일 고정: 2026-09-02 (KST 달력 기준 오늘을 UTC 자정으로 받은 값) */
const ASOF = utcDate(2026, 9, 2);

/** 총급여만 바꿔 가며 쓰는 기본 입력 — 2025년 한 해 꽉 채운 임차 */
function input(overrides: Partial<RefundCalcInput> = {}): RefundCalcInput {
  return {
    grossSalary: 48_000_000,
    monthlyRent: 500_000,
    startDate: "2025-01-01",
    endDate: "2025-12-31",
    ...overrides,
  };
}

// ───────────────────────── ① 공제율 경계값 (핵심) ─────────────────────────

test("공제율 경계 — 5,500만원 이하 17% / 초과 15% / 8,000만원 초과 대상 외", () => {
  const rule = resolveRefundRule(2026);

  expect(resolveCreditRatePercent(0, rule)).toBe(17);
  expect(resolveCreditRatePercent(54_999_999, rule)).toBe(17);
  // 경계 정확히 — "이하" 라서 아직 17%
  expect(resolveCreditRatePercent(55_000_000, rule)).toBe(17);
  // 1원만 넘겨도 다음 구간
  expect(resolveCreditRatePercent(55_000_001, rule)).toBe(15);

  expect(resolveCreditRatePercent(79_999_999, rule)).toBe(15);
  expect(resolveCreditRatePercent(80_000_000, rule)).toBe(15);
  // 1원만 넘겨도 대상 외
  expect(resolveCreditRatePercent(80_000_001, rule)).toBe(0);
  expect(resolveCreditRatePercent(1_000_000_000, rule)).toBe(0);
});

test("공제율 경계가 계산 결과 금액까지 그대로 이어진다", () => {
  // 12개월 × 50만원 = 600만원 (연 한도 1,000만원 밑이라 전액 공제 대상)
  const paid = 6_000_000;

  const at55m = calculateRefund(input({ grossSalary: 55_000_000 }), ASOF);
  expect(at55m.creditRatePercent).toBe(17);
  expect(at55m.totals.paidRent).toBe(paid);
  expect(at55m.totals.creditAmount).toBe(1_020_000); // 600만 × 17%
  expect(at55m.ineligibleReason).toBeNull();

  const over55m = calculateRefund(input({ grossSalary: 55_000_001 }), ASOF);
  expect(over55m.creditRatePercent).toBe(15);
  expect(over55m.totals.creditAmount).toBe(900_000); // 600만 × 15%

  const at80m = calculateRefund(input({ grossSalary: 80_000_000 }), ASOF);
  expect(at80m.creditRatePercent).toBe(15);
  expect(at80m.totals.creditAmount).toBe(900_000);

  const over80m = calculateRefund(input({ grossSalary: 80_000_001 }), ASOF);
  expect(over80m.creditRatePercent).toBe(0);
  expect(over80m.totals.creditAmount).toBe(0);
  expect(over80m.ineligibleReason).toBe("GROSS_SALARY_OVER");
  // 대상 외여도 "얼마를 냈는지" 는 그대로 보여 준다(화면이 사유를 설명할 수 있게)
  expect(over80m.totals.paidRent).toBe(paid);
  expect(over80m.years).toHaveLength(1);
  expect(over80m.years[0]!.creditRatePercent).toBe(0);
});

// ───────────────────────── ② 연 한도 컷 (핵심) ─────────────────────────

test("연 1,000만원 한도 — 초과분은 공제 대상에서 잘린다", () => {
  // 12개월 × 100만원 = 1,200만원 → 공제 대상은 1,000만원까지
  const result = calculateRefund(input({ monthlyRent: 1_000_000 }), ASOF);
  const year = result.years[0]!;

  expect(year.paidRent).toBe(12_000_000);
  expect(year.eligibleRent).toBe(10_000_000);
  expect(year.cappedOutRent).toBe(2_000_000);
  expect(year.annualRentCap).toBe(10_000_000);
  expect(year.creditAmount).toBe(1_700_000); // 1,000만 × 17% — 1,200만이 아니라 한도 기준
  expect(result.totals.cappedOutRent).toBe(2_000_000);
});

test("한도는 연도마다 따로 적용된다 — 한 해만 넘겨도 다른 해는 그대로", () => {
  // 2025-07-01 ~ 2026-06-30: 2025년 6개월, 2026년 6개월 × 200만원
  const result = calculateRefund(
    input({ monthlyRent: 2_000_000, startDate: "2025-07-01", endDate: "2026-06-30" }),
    ASOF,
  );

  expect(result.years.map((row) => row.year)).toEqual([2025, 2026]);
  for (const row of result.years) {
    expect(row.months).toBe(6);
    expect(row.paidRent).toBe(12_000_000);
    expect(row.eligibleRent).toBe(10_000_000); // 연도마다 각각 1,000만원까지
    expect(row.creditAmount).toBe(1_700_000);
  }
  expect(result.totals.creditAmount).toBe(3_400_000);
  expect(result.totals.cappedOutRent).toBe(4_000_000);
});

test("한도에 정확히 걸친 금액은 잘리지 않는다", () => {
  // 10개월 × 100만원 = 1,000만원 — 한도와 같으면 전액 공제 대상
  const result = calculateRefund(
    input({ monthlyRent: 1_000_000, startDate: "2025-01-01", endDate: "2025-10-31" }),
    ASOF,
  );
  const year = result.years[0]!;
  expect(year.months).toBe(10);
  expect(year.paidRent).toBe(10_000_000);
  expect(year.eligibleRent).toBe(10_000_000);
  expect(year.cappedOutRent).toBe(0);
});

// ───────────────────────── ③ 소급 연도 산정 (핵심) ─────────────────────────

test("소급 범위는 기준일 연도를 포함해 5개 연도", () => {
  expect(REFUND_RETRO_YEARS).toBe(5);
  expect(retroYearRange(ASOF)).toEqual({ fromYear: 2022, toYear: 2026 });
  // 해가 바뀌면 창도 같이 민다
  expect(retroYearRange(utcDate(2027, 1, 1))).toEqual({ fromYear: 2023, toYear: 2027 });
  // 12월 31일도 아직 그 해다(경계에서 창이 미리 밀리지 않는다)
  expect(retroYearRange(utcDate(2026, 12, 31))).toEqual({ fromYear: 2022, toYear: 2026 });
});

test("소급 경계 — 가장 이른 대상 연도(2022)는 들어오고 그 전 해(2021)는 잘린다", () => {
  const included = calculateRefund(
    input({ startDate: "2022-01-01", endDate: "2022-12-31" }),
    ASOF,
  );
  expect(included.years.map((row) => row.year)).toEqual([2022]);
  expect(included.years[0]!.months).toBe(12);

  const excluded = calculateRefund(
    input({ startDate: "2021-01-01", endDate: "2021-12-31" }),
    ASOF,
  );
  expect(excluded.years).toEqual([]);
  expect(excluded.totals.creditAmount).toBe(0);
  expect(excluded.ineligibleReason).toBe("NO_ELIGIBLE_MONTHS");
});

test("소급 경계에 걸친 기간은 범위 안 개월만 남는다", () => {
  // 2021-11-01 ~ 2022-02-28 : 2021년 2개월(기한 지남) + 2022년 2개월(대상)
  const result = calculateRefund(
    input({ startDate: "2021-11-01", endDate: "2022-02-28" }),
    ASOF,
  );
  expect(result.years.map((row) => row.year)).toEqual([2022]);
  expect(result.years[0]!.months).toBe(2);
  expect(result.totals.months).toBe(2);
});

test("소급 5년보다 오래된 기간은 통째로 0원 — 400 이 아니라 사유를 담은 결과다", () => {
  const result = calculateRefund(
    input({ startDate: "2015-01-01", endDate: "2016-12-31" }),
    ASOF,
  );
  expect(result.years).toEqual([]);
  expect(result.totals.months).toBe(0);
  expect(result.ineligibleReason).toBe("NO_ELIGIBLE_MONTHS");
  // 기간 자체는 유효하므로 "무엇을 셌는지" 는 남겨 둔다
  expect(result.countedPeriod).toEqual({ startDate: "2015-01-01", endDate: "2016-12-31" });
});

// ───────────────────────── ④ 부분 연도 (핵심) ─────────────────────────

test("연 중간 시작·종료 — 그 해는 12개월치가 아니다", () => {
  // 2025-07-15 ~ 2026-03-14 : 2025년 7·8·9·10·11·12월 = 6개월, 2026년 1·2월 = 2개월
  const result = calculateRefund(
    input({ monthlyRent: 600_000, startDate: "2025-07-15", endDate: "2026-03-14" }),
    ASOF,
  );

  expect(result.years.map((row) => [row.year, row.months])).toEqual([
    [2025, 6],
    [2026, 2],
  ]);
  expect(result.years[0]!.paidRent).toBe(3_600_000);
  expect(result.years[1]!.paidRent).toBe(1_200_000);
  expect(result.totals.months).toBe(8);
});

test("12개월 계약은 해를 걸쳐도 정확히 12개월 — 달력 월로 세면 13이 된다", () => {
  const months = rentMonthsByYear(utcDate(2025, 3, 15), utcDate(2026, 3, 14));
  expect([...months.entries()]).toEqual([
    [2025, 10],
    [2026, 2],
  ]);
  expect([...months.values()].reduce((a, b) => a + b, 0)).toBe(12);
});

test("한 달을 못 채운 자투리도 주기가 시작했으면 1개월 — 하루 임차도 1개월", () => {
  expect(rentMonthsByYear(utcDate(2025, 5, 10), utcDate(2025, 5, 10)).get(2025)).toBe(1);
  expect(rentMonthsByYear(utcDate(2025, 5, 10), utcDate(2025, 6, 9)).get(2025)).toBe(1);
  // 하루만 더 있으면 두 번째 주기가 시작된다
  expect(rentMonthsByYear(utcDate(2025, 5, 10), utcDate(2025, 6, 10)).get(2025)).toBe(2);
});

test("월 주기는 말일 보정을 한다 — 1/31 계약이 2월에 밀리지 않는다", () => {
  const base = utcDate(2026, 1, 31);
  expect(addMonthsClamped(base, 0).toISOString().slice(0, 10)).toBe("2026-01-31");
  expect(addMonthsClamped(base, 1).toISOString().slice(0, 10)).toBe("2026-02-28");
  // 보정은 언제나 원래 일자(31)에서 다시 하므로 3월에 31일로 돌아온다
  expect(addMonthsClamped(base, 2).toISOString().slice(0, 10)).toBe("2026-03-31");
  expect(addMonthsClamped(base, 12).toISOString().slice(0, 10)).toBe("2027-01-31");
  // 윤년
  expect(addMonthsClamped(utcDate(2024, 1, 31), 1).toISOString().slice(0, 10)).toBe("2024-02-29");
  // 음수(기본 기간 계산에서 쓴다)
  expect(addMonthsClamped(utcDate(2026, 9, 2), -12).toISOString().slice(0, 10)).toBe("2025-09-02");
  expect(addMonthsClamped(utcDate(2026, 1, 15), -1).toISOString().slice(0, 10)).toBe("2025-12-15");
});

test("말일 시작 계약도 1년이면 12개월", () => {
  const months = rentMonthsByYear(utcDate(2025, 1, 31), utcDate(2026, 1, 30));
  expect([...months.entries()]).toEqual([[2025, 12]]);
});

// ───────────────────────── ⑤ 미래분·기준일 ─────────────────────────

test("아직 내지 않은 미래 월세는 세지 않는다 — 종료일을 기준일까지 자른다", () => {
  // 2026-01-01 ~ 2027-12-31 이지만 기준일이 2026-09-02 라 1~9월 9개월만 센다
  const result = calculateRefund(
    input({ startDate: "2026-01-01", endDate: "2027-12-31" }),
    ASOF,
  );
  expect(result.years.map((row) => [row.year, row.months])).toEqual([[2026, 9]]);
  expect(result.countedPeriod).toEqual({ startDate: "2026-01-01", endDate: "2026-09-02" });
  expect(result.asOf).toBe("2026-09-02");
});

test("isFutureStart — 기준일 당일은 미래가 아니다", () => {
  expect(isFutureStart("2026-09-01", ASOF)).toBe(false);
  expect(isFutureStart("2026-09-02", ASOF)).toBe(false);
  expect(isFutureStart("2026-09-03", ASOF)).toBe(true);
});

test("기본 기간은 기준일까지의 최근 12개월", () => {
  expect(defaultRefundPeriod(ASOF)).toEqual({ startDate: "2025-09-03", endDate: "2026-09-02" });
  const period = defaultRefundPeriod(ASOF);
  const result = calculateRefund(input(period), ASOF);
  expect(result.totals.months).toBe(12);

  // 윤년 경계에서도 12개월이다
  const leap = defaultRefundPeriod(utcDate(2024, 2, 29));
  expect(leap).toEqual({ startDate: "2023-03-01", endDate: "2024-02-29" });
});

// ───────────────────────── ⑥ 반올림·방어 ─────────────────────────

test("환급액은 내림 — 1원 미만은 버린다", () => {
  // 3개월 × 1,111,111원 = 3,333,333원 × 15% = 499,999.95원 → 499,999원
  const result = calculateRefund(
    input({
      grossSalary: 60_000_000,
      monthlyRent: 1_111_111,
      startDate: "2025-01-01",
      endDate: "2025-03-31",
    }),
    ASOF,
  );
  expect(result.years[0]!.eligibleRent).toBe(3_333_333);
  expect(result.years[0]!.creditAmount).toBe(499_999);
  expect(Number.isInteger(result.totals.creditAmount)).toBe(true);
});

test("기간 역전·존재하지 않는 날짜는 빈 결과로 방어한다(스키마가 먼저 막지만)", () => {
  const reversed = calculateRefund(
    input({ startDate: "2025-12-31", endDate: "2025-01-01" }),
    ASOF,
  );
  expect(reversed.years).toEqual([]);
  expect(reversed.countedPeriod).toBeNull();
  expect(reversed.ineligibleReason).toBe("NO_ELIGIBLE_MONTHS");

  const nonsense = calculateRefund(input({ startDate: "2025-02-31" }), ASOF);
  expect(nonsense.years).toEqual([]);
  expect(nonsense.countedPeriod).toBeNull();
});

test("입력을 응답에 그대로 되돌려 준다 — 응답만으로 재현할 수 있게", () => {
  const source = input({ startDate: "2024-03-01", endDate: "2025-02-28" });
  const result = calculateRefund(source, ASOF);
  expect(result.input).toEqual(source);
  expect(result.asOf).toBe("2026-09-02");
  expect(result.retroRange).toEqual({ fromYear: 2022, toYear: 2026 });
  // 합계는 연도 행의 단순 합이다(화면이 다시 더하지 않게)
  expect(result.totals.creditAmount).toBe(
    result.years.reduce((sum, row) => sum + row.creditAmount, 0),
  );
  expect(result.totals.months).toBe(12);
});

// ───────────────────────── ⑦ 연도별 상수 테이블 ─────────────────────────

test("규칙은 귀속연도에 묶인다 — 테이블보다 오래된 연도는 가장 오래된 규칙", () => {
  const oldest = REFUND_TAX_RULES[0]!;
  expect(resolveRefundRule(oldest.effectiveFrom)).toBe(oldest);
  expect(resolveRefundRule(oldest.effectiveFrom - 1)).toBe(oldest);
  expect(resolveRefundRule(9999)).toBe(REFUND_TAX_RULES[REFUND_TAX_RULES.length - 1]);

  // 테이블은 effectiveFrom 오름차순이고 구간도 상한 오름차순이어야 한다(해석 규칙의 전제)
  for (let i = 1; i < REFUND_TAX_RULES.length; i += 1) {
    expect(REFUND_TAX_RULES[i]!.effectiveFrom).toBeGreaterThan(
      REFUND_TAX_RULES[i - 1]!.effectiveFrom,
    );
  }
  for (const rule of REFUND_TAX_RULES) {
    expect(rule.annualRentCap).toBeGreaterThan(0);
    for (let i = 1; i < rule.brackets.length; i += 1) {
      expect(rule.brackets[i]!.upToGrossSalary).toBeGreaterThan(
        rule.brackets[i - 1]!.upToGrossSalary,
      );
    }
  }
});

test("연도 행에는 그 해에 적용한 한도·공제율이 함께 실린다", () => {
  const result = calculateRefund(input(), ASOF);
  const row = result.years[0]!;
  const rule = resolveRefundRule(row.year);
  expect(row.annualRentCap).toBe(rule.annualRentCap);
  expect(row.creditRatePercent).toBe(resolveCreditRatePercent(48_000_000, rule));
});
