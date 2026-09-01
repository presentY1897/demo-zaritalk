import { expect, test } from "vitest";
import { deriveUnitStatus, emptyStatusCounts, UNIT_STATUS_META } from "./unit-status";

test("계약이 없으면 공실", () => {
  expect(
    deriveUnitStatus({ hasActiveLease: false, hasPendingLease: false, hasOverdueCharge: false }),
  ).toBe("VACANT");
});

test("ACTIVE 계약이면 계약중", () => {
  expect(
    deriveUnitStatus({ hasActiveLease: true, hasPendingLease: false, hasOverdueCharge: false }),
  ).toBe("OCCUPIED");
});

test("PENDING_TENANT 계약이면 대기", () => {
  expect(
    deriveUnitStatus({ hasActiveLease: false, hasPendingLease: true, hasOverdueCharge: false }),
  ).toBe("PENDING");
});

test("ACTIVE + 미납 청구면 연체가 계약중을 덮어쓴다", () => {
  expect(
    deriveUnitStatus({ hasActiveLease: true, hasPendingLease: false, hasOverdueCharge: true }),
  ).toBe("OVERDUE");
});

test("계약이 없으면 미납 청구가 있어도 공실 — 연체는 진행 중 계약에만 붙는다", () => {
  expect(
    deriveUnitStatus({ hasActiveLease: false, hasPendingLease: false, hasOverdueCharge: true }),
  ).toBe("VACANT");
});

test("상태 배지는 semantic tone 4종을 쓴다(색만으로 뜻을 전하지 않게 라벨도 있다)", () => {
  expect(UNIT_STATUS_META.OCCUPIED).toMatchObject({ label: "계약중", tone: "success" });
  expect(UNIT_STATUS_META.PENDING).toMatchObject({ label: "대기", tone: "warning" });
  expect(UNIT_STATUS_META.OVERDUE).toMatchObject({ label: "연체", tone: "danger" });
  expect(UNIT_STATUS_META.VACANT).toMatchObject({ label: "공실", tone: "neutral" });
});

test("빈 카운터는 상태 4종이 전부 0", () => {
  expect(emptyStatusCounts()).toEqual({ OCCUPIED: 0, PENDING: 0, OVERDUE: 0, VACANT: 0 });
});
