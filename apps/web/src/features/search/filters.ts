/**
 * 매물 탐색 필터 (T3.2) — **정의는 여기 한 곳뿐이다.** 화면 칩·쿼리스트링·서버 조회가 같은 값을 본다.
 *
 * ## 쿼리 형식은 `filters=<JSON>` 이 아니라 **평평한 파라미터**다
 *
 * ```
 * /api/listings?bounds=…&dealType=WOLSE&depositMax=20000000&rentMax=700000
 * ```
 *
 * task 표에는 `?bounds=&filters=` 라고만 적혀 있었다. JSON 을 한 파라미터에 우겨넣으면
 * ①URL 이 길어지고 ②`parseQuery`(D1 공용 헬퍼)가 그대로 못 쓰이며 ③주소창에 남은 필터를
 * 사람이 읽을 수 없다. 그래서 **필드마다 파라미터 하나**로 폈다 — 나머지 목록 API(`/api/posts`)와도
 * 같은 모양이다.
 *
 * ## 금액은 원 단위 정수다
 *
 * 화면 칩은 "1,000만원 이하" 처럼 만원으로 말하지만 **파라미터는 언제나 원**이다(`10000000`).
 * `Listing.deposit`·`monthlyRent` 가 원 단위 `Int` 라 변환 지점을 하나도 만들지 않기 위해서다.
 *
 * ## 전세와 월세 범위가 만나는 곳
 *
 * 전세 매물은 `monthlyRent === 0` 이다(T3.1 스키마가 그렇게 강제한다). 그래서
 * **`rentMin > 0` 을 걸면 전세는 자동으로 빠진다** — 별도 규칙이 아니라 데이터의 성질이다.
 * 반대로 `rentMax` 만 걸면 전세도 함께 남는다(0 ≤ rentMax). 문서와 화면 도움말에 그대로 적었다.
 */
import type { DealTypeValue } from "@/features/landlord/types";
import { formatMoneyKo } from "@/features/listing/price";

export type SearchFilters = {
  /** null 이면 전세·월세 모두 */
  dealType: DealTypeValue | null;
  depositMin: number | null;
  depositMax: number | null;
  rentMin: number | null;
  rentMax: number | null;
};

export const EMPTY_FILTERS: SearchFilters = {
  dealType: null,
  depositMin: null,
  depositMax: null,
  rentMin: null,
  rentMax: null,
};

/** 한 번에 돌려주는 매물 수 — 지도 하나에 이보다 많은 핀은 읽히지 않는다 */
export const DEFAULT_SEARCH_LIMIT = 100;
export const MAX_SEARCH_LIMIT = 200;

/** 금액 상한 — T3.1 등록 스키마(`features/listing/schema.ts`)와 같은 기준 */
export const SEARCH_AMOUNT_MAX = 2_000_000_000;

/** 보증금 칩 — 원 단위. `null` 은 "상한 없음" */
export const DEPOSIT_STEPS: readonly { label: string; value: number | null }[] = [
  { label: "전체", value: null },
  { label: "1,000만 이하", value: 10_000_000 },
  { label: "3,000만 이하", value: 30_000_000 },
  { label: "5,000만 이하", value: 50_000_000 },
  { label: "1억 이하", value: 100_000_000 },
];

/** 월세 칩 — 원 단위 */
export const RENT_STEPS: readonly { label: string; value: number | null }[] = [
  { label: "전체", value: null },
  { label: "30만 이하", value: 300_000 },
  { label: "50만 이하", value: 500_000 },
  { label: "70만 이하", value: 700_000 },
  { label: "100만 이하", value: 1_000_000 },
];

export const DEAL_TYPE_OPTIONS: readonly { label: string; value: DealTypeValue | null }[] = [
  { label: "전체", value: null },
  { label: "전세", value: "JEONSE" },
  { label: "월세", value: "WOLSE" },
];

/** 필터가 하나라도 걸려 있는가 — "필터 n" 배지·초기화 버튼 노출에 쓴다 */
export function activeFilterCount(filters: SearchFilters): number {
  return (Object.keys(EMPTY_FILTERS) as (keyof SearchFilters)[]).filter(
    (key) => filters[key] !== null,
  ).length;
}

/**
 * 필터가 바뀌었는지 비교하는 키. 지도 이동 재조회 판정(`needsRefetch`)과
 * Tanstack Query 캐시 키가 **같은 문자열**을 쓴다.
 */
export function filtersKey(filters: SearchFilters): string {
  return [
    filters.dealType ?? "",
    filters.depositMin ?? "",
    filters.depositMax ?? "",
    filters.rentMin ?? "",
    filters.rentMax ?? "",
  ].join("|");
}

/** 최소 > 최대 처럼 뒤집힌 범위인가 — 라우트가 400 으로, 화면이 안내 문구로 쓴다 */
export function invalidRangeMessage(filters: SearchFilters): string | null {
  if (
    filters.depositMin !== null &&
    filters.depositMax !== null &&
    filters.depositMin > filters.depositMax
  ) {
    return "보증금 최소 금액이 최대 금액보다 큽니다.";
  }
  if (filters.rentMin !== null && filters.rentMax !== null && filters.rentMin > filters.rentMax) {
    return "월세 최소 금액이 최대 금액보다 큽니다.";
  }
  return null;
}

/** 필터 → 쿼리스트링 조각. **값이 없는 파라미터는 아예 넣지 않는다**(빈 값은 400이다). */
export function filtersToParams(filters: SearchFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.dealType) params.dealType = filters.dealType;
  if (filters.depositMin !== null) params.depositMin = String(filters.depositMin);
  if (filters.depositMax !== null) params.depositMax = String(filters.depositMax);
  if (filters.rentMin !== null) params.rentMin = String(filters.rentMin);
  if (filters.rentMax !== null) params.rentMax = String(filters.rentMax);
  return params;
}

/**
 * 화면 상단 요약 문구 — "월세 · 보증금 1,000만 이하".
 *
 * 칩에 없는 값이 주소로 들어올 수 있으므로(예: `?depositMax=17000000`) 라벨을 찾지 못하면
 * 금액을 직접 적는다 — "제한" 같은 뭉뚱그린 말로 넘기지 않는다.
 */
export function filterSummary(filters: SearchFilters): string {
  const parts: string[] = [];
  if (filters.dealType) parts.push(filters.dealType === "JEONSE" ? "전세" : "월세");

  if (filters.depositMax !== null) {
    const step = DEPOSIT_STEPS.find((option) => option.value === filters.depositMax);
    parts.push(`보증금 ${step?.label ?? `${formatMoneyKo(filters.depositMax)} 이하`}`);
  }
  if (filters.depositMin !== null && filters.depositMin > 0) {
    parts.push(`보증금 ${formatMoneyKo(filters.depositMin)} 이상`);
  }
  if (filters.rentMax !== null) {
    const step = RENT_STEPS.find((option) => option.value === filters.rentMax);
    parts.push(`월세 ${step?.label ?? `${formatMoneyKo(filters.rentMax)} 이하`}`);
  }
  if (filters.rentMin !== null && filters.rentMin > 0) {
    parts.push(`월세 ${formatMoneyKo(filters.rentMin)} 이상`);
  }

  return parts.length > 0 ? parts.join(" · ") : "전체 매물";
}
