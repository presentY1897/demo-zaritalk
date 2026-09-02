/**
 * 환급 상태 머신 단위 테스트 (T2.4·T2.5) — **DB 없이** 돈다.
 *
 * 문서의 상태 전이표(`docs/tasks/t2.5-refund-review.md`)와 이 파일이 같은 표를 지킨다.
 */
import { expect, test } from "vitest";
import {
  availableReviewActions,
  canTransition,
  isEditableStatus,
  isTerminal,
  isUploadableStatus,
  REFUND_STATUS_META,
  REFUND_STATUS_ORDER,
  REFUND_STEPS,
  REFUND_TRANSITIONS,
  resolveReviewTransition,
  stepStateFor,
  submitTargetFor,
  transitionRejectReason,
  type RefundStatusValue,
} from "./status";

/** 문서에 적힌 허용 전이 전부 — 이 표에 없는 조합은 전부 막혀야 한다 */
const ALLOWED: readonly [RefundStatusValue, RefundStatusValue][] = [
  ["DRAFT", "SUBMITTED"],
  ["SUBMITTED", "REVIEWING"],
  ["REVIEWING", "NEED_MORE_DOCS"],
  ["REVIEWING", "APPROVED"],
  ["REVIEWING", "REJECTED"],
  ["NEED_MORE_DOCS", "REVIEWING"],
  ["APPROVED", "COMPLETED"],
];

test("전이표 — 허용된 7가지 전이만 통과한다", () => {
  for (const [from, to] of ALLOWED) {
    expect(canTransition(from, to), `${from} → ${to} 는 허용`).toBe(true);
  }

  const allowedKeys = new Set(ALLOWED.map(([from, to]) => `${from}>${to}`));
  for (const from of REFUND_STATUS_ORDER) {
    for (const to of REFUND_STATUS_ORDER) {
      if (allowedKeys.has(`${from}>${to}`)) continue;
      expect(canTransition(from, to), `${from} → ${to} 는 차단`).toBe(false);
    }
  }
});

test("같은 상태로는 못 간다 (7개 상태 전부)", () => {
  for (const status of REFUND_STATUS_ORDER) {
    expect(canTransition(status, status)).toBe(false);
  }
});

test("심사시작은 SUBMITTED 에서만 가능하다 (T2.5 최소 요구)", () => {
  expect(resolveReviewTransition("SUBMITTED", "START")?.to).toBe("REVIEWING");
  for (const status of REFUND_STATUS_ORDER.filter((s) => s !== "SUBMITTED")) {
    expect(resolveReviewTransition(status, "START"), `${status} 에서는 심사시작 불가`).toBeNull();
  }
});

test("승인·반려·보완요청은 REVIEWING 에서만 — SUBMITTED 에서 바로는 못 한다", () => {
  for (const action of ["APPROVE", "REJECT", "NEED_MORE_DOCS"] as const) {
    expect(resolveReviewTransition("REVIEWING", action)).not.toBeNull();
    expect(resolveReviewTransition("SUBMITTED", action)).toBeNull();
    expect(resolveReviewTransition("NEED_MORE_DOCS", action)).toBeNull();
  }
});

test("지급 완료는 APPROVED 에서만", () => {
  expect(resolveReviewTransition("APPROVED", "COMPLETE")?.to).toBe("COMPLETED");
  expect(resolveReviewTransition("REVIEWING", "COMPLETE")).toBeNull();
  expect(resolveReviewTransition("REJECTED", "COMPLETE")).toBeNull();
});

test("코멘트 필수는 보완요청·반려 둘뿐이다", () => {
  const required = REFUND_TRANSITIONS.filter((t) => t.requiresNote).map((t) => t.action);
  expect(required.sort()).toEqual(["NEED_MORE_DOCS", "REJECT"]);
});

test("반려·완료는 종결 — 더 갈 곳이 없다", () => {
  expect(isTerminal("REJECTED")).toBe(true);
  expect(isTerminal("COMPLETED")).toBe(true);
  for (const status of ["DRAFT", "SUBMITTED", "REVIEWING", "NEED_MORE_DOCS", "APPROVED"] as const) {
    expect(isTerminal(status), `${status} 는 아직 갈 곳이 있다`).toBe(false);
  }
});

test("보완 재제출은 SUBMITTED 가 아니라 REVIEWING 으로 돌아간다", () => {
  expect(submitTargetFor("DRAFT")).toBe("SUBMITTED");
  expect(submitTargetFor("NEED_MORE_DOCS")).toBe("REVIEWING");
  for (const status of ["SUBMITTED", "REVIEWING", "APPROVED", "REJECTED", "COMPLETED"] as const) {
    expect(submitTargetFor(status), `${status} 에서는 제출 불가`).toBeNull();
  }
});

test("수정은 DRAFT 에서만, 업로드는 DRAFT·보완요청에서만", () => {
  for (const status of REFUND_STATUS_ORDER) {
    expect(isEditableStatus(status)).toBe(status === "DRAFT");
    expect(isUploadableStatus(status)).toBe(status === "DRAFT" || status === "NEED_MORE_DOCS");
  }
});

test("어드민 버튼 목록 — 상태마다 누를 수 있는 액션이 정해져 있다", () => {
  const actionsOf = (status: RefundStatusValue) =>
    availableReviewActions(status)
      .map((t) => t.action)
      .sort();

  expect(actionsOf("DRAFT")).toEqual([]);
  expect(actionsOf("SUBMITTED")).toEqual(["START"]);
  expect(actionsOf("REVIEWING")).toEqual(["APPROVE", "NEED_MORE_DOCS", "REJECT"]);
  expect(actionsOf("NEED_MORE_DOCS")).toEqual([]);
  expect(actionsOf("APPROVED")).toEqual(["COMPLETE"]);
  expect(actionsOf("REJECTED")).toEqual([]);
  expect(actionsOf("COMPLETED")).toEqual([]);
});

test("거부 문구 — 같은 상태·종결·그 밖을 구분해 설명한다", () => {
  expect(transitionRejectReason("REVIEWING", "REVIEWING")).toContain("이미");
  expect(transitionRejectReason("REJECTED", "APPROVED")).toContain("종결");
  expect(transitionRejectReason("SUBMITTED", "APPROVED")).toContain("바꿀 수 없습니다");
});

test("상태 메타 — 7개 전부 라벨·tone·설명이 있다", () => {
  for (const status of REFUND_STATUS_ORDER) {
    const meta = REFUND_STATUS_META[status];
    expect(meta.label.length).toBeGreaterThan(0);
    expect(meta.description.length).toBeGreaterThan(0);
    expect(["success", "warning", "danger", "info", "neutral", "brand"]).toContain(meta.tone);
  }
});

test("스테퍼 — DRAFT 는 아직 0단계, 상태가 오를수록 앞 단계가 DONE 이 된다", () => {
  expect(REFUND_STEPS.map((s) => s.key)).toEqual(["SUBMIT", "REVIEW", "DECISION", "DONE"]);

  expect(REFUND_STEPS.map((s) => stepStateFor("DRAFT", s.key))).toEqual([
    "TODO",
    "TODO",
    "TODO",
    "TODO",
  ]);
  expect(REFUND_STEPS.map((s) => stepStateFor("SUBMITTED", s.key))).toEqual([
    "CURRENT",
    "TODO",
    "TODO",
    "TODO",
  ]);
  expect(REFUND_STEPS.map((s) => stepStateFor("NEED_MORE_DOCS", s.key))).toEqual([
    "DONE",
    "CURRENT",
    "TODO",
    "TODO",
  ]);
  expect(REFUND_STEPS.map((s) => stepStateFor("APPROVED", s.key))).toEqual([
    "DONE",
    "DONE",
    "CURRENT",
    "TODO",
  ]);
  expect(REFUND_STEPS.map((s) => stepStateFor("COMPLETED", s.key))).toEqual([
    "DONE",
    "DONE",
    "DONE",
    "CURRENT",
  ]);
});
