/**
 * 어드민 표시 포맷·쿼리 조립 단위 테스트 (T6.3).
 * 시각이 배포 타임존에 흔들리지 않는지(KST 고정)가 핵심이다.
 */
import { describe, expect, test } from "vitest";
import { firstParam, formatDate, formatDateTime, formatKrw, hrefWith } from "./format";

describe("시각은 언제나 KST 로 읽는다", () => {
  test("UTC 00:00 은 KST 09:00 이다", () => {
    expect(formatDateTime("2026-09-03T00:00:00.000Z")).toBe("2026.09.03 09:00");
  });

  test("UTC 로 전날 15:00 이후면 KST 는 이미 다음 날", () => {
    expect(formatDateTime("2026-09-02T15:00:00.000Z")).toBe("2026.09.03 00:00");
  });

  test("빈 값은 —", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
});

describe("날짜", () => {
  test("@db.Date 문자열은 그대로 점으로 바꾼다(시간대 변환 없음)", () => {
    expect(formatDate("2026-09-03")).toBe("2026.09.03");
  });

  test("ISO 는 KST 로 변환해 날짜만", () => {
    expect(formatDate("2026-09-02T15:00:00.000Z")).toBe("2026.09.03");
  });
});

describe("금액", () => {
  test("천 단위 구분 + 원", () => {
    expect(formatKrw(1_015_500)).toBe("1,015,500원");
    expect(formatKrw(0)).toBe("0원");
  });
});

describe("hrefWith — 현재 필터를 유지한 채 일부만 바꾼다", () => {
  test("빈 값·undefined 는 빼서 필터 해제가 표현된다", () => {
    expect(hrefWith("/leases", { status: "ACTIVE", page: "2" }, { status: undefined, page: 1 })).toBe(
      "/leases?page=1",
    );
  });

  test("나머지 필터는 그대로 남는다", () => {
    expect(hrefWith("/leases", { q: "박세입", status: "ACTIVE", page: "1" }, { page: 3 })).toBe(
      "/leases?q=%EB%B0%95%EC%84%B8%EC%9E%85&status=ACTIVE&page=3",
    );
  });

  test("모두 비면 쿼리 없는 경로", () => {
    expect(hrefWith("/users", { q: undefined, page: undefined })).toBe("/users");
  });
});

describe("firstParam", () => {
  test("배열이면 첫 값, 빈 문자열은 undefined", () => {
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam("")).toBeUndefined();
    expect(firstParam(undefined)).toBeUndefined();
  });
});
