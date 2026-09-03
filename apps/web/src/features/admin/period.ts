/**
 * 어드민 이벤트 로그의 **기간 필터** (T6.3) — KST 달력 하루가 어디부터 어디까지인지 한 곳에서 정한다.
 *
 * `TrackingEvent.createdAt` 은 타임스탬프(UTC)고, 운영자가 고르는 것은 **KST 달력 날짜**다.
 * 9시간을 어디서 더할지 실수하면 하루가 통째로 밀린다 — 원장 엔진이 `kstToday()` 로 이 경계를
 * 한 곳에 모은 것과 같은 이유로 여기도 함수 하나에 가둔다. `KST_OFFSET_MS` 는 엔진 것을 그대로 쓴다.
 *
 * 범위는 **`[from 00:00 KST, to 24:00 KST)`** — 끝 날짜를 포함한다(운영자가 "오늘까지" 라고 할 때의 뜻).
 *
 * 순수 함수라 DB 없이 테스트한다.
 */
import { KST_OFFSET_MS } from "@/lib/rent";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` 인가 (달력상 실재하는 날짜인지까지 본다) */
export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  );
}

/** KST 달력 날짜(UTC 자정)를 `YYYY-MM-DD` 로 */
export function toDateKey(date: Date): string {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

export type EventRange = {
  /** 화면·응답에 그대로 되돌려 주는 KST 날짜 키 */
  from: string;
  to: string;
  /** 쿼리에 넣는 실제 경계 — `createdAt >= gte AND createdAt < lt` */
  gte: Date;
  lt: Date;
};

/**
 * KST 날짜 키 두 개를 UTC 반열린 구간으로 바꾼다.
 * `from > to` 로 뒤집혀 오면 **말없이 바로잡는다** — 운영자가 두 칸을 거꾸로 채운 것뿐이다.
 */
export function kstDayRange(fromKey: string, toKey: string): EventRange {
  const [from, to] = fromKey <= toKey ? [fromKey, toKey] : [toKey, fromKey];
  const startUtcMidnight = Date.parse(`${from}T00:00:00.000Z`);
  const endUtcMidnight = Date.parse(`${to}T00:00:00.000Z`);
  return {
    from,
    to,
    gte: new Date(startUtcMidnight - KST_OFFSET_MS),
    lt: new Date(endUtcMidnight + MS_PER_DAY - KST_OFFSET_MS),
  };
}

/** 기본 구간 — 오늘 포함 최근 7일(KST) */
export function defaultEventRange(now: Date = new Date()): { from: string; to: string } {
  const to = toDateKey(now);
  const from = toDateKey(new Date(now.getTime() - 6 * MS_PER_DAY));
  return { from, to };
}

/** KST 기준 시(0~23) — 시간대별 카운트 버킷 키 */
export function kstHourOf(date: Date): number {
  return new Date(date.getTime() + KST_OFFSET_MS).getUTCHours();
}
