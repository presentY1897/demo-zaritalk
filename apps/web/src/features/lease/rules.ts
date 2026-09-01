/**
 * 계약 규칙 (T1.2) — **순수 함수만**. DB·Prisma 를 모르므로 단위 테스트가 DB 없이 돈다.
 *
 * 금액 계산은 여기 없다 — 전부 `@/lib/rent`(T1.4 원장 엔진)가 한다.
 * 이 파일이 다루는 것은 **기간**뿐이다: 역전 판정, 같은 호실 기간 중복, 첫 청구 대상 월.
 *
 * ## 기간 중복 판정
 *
 * | 항목 | 규칙 |
 * |---|---|
 * | 경계 | **양끝 포함**(closed interval). `endDate` 는 "마지막 거주일"이라 다음 계약은 그 다음 날부터다 |
 * | 대상 | 같은 호실의 **진행 중 계약**(`PENDING_TENANT`·`ACTIVE`)만. 종료·취소 이력은 겹쳐도 막지 않는다 |
 * | 결과 | 겹치면 409 `CONFLICT` |
 *
 * 종료·취소를 제외하는 이유: 계약 이력은 지우지 않고 남기는데(T1.1 삭제 규칙),
 * 잘못 등록한 계약을 `ENDED` 로 정리한 뒤 같은 기간으로 다시 등록할 수 있어야 하기 때문이다.
 */
import { yearMonthOf, type YearMonth } from "@/lib/rent";
import type { LeaseStatusValue } from "./types";

/** `@db.Date` 컬럼 두 개 — UTC 자정 Date 로 다룬다(원장 엔진 타임존 규칙). */
export type LeasePeriod = { startDate: Date; endDate: Date };

/** `"2026-03-01"` → UTC 자정 Date. 형식이 아니면 null. */
export function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  // "2026-02-31" 처럼 존재하지 않는 날짜는 다른 날로 굴러가므로 되돌려 확인한다
  return date.toISOString().slice(0, 10) === value ? date : null;
}

/** UTC 자정 Date → `"YYYY-MM-DD"` */
export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 시작일이 종료일보다 늦으면 false — 기간 역전(400) 판정. 같은 날(하루짜리 계약)은 허용한다. */
export function isValidPeriod(period: LeasePeriod): boolean {
  return period.startDate.getTime() <= period.endDate.getTime();
}

/** 두 기간이 하루라도 겹치는가 (양끝 포함). */
export function periodsOverlap(a: LeasePeriod, b: LeasePeriod): boolean {
  return (
    a.startDate.getTime() <= b.endDate.getTime() && b.startDate.getTime() <= a.endDate.getTime()
  );
}

/** 기간 중복을 막는 계약 상태 — 종료·취소 이력은 막지 않는다. */
export const BLOCKING_LEASE_STATUSES: readonly LeaseStatusValue[] = ["PENDING_TENANT", "ACTIVE"];

export function blocksPeriod(status: LeaseStatusValue): boolean {
  return BLOCKING_LEASE_STATUSES.includes(status);
}

export type ExistingLease = LeasePeriod & { id: string; status: LeaseStatusValue };

/**
 * 같은 호실의 기존 계약 중 기간이 겹치는 **첫 계약**을 찾는다. 없으면 null.
 * `excludeLeaseId` 는 수정(PATCH)에서 자기 자신을 빼는 용도다.
 */
export function findOverlappingLease<T extends ExistingLease>(
  period: LeasePeriod,
  leases: readonly T[],
  options: { excludeLeaseId?: string } = {},
): T | null {
  for (const lease of leases) {
    if (lease.id === options.excludeLeaseId) continue;
    if (!blocksPeriod(lease.status)) continue;
    if (periodsOverlap(period, lease)) return lease;
  }
  return null;
}

function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return a.year !== b.year ? a.year - b.year : a.month - b.month;
}

/**
 * 계약 등록 직후 만들 **첫 청구의 대상 월**.
 *
 * - 기본은 **당월**(KST 오늘 기준) — task 요구사항 "등록 시 당월 RentCharge 즉시 생성".
 * - 계약이 다음 달 이후에 시작하면 **계약 시작월**로 민다(있지도 않은 달의 청구를 만들지 않게).
 * - 대상 월이 계약 기간(시작월~종료월) 밖이면 **null** — 이미 끝난 계약을 뒤늦게 입력한 경우다.
 *
 * 크론(T1.4)은 ACTIVE 계약의 당월만 만들고 과거를 소급하지 않으므로,
 * `PENDING_TENANT` 로 시작하는 계약의 첫 청구는 여기서만 생긴다.
 */
export function resolveInitialChargeMonth(period: LeasePeriod, today: Date): YearMonth | null {
  const start = yearMonthOf(period.startDate);
  const end = yearMonthOf(period.endDate);
  const now = yearMonthOf(today);

  const target = compareYearMonth(now, start) < 0 ? start : now;
  if (compareYearMonth(target, end) > 0) return null;
  return target;
}
