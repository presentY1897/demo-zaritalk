/**
 * proxy(Next 16 의 middleware 후신) 단위 테스트 — anonId 쿠키 발급과 matcher 범위.
 * matcher 검증은 Next 가 제공하는 테스트 유틸을 쓴다
 * (문서 표기는 `unstable_doesProxyMatch`, 16.3.3 이 실제로 내보내는 이름은 아래와 같다).
 */
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";
import {
  ANON_ID_COOKIE,
  ANON_ID_MAX_AGE_SECONDS,
  createAnonId,
  isAnonId,
} from "@/lib/tracking/anon-id";
import { config, proxy } from "./proxy";

describe("anonId 쿠키 발급", () => {
  test("쿠키가 없으면 발급해서 응답과 요청 양쪽에 심는다", () => {
    const request = new NextRequest("http://localhost:3000/notice/abc");

    const response = proxy(request);

    const cookie = response.cookies.get(ANON_ID_COOKIE);
    expect(isAnonId(cookie?.value)).toBe(true);
    expect(cookie?.maxAge).toBe(ANON_ID_MAX_AGE_SECONDS);
    expect(cookie?.path).toBe("/");
    // 클라이언트에서 읽을 수 있어야 한다(A/B 배정) — httpOnly 를 붙이지 않는다
    expect(cookie?.httpOnly).toBeFalsy();
    // 같은 요청을 이어받는 Route Handler·서버 컴포넌트도 방금 발급한 값을 읽을 수 있어야 한다
    expect(request.cookies.get(ANON_ID_COOKIE)?.value).toBe(cookie?.value);
  });

  test("이미 유효한 쿠키가 있으면 다시 발급하지 않는다", () => {
    const anonId = createAnonId();
    const request = new NextRequest("http://localhost:3000/", {
      headers: { cookie: `${ANON_ID_COOKIE}=${anonId}` },
    });

    const response = proxy(request);

    expect(response.cookies.get(ANON_ID_COOKIE)).toBeUndefined();
    expect(request.cookies.get(ANON_ID_COOKIE)?.value).toBe(anonId);
  });

  test("형식이 깨진 쿠키는 새 값으로 갈아끼운다", () => {
    const request = new NextRequest("http://localhost:3000/", {
      headers: { cookie: `${ANON_ID_COOKIE}=not-our-format` },
    });

    const response = proxy(request);

    expect(isAnonId(response.cookies.get(ANON_ID_COOKIE)?.value)).toBe(true);
  });
});

describe("matcher", () => {
  const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

  test("페이지·API 요청에서는 돈다", () => {
    expect(matches("/")).toBe(true);
    expect(matches("/notice/abc")).toBe(true);
    expect(matches("/api/track")).toBe(true);
  });

  test("정적 자산·_next·메타데이터 파일은 제외한다", () => {
    expect(matches("/_next/static/chunks/main.js")).toBe(false);
    expect(matches("/_next/image?url=%2Flogo.png")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);
    expect(matches("/robots.txt")).toBe(false);
    expect(matches("/logo.png")).toBe(false);
  });
});
