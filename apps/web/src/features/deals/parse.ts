/**
 * 국토부 `<item>` → 저장 가능한 거래 한 줄 (T4.3). **순수 함수 — DB·네트워크를 모른다.**
 *
 * ## ① 금액은 만원 단위 + 콤마 섞인 문자열이다
 *
 * ```xml
 * <deposit>35,000</deposit>      <!-- 3억 5천만원 -->
 * <monthlyRent>250</monthlyRent> <!-- 250만원 -->
 * <dealAmount>249,000</dealAmount>
 * ```
 *
 * **콤마를 떼고 정수로 읽되, 단위는 만원 그대로 둔다.** 원으로 환산하지 않는다 —
 * 스키마 주석이 `RealTransaction` 만 원본 단위(만원)라고 못 박았다. 여기서 10,000 을 곱하면
 * 프로젝트에서 유일하게 API 원본과 대조할 수 있는 값이 사라진다.
 *
 * ## ② 빈 값은 `""` 가 아니라 공백 한 칸으로 온다
 *
 * `<contractTerm> </contractTerm>` · `<buildYear> </buildYear>` · `<floor> </floor>` 가 실제로
 * 온다(실호출 확인). `xml.ts` 가 이미 `trim` 해 주므로 여기서는 **빈 문자열 = 값 없음**으로 본다.
 *
 * ## ③ 유형은 응답이 아니라 **엔드포인트 + 월세액**이 정한다
 *
 * | 엔드포인트 | 조건 | `RealDealType` |
 * |---|---|---|
 * | `RTMSDataSvcAptTrade` (매매) | — | `SALE` (`price` = `dealAmount`) |
 * | `RTMSDataSvcAptRent` (전월세) | `monthlyRent === 0` | `JEONSE` (`deposit`, `monthlyRent = 0`) |
 * | `RTMSDataSvcAptRent` (전월세) | `monthlyRent > 0` | `WOLSE` (`deposit`, `monthlyRent`) |
 *
 * ## ④ 버리는 행
 *
 * - 단지명·전용면적·거래일·대표 금액 중 하나라도 없으면 버린다(저장해도 화면에 못 그린다).
 * - **해제된 매매**(`cdealType === "O"`)는 저장하지 않는다 — 취소된 계약이라 시세가 아니다.
 *   (이미 저장한 뒤에 해제되는 경우는 잡지 못한다 → task 문서의 "스키마가 필요했던 것" 참고.)
 *
 * ## ⑤ 멱등의 열쇠 — 서명(signature)
 *
 * 국토부 응답에는 **행을 가리키는 고유 id 가 없다.** `aptSeq` 는 단지 식별자이지 거래 식별자가
 * 아니다. 그래서 "같은 거래" 는 내용으로 정의한다 —
 * `지역·유형·단지·면적·층·거래일·금액·건축년도` 가 모두 같으면 같은 행이다.
 *
 * 그런데 **내용이 완전히 같은 행이 한 응답에 두 번 오는 일이 실제로 있다**(같은 날 같은 단지
 * 같은 층·면적·보증금 계약 둘). 실호출 응답에서 확인했다. 그래서 서명만으로 dedupe 하면
 * 거래 건수가 줄어든다. 수집기는 **서명이 같은 행을 세어(count) 개수를 맞춘다** —
 * 자세한 규칙은 `./sync.ts` 의 "멱등" 절에 있다.
 */
import { utcDate } from "@/lib/rent";
import type { RealDealTypeValue } from "./types";
import type { MolitXmlItem } from "./xml";

/** 어느 엔드포인트에서 온 행인가 */
export type MolitEndpointKey = "TRADE" | "RENT";

/** DB 에 넣을 수 있는 모양까지 정규화한 거래 한 줄. 금액은 전부 **만원** */
export type NormalizedDeal = {
  lawdCd: string;
  dealType: RealDealTypeValue;
  aptName: string;
  areaM2: number;
  floor: number | null;
  /** UTC 자정 — `@db.Date` 컬럼 규칙(T1.4) */
  dealDate: Date;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  builtYear: number | null;
  /** 원본 item 그대로 — `RealTransaction.raw` 에 남긴다(나중에 필드가 더 필요해지면 여기서 꺼낸다) */
  raw: MolitXmlItem;
};

/** 파싱 결과 — 버린 행 수를 함께 돌려준다(수집 결과 표에 그대로 실린다) */
export type ParseOutcome = { deals: NormalizedDeal[]; discarded: number };

/**
 * `"35,000"` → `35000` (만원). 빈 값·공백·숫자가 아니면 `null`.
 * 음수는 오지 않지만 들어와도 부호를 유지한다(버리지 않고 드러낸다).
 */
export function parseManwon(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.replaceAll(",", "").replaceAll(" ", "").trim();
  if (cleaned === "") return null;
  if (!/^-?\d+$/.test(cleaned)) return null;
  return Number.parseInt(cleaned, 10);
}

/** `"84.96"` → `84.96`. 0 이하·빈 값·숫자 아님은 `null` */
export function parseAreaM2(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.replaceAll(",", "").trim();
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

/** `"11"` → `11`, `"-1"` → `-1`(지하), `" "` → `null` */
export function parseFloorValue(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.replaceAll(",", "").trim();
  if (cleaned === "") return null;
  if (!/^-?\d+$/.test(cleaned)) return null;
  return Number.parseInt(cleaned, 10);
}

/** `"2016"` → `2016`. 범위를 벗어나거나 빈 값이면 `null` */
export function parseYearValue(raw: string | undefined): number | null {
  const value = parseFloorValue(raw);
  if (value === null) return null;
  return value >= 1800 && value <= 2100 ? value : null;
}

/** `dealYear`·`dealMonth`·`dealDay` → UTC 자정 Date. 하나라도 이상하면 `null` */
export function parseDealDate(item: MolitXmlItem): Date | null {
  const year = parseFloorValue(item.dealYear);
  const month = parseFloorValue(item.dealMonth);
  const day = parseFloorValue(item.dealDay);
  if (year === null || month === null || day === null) return null;
  if (year < 2006 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const date = utcDate(year, month, day);
  // 2월 30일 같은 값이 오면 Date 가 다음 달로 넘어간다 — 그런 행은 버린다
  if (date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return date;
}

/** 단지명 정규화 — 공백만 지운다(대소문자·한글은 그대로). 검색·알림 매칭이 같은 함수를 쓴다 */
export function normalizeAptName(name: string): string {
  return name.replaceAll(/\s+/g, "");
}

/** `<item>` 하나 → 거래 한 줄. 저장할 수 없는 행이면 `null` */
export function toNormalizedDeal(
  item: MolitXmlItem,
  input: { lawdCd: string; endpoint: MolitEndpointKey },
): NormalizedDeal | null {
  // 해제(취소)된 매매는 시세가 아니다
  if ((item.cdealType ?? "").trim().toUpperCase() === "O") return null;

  const aptName = (item.aptNm ?? "").trim();
  if (aptName === "") return null;

  const areaM2 = parseAreaM2(item.excluUseAr);
  if (areaM2 === null) return null;

  const dealDate = parseDealDate(item);
  if (dealDate === null) return null;

  const base = {
    lawdCd: input.lawdCd,
    aptName,
    areaM2,
    floor: parseFloorValue(item.floor),
    dealDate,
    builtYear: parseYearValue(item.buildYear),
    raw: item,
  };

  if (input.endpoint === "TRADE") {
    const price = parseManwon(item.dealAmount);
    if (price === null || price <= 0) return null;
    return { ...base, dealType: "SALE", price, deposit: null, monthlyRent: null };
  }

  const deposit = parseManwon(item.deposit);
  if (deposit === null || deposit < 0) return null;
  // 월세 칸이 비어 있으면 0(= 전세)으로 본다 — 실제로 `<monthlyRent>0</monthlyRent>` 가 온다
  const monthlyRent = parseManwon(item.monthlyRent) ?? 0;
  return {
    ...base,
    dealType: monthlyRent > 0 ? "WOLSE" : "JEONSE",
    price: null,
    deposit,
    monthlyRent,
  };
}

/** 응답 items 전체를 정규화한다. 버린 행 수를 함께 돌려준다 */
export function normalizeDeals(
  items: readonly MolitXmlItem[],
  input: { lawdCd: string; endpoint: MolitEndpointKey },
): ParseOutcome {
  const deals: NormalizedDeal[] = [];
  let discarded = 0;
  for (const item of items) {
    const deal = toNormalizedDeal(item, input);
    if (deal) deals.push(deal);
    else discarded += 1;
  }
  return { deals, discarded };
}

/**
 * **같은 거래인지 판정하는 유일한 기준.** 저장된 행과 새로 받은 행에 같은 함수를 쓴다.
 *
 * 면적은 소수 둘째 자리까지만 본다 — `84.417` 처럼 셋째 자리가 오는 단지가 있고, DB 는
 * `Float` 라 왕복하면서 끝자리가 흔들릴 수 있다. 둘째 자리면 같은 평형을 구분하기에 충분하다.
 */
export function dealSignature(deal: {
  lawdCd: string;
  dealType: RealDealTypeValue;
  aptName: string;
  areaM2: number;
  floor: number | null;
  dealDate: Date;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  builtYear: number | null;
}): string {
  return [
    deal.lawdCd,
    deal.dealType,
    normalizeAptName(deal.aptName),
    deal.areaM2.toFixed(2),
    deal.floor ?? "",
    deal.dealDate.toISOString().slice(0, 10),
    deal.price ?? "",
    deal.deposit ?? "",
    deal.monthlyRent ?? "",
    deal.builtYear ?? "",
  ].join("|");
}
