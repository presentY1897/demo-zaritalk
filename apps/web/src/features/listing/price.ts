/**
 * 매물 금액 표기 (T3.2·T3.3) — **지도 핀·카드·상세·메타·JSON-LD 가 같은 함수를 쓴다.**
 *
 * 금액 문자열이 화면마다 다르면 "핀에서 본 그 집" 인지 알 수 없다. 그래서 서버가
 * `priceLabel`·`pinLabel` 을 **응답에 담아** 내려보내고(`features/search/queries.ts`),
 * 화면은 그 문자열을 그대로 쓴다.
 *
 * `@zari/db` 를 import 하지 않는 순수 모듈이다(핀 라벨은 브라우저에서 그려진다).
 */
import type { DealTypeValue } from "@/features/landlord/types";

/** 1만원 */
const MAN = 10_000;
/** 1억원 */
const EOK = 100_000_000;

const comma = (value: number): string => value.toLocaleString("ko-KR");

/**
 * 원 단위 금액을 한국식 축약으로. 0 이면 `"0원"`.
 *
 * | 입력 | 출력 |
 * |---|---|
 * | `500_000` | `50만` |
 * | `10_000_000` | `1,000만` |
 * | `100_000_000` | `1억` |
 * | `250_000_000` | `2억 5,000만` |
 * | `12_345` | `1만 2,345원` |
 *
 * 만원으로 떨어지지 않는 금액(마지막 줄)은 **원 단위까지 그대로** 보여 준다 —
 * 임의로 반올림하면 "50만" 인 줄 알고 들어온 사람이 상세에서 다른 금액을 보게 된다.
 */
export function formatMoneyKo(won: number): string {
  if (!Number.isFinite(won)) return "-";
  if (won === 0) return "0원";

  const sign = won < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(won));

  const eok = Math.floor(abs / EOK);
  const man = Math.floor((abs % EOK) / MAN);
  const rest = abs % MAN;

  const parts: string[] = [];
  if (eok > 0) parts.push(`${comma(eok)}억`);
  if (man > 0) parts.push(`${comma(man)}만`);
  if (rest > 0) parts.push(`${comma(rest)}원`);

  return sign + parts.join(" ");
}

/** 원 단위 금액 전체 표기 — `1,000,000원` */
export function formatWon(won: number): string {
  return `${comma(Math.trunc(won))}원`;
}

export type PriceInput = {
  dealType: DealTypeValue;
  deposit: number;
  /** 전세면 0 */
  monthlyRent: number;
};

/** 거래유형 라벨 — 배지·필터 칩이 함께 쓴다 */
export const DEAL_TYPE_LABEL: Record<DealTypeValue, string> = {
  JEONSE: "전세",
  WOLSE: "월세",
};

/**
 * 카드·상세·문서 제목용 전체 표기.
 * - 전세: `전세 2억 5,000만`
 * - 월세: `월세 1,000만/50만`
 */
export function priceLabel(input: PriceInput): string {
  if (input.dealType === "JEONSE") return `전세 ${formatMoneyKo(input.deposit)}`;
  return `월세 ${formatMoneyKo(input.deposit)}/${formatMoneyKo(input.monthlyRent)}`;
}

/**
 * 지도 핀 위에 얹는 짧은 표기 — 핀은 겹쳐 놓이므로 **한눈에 읽히는 한 값**만 쓴다.
 * - 전세: `전세 2억`(보증금)
 * - 월세: `월 50만`(월세) — 보증금은 카드에서 본다
 */
export function pinLabel(input: PriceInput): string {
  if (input.dealType === "JEONSE") return `전세 ${formatMoneyKo(input.deposit)}`;
  return `월 ${formatMoneyKo(input.monthlyRent)}`;
}

/** 면적 — `23.1㎡ (약 7.0평)`. 평은 반올림 1자리. */
export function formatArea(areaM2: number | null): string | null {
  if (areaM2 === null || !Number.isFinite(areaM2) || areaM2 <= 0) return null;
  const pyeong = areaM2 / 3.3058;
  return `${areaM2}㎡ (약 ${pyeong.toFixed(1)}평)`;
}

/** 층 — `1층` / `지하 1층`. 없으면 null */
export function formatFloor(floor: number | null): string | null {
  if (floor === null || !Number.isInteger(floor)) return null;
  return floor < 0 ? `지하 ${Math.abs(floor)}층` : `${floor}층`;
}

/** 방 수 — `원룸`(1) / `투룸`(2) / `3룸`(3+). 0·null 이면 null */
export function formatRooms(rooms: number | null): string | null {
  if (rooms === null || !Number.isInteger(rooms) || rooms <= 0) return null;
  if (rooms === 1) return "원룸";
  if (rooms === 2) return "투룸";
  return `${rooms}룸`;
}

/** `YYYY-MM-DD` → `2026.11.01`. null 이면 "즉시 입주" */
export function formatAvailableFrom(value: string | null): string {
  if (!value) return "즉시 입주";
  return `${value.replaceAll("-", ".")} 입주 가능`;
}
