/**
 * 월세 세액공제 환급 **계산 엔진** (T2.3) — 순수 함수, DB 를 모른다.
 *
 * `POST /api/refund/calculate` 와 `/refund/calculator` 화면이 이 함수 하나를 같이 쓰고,
 * [T2.4 환급 신청](../../../../../docs/tasks/t2.4-refund-apply.md)이 신청서에 담을 금액도
 * **여기서 나온 값 그대로**다. 계산식이 두 벌이 되면 화면 금액과 신청 금액이 갈라진다.
 *
 * ```ts
 * import { calculateRefund } from "@/features/refund/calc";
 * import { kstToday } from "@/lib/rent";
 *
 * const result = calculateRefund(
 *   { grossSalary: 48_000_000, monthlyRent: 550_000, startDate: "2024-03-01", endDate: "2026-02-28" },
 *   kstToday(),           // ← "오늘"은 **인자로 주입**한다(시계 의존 금지)
 * );
 * ```
 *
 * ## 정한 규칙 (전부 여기서만 바뀐다)
 *
 * | 항목 | 결정 | 왜 |
 * |---|---|---|
 * | 소급 기준일 | 호출자가 넘긴 `asOf`(운영은 `kstToday()`) | 시계에 의존하면 같은 입력이 날마다 다른 답을 낸다 |
 * | 소급 범위 | `asOf` 연도 **포함** 최근 5개 연도 | 화면 문구 "최근 5년"과 개수가 맞는다 |
 * | 지급 개월 | 임차 **시작일 기준 월 주기** — k번째 주기 시작일이 계산 종료일 이내면 1개월 | 월세는 달 단위로 낸다. 달력 월로 세면 12개월 계약이 13개월로 부풀고, 일할로 쪼개면 실제 지급액과 어긋난다 |
 * | 부분 연도 | 각 주기의 **시작일이 속한 연도**에 1개월씩 귀속 | 7월 입주면 그 해는 6개월치, 나머지는 다음 해로 자연히 갈린다 |
 * | 미래분 | 계산 종료일 = `min(임차 종료일, asOf)` | 소급 환급은 **이미 지급한** 월세에 대한 것이다 |
 * | 한도 | 연 `annualRentCap`(현행 1,000만원)까지만 공제 대상 | 규칙 테이블(`rules.ts`) |
 * | 반올림 | **내림(`Math.floor`)** | 원장 엔진(T1.4)의 연체료가 `floor` 다. 1원 미만은 신청자에게 유리하지 않은 쪽으로 버려 과다 안내를 피한다 |
 *
 * > ⚠️ 데모용 계산이다. 실제 세법 자문이 아니다.
 */
import { formatDateOnly, parseDateOnly } from "@/features/lease/rules";
import { lastDayOfMonth, utcDate } from "@/lib/rent";
import {
  NOT_ELIGIBLE_RATE,
  resolveCreditRatePercent,
  resolveRefundRule,
  retroYearRange,
} from "./rules";

/** 계산에 필요한 입력 전부. `POST /api/refund/calculate` 본문과 같은 모양이다. */
export type RefundCalcInput = {
  /** 연 총급여(원) */
  grossSalary: number;
  /** 월세(원/월) */
  monthlyRent: number;
  /** 임차 시작일 `YYYY-MM-DD` */
  startDate: string;
  /** 임차 종료일 `YYYY-MM-DD` */
  endDate: string;
};

/** 연도 한 줄. 화면 표의 행이자 T2.4 신청서의 소급 연도 항목이다. */
export type RefundYearRow = {
  /** 귀속연도 */
  year: number;
  /** 그 해에 지급한 것으로 본 개월 수 */
  months: number;
  /** 지급 월세 합계(원) = `months × monthlyRent` */
  paidRent: number;
  /** 공제 대상 월세(원) = `min(paidRent, annualRentCap)` */
  eligibleRent: number;
  /** 한도를 넘어 잘린 금액(원) */
  cappedOutRent: number;
  /** 그 해에 적용한 연 한도(원) */
  annualRentCap: number;
  /** 그 해에 적용한 공제율(%). 0 이면 대상 외 */
  creditRatePercent: number;
  /** 예상 환급액(원) = `floor(eligibleRent × creditRatePercent / 100)` */
  creditAmount: number;
};

export type RefundTotals = {
  months: number;
  paidRent: number;
  eligibleRent: number;
  cappedOutRent: number;
  creditAmount: number;
};

/**
 * 환급액이 0원인 이유. 화면이 문구를 갈아 끼우는 데 쓴다.
 * - `GROSS_SALARY_OVER` — 총급여가 규칙의 마지막 구간 상한을 넘었다(대상 외)
 * - `NO_ELIGIBLE_MONTHS` — 소급 범위 안에 지급한 달이 없다(기한 지난 기간·아직 한 달을 못 채운 기간)
 */
export type RefundIneligibleReason = "GROSS_SALARY_OVER" | "NO_ELIGIBLE_MONTHS";

export type RefundCalcResult = {
  /** 소급 기준일 `YYYY-MM-DD` — 이 값이 결과를 재현하는 열쇠다 */
  asOf: string;
  /** 계산에 쓴 입력 그대로(응답만 보고 재현할 수 있게) */
  input: RefundCalcInput;
  /** 소급 대상 연도 범위(양끝 포함) */
  retroRange: { fromYear: number; toYear: number };
  /** 실제로 센 기간 — 종료일은 `asOf` 까지 자른다. 셀 구간이 없으면 null */
  countedPeriod: { startDate: string; endDate: string } | null;
  /** 대표 공제율(%) — 기준일 연도 규칙 기준. 연도별 값은 각 행의 `creditRatePercent` 가 원본 */
  creditRatePercent: number;
  /** 지급한 달이 있는 연도만, 오름차순 */
  years: RefundYearRow[];
  totals: RefundTotals;
  /** 환급액이 0원일 때의 사유. 0원이 아니면 null */
  ineligibleReason: RefundIneligibleReason | null;
};

const EMPTY_TOTALS: RefundTotals = {
  months: 0,
  paidRent: 0,
  eligibleRent: 0,
  cappedOutRent: 0,
  creditAmount: 0,
};

/** 한 계약이 만들 수 있는 월 주기 상한(50년) — 잘못된 입력이 무한 루프가 되지 않게. */
const MAX_MONTH_PERIODS = 12 * 50;

/**
 * `base` 에서 `months` 개월 뒤 같은 날짜. 그 달에 없는 날이면 **말일로 당긴다**.
 *
 * 원장 엔진의 납부기한 말일 보정(`dueDateFor`)과 같은 규칙이다. 보정은 언제나
 * **원래 일자**에서 다시 계산하므로 1/31 → 2/28 → 3/31 로 돌아온다(날짜가 밀리지 않는다).
 */
export function addMonthsClamped(base: Date, months: number): Date {
  // 0-based 달 인덱스로 더한 뒤 연·월로 되돌린다(음수도 그대로 처리된다)
  const monthIndex = base.getUTCMonth() + months;
  const year = base.getUTCFullYear() + Math.floor(monthIndex / 12);
  const month = (((monthIndex % 12) + 12) % 12) + 1; // 1~12
  return utcDate(year, month, Math.min(base.getUTCDate(), lastDayOfMonth(year, month)));
}

/**
 * 임차 기간을 **월세 지급 개월**로 쪼개 연도별로 센다.
 *
 * k번째 주기는 `시작일 + k개월`(말일 보정)에 시작한다. 그 시작일이 `end` 이내면
 * 그 달치 월세를 지급한 것으로 보고, **시작일이 속한 연도**에 1개월을 얹는다.
 * 12개월 계약이면 정확히 12개월이 나오고(달력 월로 세면 13이 된다),
 * 한 달을 못 채운 자투리 기간은 주기가 시작만 했다면 1개월로 센다.
 */
export function rentMonthsByYear(start: Date, end: Date): Map<number, number> {
  const byYear = new Map<number, number>();
  if (end.getTime() < start.getTime()) return byYear;

  for (let k = 0; k < MAX_MONTH_PERIODS; k += 1) {
    const periodStart = addMonthsClamped(start, k);
    if (periodStart.getTime() > end.getTime()) break;
    const year = periodStart.getUTCFullYear();
    byYear.set(year, (byYear.get(year) ?? 0) + 1);
  }
  return byYear;
}

/**
 * 임차 시작일이 기준일보다 미래인가 — 그렇다면 아직 지급한 월세가 한 푼도 없다.
 * API 는 이걸 400 으로 막는다(계산 결과 0원을 돌려주면 오타를 알아채기 어렵다).
 */
export function isFutureStart(startDate: string, asOf: Date): boolean {
  const start = parseDateOnly(startDate);
  return start !== null && start.getTime() > asOf.getTime();
}

/**
 * 화면 기본값으로 쓰는 "최근 12개월" 기간.
 * 서버에서 만들어 클라이언트로 넘긴다 — 클라이언트가 `new Date()` 로 만들면
 * 서버 렌더와 하이드레이션 값이 갈릴 수 있다.
 */
export function defaultRefundPeriod(asOf: Date): { startDate: string; endDate: string } {
  const start = addMonthsClamped(asOf, -12);
  // 종료일이 asOf 이므로 시작을 하루 미뤄야 주기가 정확히 12개가 된다
  const startPlusOneDay = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startDate: formatDateOnly(startPlusOneDay), endDate: formatDateOnly(asOf) };
}

/** 금액 반올림 규칙 — **내림**. 1원 미만은 버린다(원장 엔진 `floor` 와 같은 방향). */
function creditOf(eligibleRent: number, ratePercent: number): number {
  if (ratePercent <= NOT_ELIGIBLE_RATE) return 0;
  // 둘 다 정수라 곱셈은 정확하다(최대 1,000만 × 17 = 1.7억, 안전 정수 범위)
  return Math.floor((eligibleRent * ratePercent) / 100);
}

/**
 * 환급 계산 본체.
 *
 * @param input 총급여·월세·임차 기간
 * @param asOf  소급 기준일(UTC 자정 달력 날짜). 운영은 `kstToday()`, 테스트는 고정 날짜를 넣는다
 *
 * 날짜 형식이 잘못됐거나 기간이 역전된 입력은 **호출 전에** zod(`schema.ts`)가 막는다.
 * 그래도 방어적으로: 파싱 실패·역전이면 빈 결과(`NO_ELIGIBLE_MONTHS`)를 돌려준다.
 */
export function calculateRefund(input: RefundCalcInput, asOf: Date): RefundCalcResult {
  const retroRange = retroYearRange(asOf);
  const representativeRate = resolveCreditRatePercent(
    input.grossSalary,
    resolveRefundRule(retroRange.toYear),
  );

  const base = {
    asOf: formatDateOnly(asOf),
    input,
    retroRange,
    creditRatePercent: representativeRate,
  };
  /** 계산할 게 없을 때의 사유 — 총급여가 대상 밖이면 그게 더 정확한 설명이다 */
  const emptyReason: RefundIneligibleReason =
    representativeRate === NOT_ELIGIBLE_RATE ? "GROSS_SALARY_OVER" : "NO_ELIGIBLE_MONTHS";
  const emptyResult = (
    countedPeriod: RefundCalcResult["countedPeriod"],
  ): RefundCalcResult => ({
    ...base,
    countedPeriod,
    years: [],
    totals: EMPTY_TOTALS,
    ineligibleReason: emptyReason,
  });

  const start = parseDateOnly(input.startDate);
  const end = parseDateOnly(input.endDate);
  if (!start || !end || end.getTime() < start.getTime()) return emptyResult(null);

  // 미래분은 세지 않는다 — 아직 내지 않은 월세다
  const countedEnd = end.getTime() > asOf.getTime() ? asOf : end;
  if (countedEnd.getTime() < start.getTime()) return emptyResult(null);

  const countedPeriod = {
    startDate: formatDateOnly(start),
    endDate: formatDateOnly(countedEnd),
  };
  const monthsByYear = rentMonthsByYear(start, countedEnd);

  const years: RefundYearRow[] = [];
  for (const year of [...monthsByYear.keys()].sort((a, b) => a - b)) {
    // 소급 기한이 지난 연도는 통째로 뺀다(범위 밖 미래 연도도 같이 걸러진다)
    if (year < retroRange.fromYear || year > retroRange.toYear) continue;

    const months = monthsByYear.get(year) ?? 0;
    const rule = resolveRefundRule(year);
    const ratePercent = resolveCreditRatePercent(input.grossSalary, rule);
    const paidRent = months * input.monthlyRent;
    const eligibleRent = Math.min(paidRent, rule.annualRentCap);

    years.push({
      year,
      months,
      paidRent,
      eligibleRent,
      cappedOutRent: paidRent - eligibleRent,
      annualRentCap: rule.annualRentCap,
      creditRatePercent: ratePercent,
      creditAmount: creditOf(eligibleRent, ratePercent),
    });
  }

  // 소급 범위 밖의 기간만 남은 경우 — 입력은 유효하니 "무엇을 셌는지"는 남겨 준다
  if (years.length === 0) return emptyResult(countedPeriod);

  const totals = years.reduce<RefundTotals>(
    (sum, row) => ({
      months: sum.months + row.months,
      paidRent: sum.paidRent + row.paidRent,
      eligibleRent: sum.eligibleRent + row.eligibleRent,
      cappedOutRent: sum.cappedOutRent + row.cappedOutRent,
      creditAmount: sum.creditAmount + row.creditAmount,
    }),
    EMPTY_TOTALS,
  );

  return {
    ...base,
    countedPeriod,
    years,
    totals,
    ineligibleReason: totals.creditAmount > 0 ? null : emptyReason,
  };
}
