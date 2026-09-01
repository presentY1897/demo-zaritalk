import { describe, expect, test } from "vitest";
import {
  ANON_ID_MAX_AGE_SECONDS,
  createAnonId,
  isAnonId,
  readAnonIdFromCookieHeader,
  serializeAnonIdCookie,
} from "./anon-id";

describe("createAnonId / isAnonId", () => {
  test("발급한 값은 32자 hex 이고 매번 다르다", () => {
    const a = createAnonId();
    const b = createAnonId();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(isAnonId(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  test("형식이 다르면 우리 값이 아니다", () => {
    expect(isAnonId(undefined)).toBe(false);
    expect(isAnonId("")).toBe(false);
    expect(isAnonId("not-a-hex-id")).toBe(false);
    // 하이픈이 남은 UUID 는 우리가 발급한 형식이 아니다
    expect(isAnonId("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(false);
  });
});

describe("readAnonIdFromCookieHeader", () => {
  const id = createAnonId();

  test("여러 쿠키 사이에서 anonId 만 골라 읽는다", () => {
    expect(readAnonIdFromCookieHeader(`zari_session=abc; zari_anon=${id}; theme=dark`)).toBe(id);
  });

  test("헤더가 없거나 값이 깨졌으면 undefined", () => {
    expect(readAnonIdFromCookieHeader(null)).toBeUndefined();
    expect(readAnonIdFromCookieHeader("")).toBeUndefined();
    expect(readAnonIdFromCookieHeader("zari_session=abc")).toBeUndefined();
    expect(readAnonIdFromCookieHeader("zari_anon=not-our-format")).toBeUndefined();
  });
});

describe("serializeAnonIdCookie", () => {
  test("1년짜리 1st-party 쿠키로 굽고 HttpOnly 는 붙이지 않는다", () => {
    const id = createAnonId();
    const header = serializeAnonIdCookie(id);
    expect(header).toContain(`zari_anon=${id}`);
    expect(header).toContain(`Max-Age=${ANON_ID_MAX_AGE_SECONDS}`);
    expect(header).toContain("Path=/");
    expect(header).toContain("SameSite=Lax");
    // 클라이언트(A/B 배정·진단)가 읽어야 해서 httpOnly 를 쓰지 않는다
    expect(header).not.toContain("HttpOnly");
  });
});
