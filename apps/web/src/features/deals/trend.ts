/**
 * 단지별(·지역별) 추이 집계 — 순수 함수 (T4.4). DB 없이 테스트한다.
 *
 * 월별로 묶어 **대표 금액의 평균·최소·최대**를 낸다. "대표 금액" 은 유형이 정한다:
 *
 * | 유형 | 대표 금액 | 함께 보여 주는 값 |
 * |---|---|---|
 * | `SALE` 매매 | 매매가 | — |
 * | `JEONSE` 전세 | 보증금 | — |
 * | `WOLSE` 월세 | **보증금** | 월세 평균(막대 옆 라벨) |
 *
 * 월세를 보증금 하나로 세우면 "보증금 1,000/월 80" 과 "보증금 3억/월 0" 이 같은 키로 섞이지만,
 * 막대는 보증금, 라벨은 월세를 함께 적어 **한 줄에서 둘 다 읽히게** 했다. 두 축을 한 차트에
 * 겹쳐 그리는 것보다 480px 에서 정직하다.
 *
 * 평균은 **내림**이다(T1.4 의 반올림 규칙과 같은 방향). 만원 단위라 1만원 미만이 잘린다.
 */
import { TREND_MONTH_SPAN, ymKeyOf, ymLabel } from "./period";
import type { DealTrendDto, DealTrendPointDto, RealDealTypeValue } from "./types";

/** 집계에 필요한 거래의 최소 모양 */
export type TrendSourceDeal = {
  dealType: RealDealTypeValue;
  dealDate: Date;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
};

/** 유형별 대표 금액(만원). 값이 없으면 `null`(집계에서 뺀다) */
export function representativeAmount(deal: TrendSourceDeal): number | null {
  if (deal.dealType === "SALE") return deal.price;
  return deal.deposit;
}

/**
 * 월별 집계. **오래된 달이 앞**이라 차트가 왼쪽(위)에서 오른쪽(아래)으로 시간순으로 읽힌다.
 * 거래가 없는 달은 점을 만들지 않는다 — 국토부 데이터는 달마다 건수가 들쭉날쭉해서
 * 빈 달을 0으로 채우면 "그 달에 거래가 0건" 이라는 거짓말이 된다(수집을 안 한 것일 수도 있다).
 */
export function buildTrend(
  deals: readonly TrendSourceDeal[],
  input: { apartmentName: string | null; currentYear: number; span?: number },
): DealTrendDto {
  const buckets = new Map<string, { amounts: number[]; rents: number[] }>();

  for (const deal of deals) {
    const amount = representativeAmount(deal);
    if (amount === null) continue;
    const key = ymKeyOf(deal.dealDate);
    const bucket = buckets.get(key) ?? { amounts: [], rents: [] };
    bucket.amounts.push(amount);
    if (deal.dealType === "WOLSE" && deal.monthlyRent !== null) bucket.rents.push(deal.monthlyRent);
    buckets.set(key, bucket);
  }

  const points: DealTrendPointDto[] = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, bucket]) => {
      const sum = bucket.amounts.reduce((total, value) => total + value, 0);
      const rentSum = bucket.rents.reduce((total, value) => total + value, 0);
      return {
        ym,
        label: ymLabel(ym, input.currentYear),
        count: bucket.amounts.length,
        avgAmount: Math.floor(sum / bucket.amounts.length),
        minAmount: Math.min(...bucket.amounts),
        maxAmount: Math.max(...bucket.amounts),
        avgMonthlyRent: bucket.rents.length > 0 ? Math.floor(rentSum / bucket.rents.length) : null,
      };
    });

  const span = input.span ?? TREND_MONTH_SPAN;
  return {
    apartmentName: input.apartmentName,
    // 최근 span 개월만 — 앞(오래된 쪽)을 잘라낸다
    points: points.slice(Math.max(0, points.length - span)),
  };
}
