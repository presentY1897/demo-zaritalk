/**
 * 민원 상태 전이표 테스트 (T2.6) — **DB 없이 돈다**(순수 함수).
 * 전이 규칙은 `features/complaint/status.ts` 한 곳에만 있으므로 여기서 표 전체를 못 박는다.
 */
import { expect, test } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  COMPLAINT_STATUS_META,
  COMPLAINT_STATUS_TARGETS,
  isUnhandled,
  transitionRejectReason,
} from "./status";
import type { ComplaintStatusValue } from "./types";

const ALL: ComplaintStatusValue[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "REJECTED"];

test("접수(OPEN)에서는 진행중·해결·반려 셋 다 갈 수 있다", () => {
  expect(canTransition("OPEN", "IN_PROGRESS")).toBe(true);
  expect(canTransition("OPEN", "RESOLVED")).toBe(true);
  expect(canTransition("OPEN", "REJECTED")).toBe(true);
});

test("진행중에서는 해결·반려로만 간다", () => {
  expect(canTransition("IN_PROGRESS", "RESOLVED")).toBe(true);
  expect(canTransition("IN_PROGRESS", "REJECTED")).toBe(true);
  expect(canTransition("IN_PROGRESS", "IN_PROGRESS")).toBe(false);
});

test("종결(해결·반려)에서는 「진행중」으로만 재개된다", () => {
  expect(canTransition("RESOLVED", "IN_PROGRESS")).toBe(true);
  expect(canTransition("REJECTED", "IN_PROGRESS")).toBe(true);
});

test("종결끼리는 못 넘어간다 — 해결 ↔ 반려", () => {
  expect(canTransition("RESOLVED", "REJECTED")).toBe(false);
  expect(canTransition("REJECTED", "RESOLVED")).toBe(false);
});

test("어느 상태에서도 접수(OPEN)로는 되돌아가지 않는다 — 임대인 홈 배지가 거짓말하지 않게", () => {
  for (const from of ALL) expect(canTransition(from, "OPEN")).toBe(false);
  expect(COMPLAINT_STATUS_TARGETS).not.toContain("OPEN");
});

test("같은 상태로의 전이는 전부 거부", () => {
  for (const status of ALL) expect(canTransition(status, status)).toBe(false);
});

test("거부 사유 문구가 상황별로 갈린다", () => {
  expect(transitionRejectReason("RESOLVED", "RESOLVED")).toContain("이미");
  expect(transitionRejectReason("RESOLVED", "OPEN")).toContain("되돌릴 수 없습니다");
  expect(transitionRejectReason("RESOLVED", "REJECTED")).toContain("진행중");
});

test("전이표는 목표 상태 3종 안에서만 정의된다", () => {
  for (const targets of Object.values(ALLOWED_TRANSITIONS)) {
    for (const target of targets) expect(COMPLAINT_STATUS_TARGETS).toContain(target);
  }
});

test("미확인(임대인 홈 배지가 세는 상태)은 OPEN 하나뿐이다", () => {
  expect(ALL.filter(isUnhandled)).toEqual(["OPEN"]);
});

test("상태 4종 모두 라벨·tone 이 있다 (색만으로 뜻을 전하지 않는다)", () => {
  for (const status of ALL) {
    expect(COMPLAINT_STATUS_META[status].label.length).toBeGreaterThan(0);
    expect(COMPLAINT_STATUS_META[status].tone.length).toBeGreaterThan(0);
  }
});
