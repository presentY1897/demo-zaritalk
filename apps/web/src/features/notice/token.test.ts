import { expect, test } from "vitest";
import { createNoticeToken, isNoticeTokenShape } from "./token";

test("토큰은 32자 hex 이고 매번 다르다(추측 불가)", () => {
  const tokens = new Set(Array.from({ length: 500 }, () => createNoticeToken()));
  expect(tokens.size).toBe(500);
  for (const token of tokens) {
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(isNoticeTokenShape(token)).toBe(true);
  }
});

test("시드의 사람이 읽는 토큰도 형식 검사를 통과한다", () => {
  expect(isNoticeTokenShape("demo-notice-hong")).toBe(true);
  expect(isNoticeTokenShape("demo-overdue-park")).toBe(true);
});

test("형식이 아닌 값은 DB 조회 전에 걸러진다", () => {
  expect(isNoticeTokenShape("")).toBe(false);
  expect(isNoticeTokenShape("short")).toBe(false);
  expect(isNoticeTokenShape("../../etc/passwd")).toBe(false);
  expect(isNoticeTokenShape("A".repeat(40))).toBe(false); // 대문자 미허용
  expect(isNoticeTokenShape("a".repeat(65))).toBe(false); // 길이 상한
  expect(isNoticeTokenShape(null)).toBe(false);
});
