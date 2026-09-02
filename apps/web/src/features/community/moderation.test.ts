/**
 * 블라인드 노출 규칙 단위 테스트 (T4.1·T4.2) — **DB 없음**.
 * `moderation.ts` 주석의 규칙표를 그대로 못 박는다.
 */
import { expect, test } from "vitest";
import {
  blockedReason,
  canInteract,
  canSeeOriginal,
  isListed,
  moderationStateOf,
  type ModerationState,
  type ViewerRelation,
} from "./moderation";

const NOW = new Date("2026-09-02T00:00:00.000Z");

test("상태는 deletedAt + 처리된 신고 유무로 갈린다", () => {
  expect(moderationStateOf({ deletedAt: null, hasActionedReport: false })).toBe("VISIBLE");
  // 처리된 신고가 있어도 살아 있으면 정상이다(기각된 신고를 상상해 보라)
  expect(moderationStateOf({ deletedAt: null, hasActionedReport: true })).toBe("VISIBLE");
  expect(moderationStateOf({ deletedAt: NOW, hasActionedReport: true })).toBe("BLINDED");
  expect(moderationStateOf({ deletedAt: NOW, hasActionedReport: false })).toBe("REMOVED");
});

test("목록에는 블라인드가 남고 작성자 삭제만 빠진다", () => {
  expect(isListed("VISIBLE")).toBe(true);
  expect(isListed("BLINDED")).toBe(true);
  expect(isListed("REMOVED")).toBe(false);
});

test("원문 노출 규칙표 — 블라인드는 작성자·어드민만 본다", () => {
  const table: [ModerationState, ViewerRelation, boolean][] = [
    ["VISIBLE", "AUTHOR", true],
    ["VISIBLE", "ADMIN", true],
    ["VISIBLE", "OTHER", true],
    ["BLINDED", "AUTHOR", true],
    ["BLINDED", "ADMIN", true],
    ["BLINDED", "OTHER", false],
    ["REMOVED", "AUTHOR", false],
    ["REMOVED", "ADMIN", false],
    ["REMOVED", "OTHER", false],
  ];
  for (const [state, relation, expected] of table) {
    expect(canSeeOriginal(state, relation), `${state}/${relation}`).toBe(expected);
  }
});

test("원문이 보이는 사람에게도 참여는 막힌다 — 보는 것과 되살리는 것은 다르다", () => {
  expect(canInteract("VISIBLE")).toBe(true);
  expect(canInteract("BLINDED")).toBe(false);
  expect(canInteract("REMOVED")).toBe(false);
});

test("차단 문구가 이유를 설명한다", () => {
  expect(blockedReason("BLINDED", "POST")).toContain("블라인드");
  expect(blockedReason("BLINDED", "COMMENT")).toContain("댓글");
  expect(blockedReason("REMOVED", "POST")).toContain("삭제");
});
