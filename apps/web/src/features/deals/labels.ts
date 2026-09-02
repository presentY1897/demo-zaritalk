/**
 * 실거래가 표시값 (T4.3·T4.4) — 라벨·톤·금액 포맷을 한 곳에 모은다.
 * `Badge` 는 `tone` 만 받는다([T0.6](../../../../../docs/tasks/t0.6-ui-tokens.md)) — 색을 직접 쓰지 않는다.
 *
 * **금액은 전부 만원 단위**로 들어온다(`./types.ts` 머리말). 여기 포맷터만 그것을 사람 말로 편다.
 */
import type { BadgeTone } from "@zari/ui";
import type { RealDealTypeValue } from "./types";

export const DEAL_TYPE_META: Record<
  RealDealTypeValue,
  { label: string; tone: BadgeTone; /** 목록 카드에서 대표 금액에 붙는 이름 */ amountLabel: string }
> = {
  SALE: { label: "매매", tone: "brand", amountLabel: "매매가" },
  JEONSE: { label: "전세", tone: "info", amountLabel: "보증금" },
  WOLSE: { label: "월세", tone: "success", amountLabel: "보증금" },
};

/** 탭 순서 — 매매 · 전세 · 월세 */
export const DEAL_TYPE_TABS: { key: RealDealTypeValue; label: string }[] = [
  { key: "SALE", label: "매매" },
  { key: "JEONSE", label: "전세" },
  { key: "WOLSE", label: "월세" },
];

/**
 * 만원 단위 금액 → 사람 말. **입력이 만원이라는 것을 잊지 말 것.**
 *
 * | 입력(만원) | 출력 |
 * |---|---|
 * | `249000` | `12억 4,900만원` |
 * | `100000` | `10억원` |
 * | `8500` | `8,500만원` |
 * | `0` | `0원` |
 */
export function formatManwonAmount(manwon: number): string {
  if (!Number.isFinite(manwon)) return "-";
  if (manwon === 0) return "0원";
  const negative = manwon < 0;
  const value = Math.abs(Math.trunc(manwon));
  const eok = Math.floor(value / 10_000);
  const rest = value % 10_000;
  const body =
    eok > 0
      ? rest > 0
        ? `${eok.toLocaleString("ko-KR")}억 ${rest.toLocaleString("ko-KR")}만원`
        : `${eok.toLocaleString("ko-KR")}억원`
      : `${value.toLocaleString("ko-KR")}만원`;
  return negative ? `-${body}` : body;
}

/** 목록 카드의 대표 금액 한 줄 — 월세는 "보증금 3,000만원 / 월 55만원" */
export function formatDealAmount(deal: {
  dealType: RealDealTypeValue;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
}): string {
  if (deal.dealType === "SALE") return formatManwonAmount(deal.price ?? 0);
  const deposit = formatManwonAmount(deal.deposit ?? 0);
  if (deal.dealType === "JEONSE") return deposit;
  return `${deposit} / 월 ${formatManwonAmount(deal.monthlyRent ?? 0)}`;
}

/** 전용면적 84.96 → "84.96㎡ (25.7평)" — 소수점은 원본 그대로 두고 평만 반올림한다 */
export function formatDealArea(areaM2: number): string {
  const pyeong = areaM2 / 3.3058;
  return `${areaM2}㎡ (${pyeong.toFixed(1)}평)`;
}

/** 층 — 국토부가 비워 보내면 "-", 지하는 "지하 1층" */
export function formatFloor(floor: number | null): string {
  if (floor === null) return "층 정보 없음";
  if (floor < 0) return `지하 ${Math.abs(floor)}층`;
  return `${floor}층`;
}

/** "2026-07-14" → "2026.07.14" */
export function formatDealDate(isoDate: string): string {
  return isoDate.slice(0, 10).replaceAll("-", ".");
}

/** 구독 한 줄 요약 — "서울 성동구 · 신금호파크자이 · 전세" */
export function alertSummary(input: {
  regionLabel: string;
  aptName: string | null;
  dealType: RealDealTypeValue | null;
}): string {
  return [
    input.regionLabel,
    input.aptName ?? "단지 전체",
    input.dealType ? DEAL_TYPE_META[input.dealType].label : "모든 유형",
  ].join(" · ");
}
