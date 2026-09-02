/**
 * 마스터 유료 플랜 판정 단위 테스트 (T5.2) — **DB 없이 돈다**(순수 모듈).
 * 화면(업그레이드 안내)과 서버(추천 대상 선정)가 이 판정을 같이 쓴다.
 */
import { describe, expect, test } from "vitest";
import { demoPlanUntil, isProActive, MASTER_PLAN_META } from "./plan";

const NOW = new Date("2026-09-02T00:00:00.000Z");

describe("isProActive", () => {
  test("FREE 는 만료일이 남아 있어도 false", () => {
    expect(isProActive("FREE", new Date("2027-01-01T00:00:00.000Z"), NOW)).toBe(false);
  });

  test("PRO + 만료 없음(null) 이면 true", () => {
    expect(isProActive("PRO", null, NOW)).toBe(true);
  });

  test("PRO + 만료일이 미래면 true", () => {
    expect(isProActive("PRO", new Date("2026-09-03T00:00:00.000Z"), NOW)).toBe(true);
  });

  test("PRO 라도 만료일이 지났으면 false — 결제가 끊긴 계정에 추천이 가면 안 된다", () => {
    expect(isProActive("PRO", new Date("2026-09-01T23:59:59.000Z"), NOW)).toBe(false);
  });

  test("만료 시각이 정확히 지금이면 아직 유효하다(경계값 포함)", () => {
    expect(isProActive("PRO", NOW, NOW)).toBe(true);
  });

  test("ISO 문자열도 받는다 (DTO 는 문자열로 내려간다)", () => {
    expect(isProActive("PRO", "2026-09-03T00:00:00.000Z", NOW)).toBe(true);
    expect(isProActive("PRO", "2026-09-01T00:00:00.000Z", NOW)).toBe(false);
  });

  test("못 읽는 값은 만료로 보지 않는다", () => {
    expect(isProActive("PRO", "언제까지인지 모름", NOW)).toBe(true);
  });
});

describe("데모 토글", () => {
  test("PRO 로 켜면 30일 뒤가 만료일", () => {
    const until = demoPlanUntil("PRO", NOW);
    expect(until?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
  });

  test("FREE 로 끄면 만료일을 지운다", () => {
    expect(demoPlanUntil("FREE", NOW)).toBeNull();
  });

  test("두 플랜에 라벨·설명이 있다", () => {
    expect(MASTER_PLAN_META.FREE.label).toBe("무료");
    expect(MASTER_PLAN_META.PRO.label).toBe("PRO");
    expect(MASTER_PLAN_META.PRO.description).toContain("추천");
  });
});
