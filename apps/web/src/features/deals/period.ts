/**
 * 수집 월(`DEAL_YMD`) 계산 — 순수 함수 (T4.3).
 *
 * 국토부 API 의 `DEAL_YMD` 는 `YYYYMM` 여섯 자리다. "오늘" 은 **KST 달력 기준**이고
 * (`@/lib/rent` 의 `kstYearMonth`), 날짜 컬럼은 UTC 자정으로 다룬다 — T1.4 가 정한 규칙을
 * 그대로 따른다. 여기서 규칙을 다시 만들지 않고 `@/lib/rent` 의 날짜 함수를 빌려 쓴다.
 *
 * ## 왜 "당월 + 최근 몇 달" 을 함께 긁는가
 *
 * 부동산거래신고법상 계약일로부터 **30일 이내 신고**라, 지난달 거래가 이번 달 내내 계속
 * 쌓인다. 당월만 긁으면 지난달 데이터가 영영 절반만 남는다. 그래서 크론은 매일
 * **당월 + 전월**을, 온디맨드는 **최근 3개월**을 훑는다(둘 다 멱등이라 겹쳐도 안전하다).
 */
import { kstYearMonth, previousMonth, utcDate, type YearMonth } from "@/lib/rent";

/** `DEAL_YMD` 형식 — `YYYYMM` */
export const DEAL_YM_PATTERN = /^\d{6}$/;

/** 크론이 매일 훑는 개월 수 — 당월 + 전월 */
export const CRON_MONTH_SPAN = 2;
/** 온디맨드(미수집 지역 첫 조회)가 훑는 개월 수 */
export const ON_DEMAND_MONTH_SPAN = 3;
/** 추이 차트가 보여 주는 최근 개월 수 */
export const TREND_MONTH_SPAN = 12;

/** `{ year: 2026, month: 7 }` → `"202607"` */
export function formatDealYm(ym: YearMonth): string {
  return `${ym.year}${String(ym.month).padStart(2, "0")}`;
}

/** `"202607"` → `{ year: 2026, month: 7 }`. 형식이 아니거나 달이 1~12 밖이면 `null` */
export function parseDealYm(raw: string): YearMonth | null {
  if (!DEAL_YM_PATTERN.test(raw)) return null;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  if (month < 1 || month > 12) return null;
  // 국토부 데이터는 2006년부터다. 그보다 앞이면 오타로 본다
  if (year < 2006 || year > 2100) return null;
  return { year, month };
}

/**
 * 오늘(KST)부터 과거로 `span` 개월. **최신 달이 앞**이다 — `["202609", "202608"]`.
 * `now` 를 넘길 수 있어 테스트가 시계에 의존하지 않는다.
 */
export function recentDealYms(span: number, now?: Date): string[] {
  let cursor = kstYearMonth(now);
  const out: string[] = [];
  for (let i = 0; i < span; i += 1) {
    out.push(formatDealYm(cursor));
    cursor = previousMonth(cursor);
  }
  return out;
}

/** 그 달의 시작(UTC 자정)과 다음 달 시작 — `dealDate` 범위 조회에 쓴다 */
export function monthRange(ym: YearMonth): { start: Date; end: Date } {
  const start = utcDate(ym.year, ym.month, 1);
  const end = ym.month === 12 ? utcDate(ym.year + 1, 1, 1) : utcDate(ym.year, ym.month + 1, 1);
  return { start, end };
}

/** `Date`(UTC 자정) → `"2026-07"` — 추이 집계의 버킷 키 */
export function ymKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** `"2026-07"` → 차트 라벨. 올해면 "7월", 다른 해면 "26.7월" */
export function ymLabel(ymKey: string, currentYear: number): string {
  const [yearRaw, monthRaw] = ymKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  return year === currentYear ? `${month}월` : `${String(year).slice(2)}.${month}월`;
}
