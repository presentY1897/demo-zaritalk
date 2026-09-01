/**
 * 계약 기간 규칙 단위 테스트 (T1.2) — DB 없이 순수 함수만 본다.
 * 같은 호실 기간 중복(409)·기간 역전(400)·첫 청구 대상 월 판정이 여기 다 있다.
 */
import { expect, test } from "vitest";
import { utcDate } from "@/lib/rent";
import {
  blocksPeriod,
  findOverlappingLease,
  formatDateOnly,
  isValidPeriod,
  parseDateOnly,
  periodsOverlap,
  resolveInitialChargeMonth,
} from "./rules";
import type { LeaseStatusValue } from "./types";

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);
const period = (start: string, end: string) => ({ startDate: d(start), endDate: d(end) });

// ---------- 날짜 파싱 ----------

test("parseDateOnly — YYYY-MM-DD 를 UTC 자정 Date 로 만든다", () => {
  const parsed = parseDateOnly("2026-03-01");
  expect(parsed?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  expect(formatDateOnly(parsed!)).toBe("2026-03-01");
});

test("parseDateOnly — 형식이 아니거나 존재하지 않는 날짜는 null", () => {
  expect(parseDateOnly("2026-3-1")).toBeNull();
  expect(parseDateOnly("20260301")).toBeNull();
  expect(parseDateOnly("2026-02-31")).toBeNull();
  expect(parseDateOnly("2026-13-01")).toBeNull();
  // 윤년은 통과한다
  expect(parseDateOnly("2028-02-29")?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
});

// ---------- 기간 역전 ----------

test("isValidPeriod — 시작일이 종료일보다 늦으면 false, 같은 날은 허용", () => {
  expect(isValidPeriod(period("2026-03-01", "2027-02-28"))).toBe(true);
  expect(isValidPeriod(period("2026-03-01", "2026-03-01"))).toBe(true);
  expect(isValidPeriod(period("2027-02-28", "2026-03-01"))).toBe(false);
});

// ---------- 기간 중복 ----------

test("periodsOverlap — 겹치는 네 가지 모양을 모두 잡는다", () => {
  const base = period("2026-03-01", "2027-02-28");
  // 완전 포함 · 앞쪽 걸침 · 뒤쪽 걸침 · 더 큰 기간
  expect(periodsOverlap(base, period("2026-06-01", "2026-07-31"))).toBe(true);
  expect(periodsOverlap(base, period("2026-01-01", "2026-03-01"))).toBe(true);
  expect(periodsOverlap(base, period("2027-02-28", "2028-01-01"))).toBe(true);
  expect(periodsOverlap(base, period("2020-01-01", "2030-01-01"))).toBe(true);
});

test("periodsOverlap — 경계는 양끝 포함이라 '종료일 다음 날' 부터 겹치지 않는다", () => {
  const base = period("2026-03-01", "2027-02-28");
  expect(periodsOverlap(base, period("2027-02-28", "2028-02-27"))).toBe(true);
  expect(periodsOverlap(base, period("2027-03-01", "2028-02-29"))).toBe(false);
  expect(periodsOverlap(base, period("2025-01-01", "2026-02-28"))).toBe(false);
});

test("blocksPeriod — 진행 중 계약만 막고 종료·취소 이력은 막지 않는다", () => {
  const cases: [LeaseStatusValue, boolean][] = [
    ["PENDING_TENANT", true],
    ["ACTIVE", true],
    ["ENDED", false],
    ["CANCELLED", false],
  ];
  for (const [status, expected] of cases) expect(blocksPeriod(status)).toBe(expected);
});

test("findOverlappingLease — 겹치는 진행 중 계약을 찾아낸다", () => {
  const leases = [
    { id: "ended", status: "ENDED" as const, ...period("2026-03-01", "2027-02-28") },
    { id: "active", status: "ACTIVE" as const, ...period("2027-03-01", "2028-02-29") },
  ];
  // 종료된 계약과만 겹치면 통과
  expect(findOverlappingLease(period("2026-06-01", "2026-12-31"), leases)).toBeNull();
  // 진행 중 계약과 겹치면 그 계약을 돌려준다
  expect(findOverlappingLease(period("2027-06-01", "2027-12-31"), leases)?.id).toBe("active");
});

test("findOverlappingLease — 수정할 때 자기 자신은 제외한다", () => {
  const leases = [{ id: "self", status: "ACTIVE" as const, ...period("2026-03-01", "2027-02-28") }];
  expect(findOverlappingLease(period("2026-04-01", "2027-03-31"), leases)?.id).toBe("self");
  expect(
    findOverlappingLease(period("2026-04-01", "2027-03-31"), leases, { excludeLeaseId: "self" }),
  ).toBeNull();
});

// ---------- 첫 청구 대상 월 ----------

test("resolveInitialChargeMonth — 기본은 당월", () => {
  const target = resolveInitialChargeMonth(
    period("2026-03-01", "2027-02-28"),
    utcDate(2026, 9, 1),
  );
  expect(target).toEqual({ year: 2026, month: 9 });
});

test("resolveInitialChargeMonth — 계약이 미래에 시작하면 시작월로 민다", () => {
  const target = resolveInitialChargeMonth(
    period("2026-12-01", "2027-11-30"),
    utcDate(2026, 9, 1),
  );
  expect(target).toEqual({ year: 2026, month: 12 });
});

test("resolveInitialChargeMonth — 이미 끝난 계약을 뒤늦게 입력하면 청구를 만들지 않는다", () => {
  expect(
    resolveInitialChargeMonth(period("2024-01-01", "2024-12-31"), utcDate(2026, 9, 1)),
  ).toBeNull();
});

test("resolveInitialChargeMonth — 계약 마지막 달이 당월이면 그 달까지는 만든다", () => {
  expect(
    resolveInitialChargeMonth(period("2025-10-01", "2026-09-30"), utcDate(2026, 9, 1)),
  ).toEqual({ year: 2026, month: 9 });
});
