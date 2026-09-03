/**
 * 지표의 **시간 버킷** (T6.2) — 순수 함수, DB 없음.
 *
 * 모든 버킷은 **KST 달력** 기준이다. `createdAt`·`approvedAt` 같은 타임스탬프를 UTC 로 묶으면
 * 매일 `15:00Z~24:00Z`(= KST 다음 날 0~9시)에 생긴 데이터가 하루 앞으로 밀린다.
 * [T1.6 장부](../../../../../docs/tasks/t1.6-ledger.md)가 같은 이유로 `kstYearMonth` 를 쓰고,
 * 이 프로젝트는 실제로 그 하루 밀림을 겪었다. 그래서 경계 처리를 원장 엔진 함수에 맡긴다.
 */
import { KST_OFFSET_MS, kstToday, kstYearMonth, previousMonth } from "@/lib/rent";

/** `YYYY-MM-DD` — 그 시각이 KST 달력에서 며칠인가. */
export function kstDateKey(at: Date): string {
  return new Date(at.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** `YYYY-MM` — 월 버킷 키. */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** 그 시각이 속한 KST 월 버킷 키. */
export function kstMonthKey(at: Date): string {
  const { year, month } = kstYearMonth(at);
  return monthKey(year, month);
}

/** 오늘(포함)까지 거슬러 올라간 `days` 일치의 `YYYY-MM-DD` — 오래된 날짜가 앞. */
export function recentDayKeys(days: number, now: Date = new Date()): string[] {
  const today = kstToday(now);
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(new Date(today.getTime() - offset * 86_400_000).toISOString().slice(0, 10));
  }
  return keys;
}

export type MonthBucketKey = { year: number; month: number; key: string; label: string };

/** 이번 달(포함)까지 거슬러 올라간 `count` 개월 — 오래된 달이 앞. */
export function recentMonths(count: number, now: Date = new Date()): MonthBucketKey[] {
  let cursor = kstYearMonth(now);
  const months: MonthBucketKey[] = [];
  for (let index = 0; index < count; index += 1) {
    months.unshift({
      year: cursor.year,
      month: cursor.month,
      key: monthKey(cursor.year, cursor.month),
      label: `${cursor.year}.${String(cursor.month).padStart(2, "0")}`,
    });
    cursor = previousMonth(cursor);
  }
  return months;
}

/** 일 버킷 조회 범위의 시작 — `days` 일 전 KST 자정의 실제 시각(UTC). */
export function dayRangeStart(days: number, now: Date = new Date()): Date {
  const today = kstToday(now);
  return new Date(today.getTime() - (days - 1) * 86_400_000 - KST_OFFSET_MS);
}

/** 월 버킷 조회 범위의 시작 — `count` 개월 전 1일 KST 자정의 실제 시각(UTC). */
export function monthRangeStart(count: number, now: Date = new Date()): Date {
  const first = recentMonths(count, now)[0] ?? kstYearMonth(now);
  return new Date(Date.UTC(first.year, first.month - 1, 1) - KST_OFFSET_MS);
}

/** 비율 — 분모가 0이면 0 (빈 데이터에서 NaN 이 화면에 새지 않게). */
export function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}
