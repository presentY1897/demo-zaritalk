/** 어드민 크론 트리거의 web 주소 해석 (T1.4). */
import { describe, expect, test } from "vitest";
import { WEB_URL_FALLBACK, resolveWebUrl } from "./shared";

describe("resolveWebUrl", () => {
  test("환경변수가 없거나 비면 로컬 기본값", () => {
    expect(resolveWebUrl(undefined)).toBe(WEB_URL_FALLBACK);
    expect(resolveWebUrl("")).toBe(WEB_URL_FALLBACK);
    expect(WEB_URL_FALLBACK).toBe("http://localhost:3000");
  });

  test("끝 슬래시를 떼어 `${base}/api/...` 로 이어 붙일 수 있게 한다", () => {
    expect(resolveWebUrl("https://demo-zaritalk.vercel.app/")).toBe(
      "https://demo-zaritalk.vercel.app",
    );
    expect(resolveWebUrl("http://localhost:3000///")).toBe("http://localhost:3000");
    expect(resolveWebUrl("https://demo-zaritalk.vercel.app")).toBe(
      "https://demo-zaritalk.vercel.app",
    );
  });
});
