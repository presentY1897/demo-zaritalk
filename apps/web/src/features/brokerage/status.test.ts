/**
 * 중개 타겟 **상태 전이표** 테스트 (T3.7) — DB 없음.
 *
 * task 최소 테스트: **respond 상태 전이(`SENT → VIEWED → ACCEPTED | DECLINED` 만)**.
 * 규칙이 여기 한 곳에만 있으므로 라우트·화면이 아니라 이 표를 직접 검증한다.
 */
import { expect, test } from "vitest";
import {
  BROKERAGE_REQUEST_STATUS_META,
  BROKERAGE_RESPOND_TARGETS,
  BROKERAGE_TARGET_STATUS_META,
  BROKERAGE_TARGET_STATUS_ORDER,
  checkTargetTransition,
  formatBrokeragePlace,
  formatDistanceKm,
  isRespondedTarget,
  shouldMatchRequest,
} from "./status";

test("발송된 요청은 열람으로 넘어간다 (SENT → VIEWED)", () => {
  expect(checkTargetTransition("SENT", "VIEWED")).toEqual({ ok: true, changed: true });
});

test("열람 표시는 멱등이다 — 이미 지난 상태면 바뀌는 것이 없다", () => {
  expect(checkTargetTransition("VIEWED", "VIEWED")).toEqual({ ok: true, changed: false });
  expect(checkTargetTransition("ACCEPTED", "VIEWED")).toEqual({ ok: true, changed: false });
  expect(checkTargetTransition("DECLINED", "VIEWED")).toEqual({ ok: true, changed: false });
});

test("열람한 요청만 수락·거절할 수 있다 (VIEWED → ACCEPTED | DECLINED)", () => {
  expect(checkTargetTransition("VIEWED", "ACCEPTED")).toEqual({ ok: true, changed: true });
  expect(checkTargetTransition("VIEWED", "DECLINED")).toEqual({ ok: true, changed: true });
});

test("보지 않고 수락·거절할 수 없다 (SENT → ACCEPTED | DECLINED 는 막힌다)", () => {
  for (const to of ["ACCEPTED", "DECLINED"] as const) {
    const result = checkTargetTransition("SENT", to);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("열람");
  }
});

test("한 번 응답한 요청은 되돌릴 수도, 바꿀 수도 없다", () => {
  for (const from of ["ACCEPTED", "DECLINED"] as const) {
    for (const to of ["ACCEPTED", "DECLINED"] as const) {
      const result = checkTargetTransition(from, to);
      expect(result.ok, `${from} → ${to}`).toBe(false);
      expect(result.ok === false && result.reason).toContain("이미");
    }
  }
});

test("전이표는 SENT → VIEWED → ACCEPTED|DECLINED 외의 길을 허용하지 않는다", () => {
  // 상태 변화를 실제로 만드는 조합만 추려 표와 대조한다
  const changing: string[] = [];
  for (const from of BROKERAGE_TARGET_STATUS_ORDER) {
    for (const to of BROKERAGE_RESPOND_TARGETS) {
      const result = checkTargetTransition(from, to);
      if (result.ok && result.changed) changing.push(`${from}→${to}`);
    }
  }
  expect(changing.sort()).toEqual(["SENT→VIEWED", "VIEWED→ACCEPTED", "VIEWED→DECLINED"]);
});

test("첫 수락에서만 요청이 MATCHED 로 넘어간다", () => {
  expect(shouldMatchRequest("OPEN", "ACCEPTED")).toBe(true);
  // 수락은 복수 허용 — 두 번째 수락에서는 이미 MATCHED 다
  expect(shouldMatchRequest("MATCHED", "ACCEPTED")).toBe(false);
  expect(shouldMatchRequest("CLOSED", "ACCEPTED")).toBe(false);
  expect(shouldMatchRequest("OPEN", "DECLINED")).toBe(false);
  expect(shouldMatchRequest("OPEN", "VIEWED")).toBe(false);
});

test("종결 판정은 수락·거절 둘뿐이다", () => {
  expect(isRespondedTarget("SENT")).toBe(false);
  expect(isRespondedTarget("VIEWED")).toBe(false);
  expect(isRespondedTarget("ACCEPTED")).toBe(true);
  expect(isRespondedTarget("DECLINED")).toBe(true);
});

test("모든 상태에 라벨과 tone 이 있다 (색만으로 뜻을 전하지 않는다)", () => {
  for (const status of BROKERAGE_TARGET_STATUS_ORDER) {
    expect(BROKERAGE_TARGET_STATUS_META[status].label.length).toBeGreaterThan(0);
    expect(BROKERAGE_TARGET_STATUS_META[status].tone.length).toBeGreaterThan(0);
  }
  for (const status of ["OPEN", "MATCHED", "CLOSED"] as const) {
    expect(BROKERAGE_REQUEST_STATUS_META[status].label.length).toBeGreaterThan(0);
  }
});

test("표시 헬퍼 — 장소 문구와 거리 반올림", () => {
  expect(formatBrokeragePlace({ buildingName: "행당해피빌", unitLabel: "101호" })).toBe(
    "행당해피빌 101호",
  );
  expect(formatDistanceKm(0.123)).toBe("0.1km");
  expect(formatDistanceKm(2)).toBe("2.0km");
});
