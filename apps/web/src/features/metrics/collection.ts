/**
 * 수납률 집계 (T6.2) — 순수 함수, DB 없음.
 *
 * ## 산식
 *
 * ```
 * 청구액(charged)     = Σ calcTotalDue(청구)            // 월세+관리비+전월이월+연체료
 * 미납액(outstanding) = Σ calcOutstanding(청구액, 납부합)  // 청구별로 max(0, 청구-납부)
 * 수납액(collected)   = 청구액 − 미납액
 * 수납률(rate)        = 수납액 / 청구액                  // 청구가 없으면 0
 * ```
 *
 * **금액 계산을 새로 만들지 않았다** — `calcTotalDue`·`sumPayments`·`calcOutstanding` 은 전부
 * 원장 엔진([T1.4](../../../../../docs/tasks/t1.4-rent-engine.md))의 함수다. 여기서 다시 더하면
 * 수납 화면(T1.5)·장부(T1.6)와 숫자가 어긋난다.
 *
 * ## 왜 "납부 합계 ÷ 청구액" 이 아닌가
 *
 * 초과 납부가 있으면 그 달 수납률이 100%를 넘어 다른 달의 미납을 가려 버린다.
 * **청구별로** 미납을 구해 더하면(초과분은 그 청구에서 0으로 잘린다) 수납률이 0~100% 안에 있고,
 * "아직 못 받은 돈" 과 정확히 반대 값이 된다. T1.5 가 초과 납부를 400 으로 막으므로 실제
 * 데이터에서는 두 산식이 같지만, 지표는 데이터가 이상해도 거짓말을 하지 않아야 한다.
 *
 * ## 버킷은 **청구의 연·월**이다 (`paidAt` 이 아니라)
 *
 * "청구 대비 납부" 가 수납률이므로 분모(청구)의 달에 분자(납부)를 붙여야 한다.
 * 8월 청구를 9월에 늦게 받았어도 그것은 **8월 수납률**을 채운다.
 * 장부(T1.6)가 현금주의(`paidAt`)를 쓰는 것과 기준이 다르고, 그 이유가 이것이다.
 */
import { calcOutstanding, calcTotalDue, sumPayments, type ChargeAmounts } from "@/lib/rent";
import { monthKey, ratio, type MonthBucketKey } from "./series";

export type CollectionChargeInput = ChargeAmounts & {
  year: number;
  month: number;
  payments: readonly { amount: number }[];
};

export type CollectionBucket = {
  key: string;
  label: string;
  year: number;
  month: number;
  chargedAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
  chargeCount: number;
  /** 미납이 0인 청구 수 — "몇 건이 완납됐나" */
  settledCount: number;
  /** 0~1 */
  rate: number;
};

export type CollectionSummary = {
  months: CollectionBucket[];
  total: Omit<CollectionBucket, "key" | "label" | "year" | "month">;
};

function emptyBucket(month: MonthBucketKey): CollectionBucket {
  return {
    key: month.key,
    label: month.label,
    year: month.year,
    month: month.month,
    chargedAmount: 0,
    collectedAmount: 0,
    outstandingAmount: 0,
    chargeCount: 0,
    settledCount: 0,
    rate: 0,
  };
}

/**
 * 월별 수납률. `months` 에 준 버킷은 **청구가 없어도 0으로 나온다**(차트에 구멍이 생기지 않게).
 * 버킷 밖의 청구는 무시한다 — 조회 범위와 버킷이 같은 경계를 쓰게 하는 것은 호출부 책임이다.
 */
export function buildCollectionRate(
  charges: readonly CollectionChargeInput[],
  months: readonly MonthBucketKey[],
): CollectionSummary {
  const buckets = new Map<string, CollectionBucket>(
    months.map((month) => [month.key, emptyBucket(month)]),
  );

  let chargedAmount = 0;
  let outstandingAmount = 0;
  let chargeCount = 0;
  let settledCount = 0;

  for (const charge of charges) {
    const bucket = buckets.get(monthKey(charge.year, charge.month));
    if (!bucket) continue;

    const due = calcTotalDue(charge);
    const paid = sumPayments(charge.payments);
    const outstanding = calcOutstanding(due, paid);

    bucket.chargedAmount += due;
    bucket.outstandingAmount += outstanding;
    bucket.chargeCount += 1;
    if (outstanding === 0) bucket.settledCount += 1;

    chargedAmount += due;
    outstandingAmount += outstanding;
    chargeCount += 1;
    if (outstanding === 0) settledCount += 1;
  }

  const monthList = [...buckets.values()].map((bucket) => ({
    ...bucket,
    collectedAmount: bucket.chargedAmount - bucket.outstandingAmount,
    rate: ratio(bucket.chargedAmount - bucket.outstandingAmount, bucket.chargedAmount),
  }));

  return {
    months: monthList,
    total: {
      chargedAmount,
      collectedAmount: chargedAmount - outstandingAmount,
      outstandingAmount,
      chargeCount,
      settledCount,
      rate: ratio(chargedAmount - outstandingAmount, chargedAmount),
    },
  };
}
