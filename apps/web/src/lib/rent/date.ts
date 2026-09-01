/**
 * 원장 엔진의 날짜 규칙 (T1.4) — 순수 함수, DB·타임존 라이브러리 없음.
 *
 * ## 타임존 규칙
 * - `@db.Date` 컬럼(`Lease.startDate/endDate`, `RentCharge.dueDate`)은 **UTC 자정**으로 다룬다.
 *   시드의 `d()` 와 같은 규칙이다. KST 자정(`T00:00:00+09:00`)으로 만들면 UTC 로는 전날 15:00 이라
 *   Postgres `date` 로 잘릴 때 하루가 밀린다.
 * - "오늘"은 **KST 달력 기준**으로 판정한다. 크론은 UTC 로 도는데 UTC 자정~KST 자정 사이 9시간 동안
 *   한국에서는 이미 다음 날이다. `kstToday()` 가 이 경계를 한 곳에서 처리한다 —
 *   KST 달력의 오늘을 **UTC 자정 Date** 로 돌려주므로 `dueDate` 와 그대로 비교할 수 있다.
 *
 * 즉 이 모듈이 다루는 Date 는 두 종류뿐이다:
 * ① 달력 날짜(UTC 자정) — 비교·차이 계산에 쓴다
 * ② 실제 시각(`now`) — `kstToday`/`kstYearMonth` 입력으로만 쓴다
 */

/** KST = UTC+9 */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 달력 날짜를 UTC 자정 Date 로. month 는 1~12. */
export function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** 시각에서 시·분·초를 떨어내 UTC 자정 Date 로 정규화한다. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** 그 달의 말일(28·29·30·31). month 는 1~12. */
export function lastDayOfMonth(year: number, month: number): number {
  // Date.UTC(y, month, 0) = "month 의 0일" = month 의 말일 (month 가 1-based 라 그대로 넣는다)
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 윤년 여부. 2월 말일 보정 테스트용으로 밖에서도 쓴다. */
export function isLeapYear(year: number): boolean {
  return lastDayOfMonth(year, 2) === 29;
}

/**
 * 특정 연월의 납부기한(UTC 자정).
 *
 * **말일 보정**: `paymentDay` 가 그 달에 없는 날이면 말일로 당긴다.
 * 31 → 2월이면 28(윤년 29), 30일 달이면 30. 1 미만은 1일로 올린다.
 */
export function dueDateFor(year: number, month: number, paymentDay: number): Date {
  const last = lastDayOfMonth(year, month);
  const day = Math.min(Math.max(1, Math.trunc(paymentDay)), last);
  return utcDate(year, month, day);
}

/** 날짜에 일수를 더한다(UTC 기준이라 DST 영향이 없다). */
export function addDays(date: Date, days: number): Date {
  return new Date(startOfUtcDay(date).getTime() + days * MS_PER_DAY);
}

/** `to - from` 일수. from 이 더 나중이면 음수. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / MS_PER_DAY);
}

/** KST 달력 기준 "오늘"을 UTC 자정 Date 로. `dueDate` 와 직접 비교할 수 있다. */
export function kstToday(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
  );
}

/** KST 달력 기준 연·월. 크론의 "당월", 장부의 월 집계(paidAt 기준)가 쓴다. */
export function kstYearMonth(now: Date = new Date()): { year: number; month: number } {
  const today = kstToday(now);
  return { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
}

/** UTC 자정 달력 날짜의 연·월. */
export function yearMonthOf(date: Date): { year: number; month: number } {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

/** 다음 달. 12월 → 다음 해 1월. */
export function nextMonth({ year, month }: { year: number; month: number }) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** 전월. 1월 → 전년 12월. */
export function previousMonth({ year, month }: { year: number; month: number }) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** `YYYY-MM-DD` — 응답·로그용. UTC 자정 달력 날짜 전제. */
export function formatDateKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}
