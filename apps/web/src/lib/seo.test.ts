import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { absoluteUrl, siteUrl, siteUrlObject } from "./seo";

const KEYS = [
  "SITE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_WEB_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("siteUrl — 도출 우선순위", () => {
  test("아무 것도 없으면 로컬", () => {
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  test("VERCEL_URL 이 있으면 https 로 붙인다 (프리뷰 배포)", () => {
    process.env.VERCEL_URL = "demo-zaritalk-abc123.vercel.app";
    expect(siteUrl()).toBe("https://demo-zaritalk-abc123.vercel.app");
  });

  test("프로덕션 도메인이 프리뷰보다 우선한다", () => {
    process.env.VERCEL_URL = "preview.vercel.app";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "demo-zaritalk.vercel.app";
    expect(siteUrl()).toBe("https://demo-zaritalk.vercel.app");
  });

  test("서버 전용 SITE_URL 이 NEXT_PUBLIC 보다 우선한다 — 후자는 빌드 시점에 굳는다", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://build-time.example.com";
    process.env.SITE_URL = "https://runtime.example.com";
    expect(siteUrl()).toBe("https://runtime.example.com");
  });

  test("명시 환경변수가 무엇보다 우선한다", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "demo-zaritalk.vercel.app";
    process.env.NEXT_PUBLIC_SITE_URL = "https://zari.example.com";
    expect(siteUrl()).toBe("https://zari.example.com");
  });

  test("끝의 슬래시는 떼어 낸다 — canonical 이 //  로 겹치지 않게", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://zari.example.com///";
    expect(siteUrl()).toBe("https://zari.example.com");
    expect(absoluteUrl("/search")).toBe("https://zari.example.com/search");
  });
});

describe("absoluteUrl", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://zari.example.com";
  });

  test("앞 슬래시가 없어도 붙여 준다", () => {
    expect(absoluteUrl("deals")).toBe("https://zari.example.com/deals");
  });

  test("중첩 경로도 도메인 바로 아래에 붙는다 (상대 해석으로 잘리지 않게)", () => {
    expect(absoluteUrl("/listings/abc123")).toBe("https://zari.example.com/listings/abc123");
  });

  test("siteUrlObject 는 metadataBase 로 쓸 수 있는 URL 이다", () => {
    expect(siteUrlObject().origin).toBe("https://zari.example.com");
  });
});
