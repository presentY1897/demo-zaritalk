/**
 * 월세 세액공제 **연도별 상수 테이블** (T2.3).
 *
 * 세법은 해마다 바뀐다. 그래서 공제율·한도·소급 연수를 계산 코드에 박지 않고
 * **귀속연도에 묶인 상수**로 분리한다 — 개정분이 나오면 `REFUND_TAX_RULES` 에
 * 엔트리 한 줄을 얹기만 하면 되고, `calc.ts` 는 한 줄도 바뀌지 않는다.
 *
 * ## 지금 담긴 규칙 (현행)
 *
 * | 총급여(연) | 공제율 |
 * |---|---|
 * | 5,500만원 **이하** | 17% |
 * | 5,500만원 초과 ~ 8,000만원 **이하** | 15% |
 * | 8,000만원 초과 | 대상 외(0%) |
 *
 * - 공제 대상 월세는 **연 1,000만원 한도**. 넘는 금액은 잘라 낸다.
 * - 소급은 기준일 연도를 **포함해 5개 연도**(`REFUND_RETRO_YEARS`).
 *
 * ## 이 파일은 DB·React 를 모른다
 *
 * 순수 상수·순수 함수만 둔다. API(`/api/refund/calculate`)와 화면, 그리고
 * [T2.4 환급 신청](../../../../../docs/tasks/t2.4-refund-apply.md)이 **같은 표**를 본다.
 *
 * > ⚠️ 데모용 계산이다. 실제 세법 자문이 아니다 — 화면에도 같은 문구를 띄운다.
 */

/** 총급여 구간 하나 — `upToGrossSalary` **이하**면 이 구간의 공제율을 쓴다. */
export type RefundCreditBracket = {
  /** 이 구간에 들어가는 연 총급여 상한(원, 이 값 **포함**) */
  upToGrossSalary: number;
  /** 공제율(%) */
  creditRatePercent: number;
};

/** 한 시점부터 적용되는 세액공제 규칙 묶음. */
export type RefundTaxRule = {
  /** 이 규칙이 적용되기 시작하는 **귀속연도**(이 연도 포함) */
  effectiveFrom: number;
  /** 공제 대상 월세의 연 한도(원) */
  annualRentCap: number;
  /** 총급여 구간 — `upToGrossSalary` **오름차순**. 마지막 구간의 상한을 넘으면 대상 외 */
  brackets: readonly RefundCreditBracket[];
};

/**
 * 귀속연도별 규칙 테이블 — `effectiveFrom` **오름차순**.
 *
 * 지금은 현행 규칙 한 벌만 담는다(task 가 정한 5,500/8,000·1,000만원 그대로).
 * 개정 이력을 얹을 때는 이 배열에 엔트리를 추가한다. 예를 들어 "2027년 귀속부터
 * 한도 1,200만원" 이 되면:
 *
 * ```ts
 * { effectiveFrom: 2027, annualRentCap: 12_000_000, brackets: CURRENT_BRACKETS },
 * ```
 *
 * 한 줄이면 끝이고, 2026년 이전 계산 결과는 그대로 유지된다.
 */
export const REFUND_TAX_RULES: readonly RefundTaxRule[] = [
  {
    effectiveFrom: 2020,
    annualRentCap: 10_000_000,
    brackets: [
      { upToGrossSalary: 55_000_000, creditRatePercent: 17 },
      { upToGrossSalary: 80_000_000, creditRatePercent: 15 },
    ],
  },
];

/**
 * 소급 가능한 **연도 수** — 기준일이 속한 연도를 포함해 5개.
 *
 * 즉 기준일이 2026년이면 2022 ~ 2026년분이 대상이고 2021년분은 기한이 지난 것으로 본다.
 */
export const REFUND_RETRO_YEARS = 5;

/** 대상 외(공제율 0%)를 뜻하는 값. 화면·응답에서 "대상 외" 판정에 그대로 쓴다. */
export const NOT_ELIGIBLE_RATE = 0;

/**
 * 귀속연도에 적용할 규칙.
 *
 * `effectiveFrom` 이 그 연도 이하인 것 중 **가장 최근** 규칙을 쓴다.
 * 테이블보다 오래된 연도는 **가장 오래된 규칙**을 그대로 적용한다 —
 * 소급 범위(5년)가 테이블 범위 안이라 실제로는 걸리지 않지만, null 분기를
 * 계산식에 끌어들이지 않으려고 값을 항상 돌려준다.
 */
export function resolveRefundRule(year: number): RefundTaxRule {
  let picked = REFUND_TAX_RULES[0]!;
  for (const rule of REFUND_TAX_RULES) {
    if (rule.effectiveFrom <= year) picked = rule;
  }
  return picked;
}

/**
 * 연 총급여 → 공제율(%). 마지막 구간 상한을 넘으면 `NOT_ELIGIBLE_RATE`(0).
 *
 * 경계는 **이하**다 — 5,500만원 정확히는 17%, 여기에 1원만 더해도 15%,
 * 8,000만원 정확히는 15%, 여기에 1원만 더하면 대상 외.
 */
export function resolveCreditRatePercent(grossSalary: number, rule: RefundTaxRule): number {
  for (const bracket of rule.brackets) {
    if (grossSalary <= bracket.upToGrossSalary) return bracket.creditRatePercent;
  }
  return NOT_ELIGIBLE_RATE;
}

/**
 * 소급 대상 연도 범위 — 기준일 연도를 **포함**해 최근 `REFUND_RETRO_YEARS` 개.
 *
 * 기준일(`asOf`)은 KST 달력의 오늘(`kstToday()`)을 UTC 자정으로 받은 값이다.
 * "오늘"을 이 함수 안에서 만들지 않는 이유는 계산이 시계에 의존하면 테스트가
 * 날짜에 따라 흔들리기 때문이다 — 크론(T1.4)이 `now` 를 주입받는 것과 같은 이유다.
 */
export function retroYearRange(asOf: Date): { fromYear: number; toYear: number } {
  const toYear = asOf.getUTCFullYear();
  return { fromYear: toYear - (REFUND_RETRO_YEARS - 1), toYear };
}
