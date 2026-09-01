/**
 * 원장 엔진 날짜 규칙 단위 테스트 (T1.4). DB 없이 돈다.
 * 최소 테스트 축 ⑤ **말일 보정**이 여기 있다.
 */
import { describe, expect, test } from "vitest";
import {
  addDays,
  daysBetween,
  dueDateFor,
  formatDateKey,
  isLeapYear,
  kstToday,
  kstYearMonth,
  lastDayOfMonth,
  nextMonth,
  previousMonth,
  startOfUtcDay,
  utcDate,
  yearMonthOf,
} from "./date";

const iso = (date: Date) => date.toISOString();

describe("말일 보정 (축 ⑤)", () => {
  test("paymentDay=31 이면 2월은 그 달 말일로 당겨진다", () => {
    expect(iso(dueDateFor(2026, 2, 31))).toBe("2026-02-28T00:00:00.000Z");
  });

  test("윤년 2월은 29일로 보정된다", () => {
    expect(isLeapYear(2028)).toBe(true);
    expect(iso(dueDateFor(2028, 2, 31))).toBe("2028-02-29T00:00:00.000Z");
    expect(iso(dueDateFor(2028, 2, 29))).toBe("2028-02-29T00:00:00.000Z");
  });

  test("30일 달도 31 → 30 으로 보정된다", () => {
    expect(iso(dueDateFor(2026, 4, 31))).toBe("2026-04-30T00:00:00.000Z");
    expect(iso(dueDateFor(2026, 6, 31))).toBe("2026-06-30T00:00:00.000Z");
  });

  test("31일 달은 그대로 31일", () => {
    expect(iso(dueDateFor(2026, 1, 31))).toBe("2026-01-31T00:00:00.000Z");
    expect(iso(dueDateFor(2026, 12, 31))).toBe("2026-12-31T00:00:00.000Z");
  });

  test("보정이 필요 없는 날은 그대로", () => {
    expect(iso(dueDateFor(2026, 9, 5))).toBe("2026-09-05T00:00:00.000Z");
  });

  test("0·음수 납부일은 1일로 올린다(스키마상 1~31 이지만 방어)", () => {
    expect(iso(dueDateFor(2026, 3, 0))).toBe("2026-03-01T00:00:00.000Z");
    expect(iso(dueDateFor(2026, 3, -5))).toBe("2026-03-01T00:00:00.000Z");
  });

  test("납부기한은 UTC 자정이다 (@db.Date 컬럼 규칙)", () => {
    const due = dueDateFor(2026, 9, 5);
    expect(due.getUTCHours()).toBe(0);
    expect(due.getUTCMinutes()).toBe(0);
  });
});

describe("lastDayOfMonth", () => {
  test.each([
    [2026, 1, 31],
    [2026, 2, 28],
    [2028, 2, 29],
    [2026, 4, 30],
    [2026, 12, 31],
  ])("%i-%i 의 말일은 %i", (year, month, expected) => {
    expect(lastDayOfMonth(year, month)).toBe(expected);
  });
});

describe("KST 경계", () => {
  test("UTC 로 전날 15:00 이후면 KST 는 이미 다음 날", () => {
    // 2026-09-01T15:00Z = 2026-09-02T00:00+09:00
    expect(iso(kstToday(new Date("2026-09-01T15:00:00Z")))).toBe("2026-09-02T00:00:00.000Z");
    expect(iso(kstToday(new Date("2026-09-01T14:59:59Z")))).toBe("2026-09-01T00:00:00.000Z");
  });

  test("월 경계도 KST 기준으로 넘어간다", () => {
    expect(kstYearMonth(new Date("2026-08-31T15:00:00Z"))).toEqual({ year: 2026, month: 9 });
    expect(kstYearMonth(new Date("2026-08-31T14:00:00Z"))).toEqual({ year: 2026, month: 8 });
  });

  test("kstToday 는 UTC 자정이라 dueDate 와 바로 비교된다", () => {
    const today = kstToday(new Date("2026-09-01T09:30:00Z"));
    expect(today.getTime()).toBe(utcDate(2026, 9, 1).getTime());
  });
});

describe("일수 계산", () => {
  test("daysBetween 은 뒤 날짜가 클수록 양수", () => {
    expect(daysBetween(utcDate(2026, 7, 5), utcDate(2026, 8, 5))).toBe(31);
    expect(daysBetween(utcDate(2026, 8, 5), utcDate(2026, 9, 5))).toBe(31);
    expect(daysBetween(utcDate(2026, 9, 5), utcDate(2026, 9, 5))).toBe(0);
    expect(daysBetween(utcDate(2026, 9, 6), utcDate(2026, 9, 5))).toBe(-1);
  });

  test("2월을 건너뛰는 구간(윤년/평년)", () => {
    expect(daysBetween(utcDate(2027, 2, 5), utcDate(2027, 3, 5))).toBe(28);
    expect(daysBetween(utcDate(2028, 2, 5), utcDate(2028, 3, 5))).toBe(29);
  });

  test("시각이 섞여 들어와도 날짜만 본다", () => {
    expect(daysBetween(new Date("2026-09-01T23:59:00Z"), new Date("2026-09-02T00:01:00Z"))).toBe(1);
  });

  test("addDays / startOfUtcDay", () => {
    expect(iso(addDays(utcDate(2026, 9, 1), 90))).toBe("2026-11-30T00:00:00.000Z");
    expect(iso(addDays(utcDate(2026, 12, 31), 1))).toBe("2027-01-01T00:00:00.000Z");
    expect(iso(startOfUtcDay(new Date("2026-09-01T13:22:11Z")))).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("연월 이동", () => {
  test("nextMonth / previousMonth 는 해를 넘긴다", () => {
    expect(nextMonth({ year: 2026, month: 12 })).toEqual({ year: 2027, month: 1 });
    expect(previousMonth({ year: 2026, month: 1 })).toEqual({ year: 2025, month: 12 });
    expect(nextMonth({ year: 2026, month: 8 })).toEqual({ year: 2026, month: 9 });
    expect(previousMonth({ year: 2026, month: 9 })).toEqual({ year: 2026, month: 8 });
  });

  test("yearMonthOf / formatDateKey", () => {
    expect(yearMonthOf(utcDate(2026, 9, 5))).toEqual({ year: 2026, month: 9 });
    expect(formatDateKey(new Date("2026-09-05T11:00:00Z"))).toBe("2026-09-05");
  });
});
