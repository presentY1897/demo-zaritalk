/**
 * 실거래가 알림 매칭 규칙 — **정의는 여기 한 곳뿐이다** (T4.4). 순수 함수라 DB 없이 테스트한다.
 *
 * `TransactionAlert` 는 세 칸짜리 구독이다: `lawdCd`(필수) · `aptName`(선택) · `dealType`(선택).
 * **선택 칸이 비어 있으면 "전부"** 라는 뜻이고, 세 칸은 **AND** 로 걸린다.
 *
 * | 구독 | 뜻 | 매칭되는 거래 |
 * |---|---|---|
 * | `11200 / null / null` | 성동구 전부 | 성동구의 모든 신규 거래 |
 * | `11200 / null / JEONSE` | 성동구 전세만 | 성동구 + 전세 |
 * | `11200 / 신금호파크자이 / null` | 그 단지 전부 | 성동구 + 그 단지 + 모든 유형 |
 * | `11200 / 신금호파크자이 / WOLSE` | 그 단지 월세만 | 셋 다 일치 |
 *
 * ## 단지명은 **공백을 지운 뒤 완전일치**다
 *
 * 부분일치(`includes`)로 하면 "자이" 구독이 "래미안자이"·"자이르네" 까지 잡아 알림이 시끄러워지고,
 * 무엇이 잡힐지 사용자가 예측할 수 없다. 그래서 완전일치로 두되 **공백만 무시**한다
 * (`e편한세상 금호파크힐스` ↔ `e편한세상금호파크힐스` 처럼 표기가 흔들린다).
 * 대신 구독 시트는 자유 입력이 아니라 **그 지역에서 실제로 수집된 단지 목록에서 고르게** 한다
 * — 그래서 "골랐는데 안 온다" 가 생기지 않는다.
 *
 * ## 알림은 **구독 1건 × 수집 실행 1회 = 1건**이다
 *
 * 한 번 수집에 그 단지 거래가 12건 새로 들어와도 알림톡은 한 줄이다(본문에 상위 몇 건을 적는다).
 * 거래마다 보내면 지역 전체 구독 한 명에게 수백 건이 쌓인다 — 시뮬레이터라도 그건 거짓말이다.
 */
import { normalizeAptName } from "./parse";
import { DEAL_TYPE_META, formatDealAmount, formatDealArea, formatDealDate } from "./labels";
import type { RealDealTypeValue } from "./types";

/** 매칭에 필요한 구독의 최소 모양 */
export type AlertSubscriptionLike = {
  lawdCd: string;
  aptName: string | null;
  dealType: RealDealTypeValue | null;
};

/** 매칭에 필요한 거래의 최소 모양 */
export type AlertDealLike = {
  lawdCd: string;
  aptName: string;
  dealType: RealDealTypeValue;
};

/** 구독 1건이 거래 1건을 잡는가 — 세 칸 AND, 빈 칸은 "전부" */
export function alertMatches(alert: AlertSubscriptionLike, deal: AlertDealLike): boolean {
  if (alert.lawdCd !== deal.lawdCd) return false;
  if (alert.dealType !== null && alert.dealType !== deal.dealType) return false;
  if (alert.aptName !== null) {
    if (normalizeAptName(alert.aptName) !== normalizeAptName(deal.aptName)) return false;
  }
  return true;
}

/** 구독 1건이 이번 수집에서 잡은 거래들 */
export function matchDeals<T extends AlertDealLike>(
  alert: AlertSubscriptionLike,
  deals: readonly T[],
): T[] {
  return deals.filter((deal) => alertMatches(alert, deal));
}

/** 알림 본문에 나열할 최대 거래 수 — 나머지는 "외 N건" 으로 접는다 */
export const ALERT_DEAL_PREVIEW = 3;

export type AlertMessageDeal = AlertDealLike & {
  areaM2: number;
  floor: number | null;
  dealDate: string;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
};

/**
 * 알림톡 시뮬(`MessageLog`) 제목·본문 (T1.7 패턴).
 * `MessageKind` 에 실거래가 전용 값이 없어 `ETC` 를 쓴다(스키마는 이 task 소유가 아니다).
 */
export function buildAlertMessage(input: {
  regionLabel: string;
  alert: AlertSubscriptionLike;
  deals: readonly AlertMessageDeal[];
}): { title: string; body: string } {
  const scope = input.alert.aptName ?? input.regionLabel;
  const typeLabel = input.alert.dealType
    ? DEAL_TYPE_META[input.alert.dealType].label
    : "실거래";
  const title = `[자리] ${scope} ${typeLabel} 신규 실거래 ${input.deals.length}건`;

  const lines = input.deals.slice(0, ALERT_DEAL_PREVIEW).map((deal) => {
    const floor = deal.floor === null ? "" : ` ${deal.floor}층`;
    return `· ${formatDealDate(deal.dealDate)} ${deal.aptName} ${formatDealArea(deal.areaM2)}${floor} — ${DEAL_TYPE_META[deal.dealType].label} ${formatDealAmount(deal)}`;
  });
  const rest = input.deals.length - lines.length;
  if (rest > 0) lines.push(`· 외 ${rest}건`);

  return {
    title,
    body: [
      `구독하신 «${scope} · ${typeLabel}» 에 새 실거래가 등록되었습니다.`,
      ...lines,
      "자리 앱 > 실거래가에서 전체 내역을 확인해 주세요.",
    ].join("\n"),
  };
}
