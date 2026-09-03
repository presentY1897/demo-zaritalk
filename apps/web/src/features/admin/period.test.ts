/**
 * 이벤트 기간 필터(KST 경계) 단위 테스트 (T6.3). DB 없이 돈다.
 * 하루가 밀리는 사고를 막는 것이 이 파일의 전부다.
 */
import { describe, expect, test } from "vitest";
import { defaultEventRange, isDateKey, kstDayRange, kstHourOf, toDateKey } from "./period";

describe("날짜 키", () => {
  test.each([
    ["2026-09-03", true],
    ["2026-02-29", false],
    ["2028-02-29", true],
    ["2026-13-01", false],
    ["2026-9-3", false],
    ["", false],
  ])("%s → %s", (value, expected) => {
    expect(isDateKey(value)).toBe(expected);
  });

  test("UTC 로 전날 15:00 이후면 KST 는 이미 다음 날", () => {
    expect(toDateKey(new Date("2026-09-01T15:00:00Z"))).toBe("2026-09-02");
    expect(toDateKey(new Date("2026-09-01T14:59:59Z"))).toBe("2026-09-01");
  });
});

describe("KST 하루 구간", () => {
  test("시작은 그날 00:00 KST(= 전날 15:00 UTC)", () => {
    const range = kstDayRange("2026-09-01", "2026-09-01");
    expect(range.gte.toISOString()).toBe("2026-08-31T15:00:00.000Z");
  });

  test("끝 날짜를 **포함**한다 — 다음 날 00:00 KST 직전까지", () => {
    const range = kstDayRange("2026-09-01", "2026-09-01");
    expect(range.lt.toISOString()).toBe("2026-09-01T15:00:00.000Z");
  });

  test("여러 날은 그대로 이어진다", () => {
    const range = kstDayRange("2026-09-01", "2026-09-03");
    expect(range.gte.toISOString()).toBe("2026-08-31T15:00:00.000Z");
    expect(range.lt.toISOString()).toBe("2026-09-03T15:00:00.000Z");
  });

  test("거꾸로 넣으면 말없이 바로잡는다", () => {
    expect(kstDayRange("2026-09-03", "2026-09-01")).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-03",
    });
  });
});

describe("시간대 버킷", () => {
  test("UTC 00:00 은 KST 09시다", () => {
    expect(kstHourOf(new Date("2026-09-01T00:00:00Z"))).toBe(9);
  });

  test("UTC 15:00 은 KST 다음 날 0시다", () => {
    expect(kstHourOf(new Date("2026-09-01T15:00:00Z"))).toBe(0);
  });

  test("23시 경계", () => {
    expect(kstHourOf(new Date("2026-09-01T14:59:59Z"))).toBe(23);
  });
});

describe("기본 구간", () => {
  test("오늘 포함 최근 7일", () => {
    const range = defaultEventRange(new Date("2026-09-10T03:00:00Z"));
    expect(range).toEqual({ from: "2026-09-04", to: "2026-09-10" });
  });
});
