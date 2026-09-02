import { expect, test } from "vitest";
import {
  checkStatusTransition,
  isLiveListing,
  LISTING_STATUS_META,
  LISTING_STATUS_ORDER,
} from "./status";

test("OPEN 에서는 RESERVED·CLOSED 로 갈 수 있다", () => {
  expect(checkStatusTransition({ from: "OPEN", to: "RESERVED", unitOccupied: false }).ok).toBe(true);
  expect(checkStatusTransition({ from: "OPEN", to: "CLOSED", unitOccupied: false }).ok).toBe(true);
});

test("RESERVED → OPEN 은 공실일 때만 — 계약이 잡혔으면 409 사유를 준다", () => {
  expect(checkStatusTransition({ from: "RESERVED", to: "OPEN", unitOccupied: false }).ok).toBe(true);

  const blocked = checkStatusTransition({ from: "RESERVED", to: "OPEN", unitOccupied: true });
  expect(blocked.ok).toBe(false);
  if (!blocked.ok) expect(blocked.reason).toContain("계약이 있는 호실");
});

test("CLOSED 는 종료 상태 — 어디로도 되돌릴 수 없다", () => {
  for (const to of ["OPEN", "RESERVED"] as const) {
    const result = checkStatusTransition({ from: "CLOSED", to, unitOccupied: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("되돌릴 수 없습니다");
  }
});

test("같은 상태로의 전이는 멱등하게 허용한다", () => {
  for (const status of LISTING_STATUS_ORDER) {
    expect(checkStatusTransition({ from: status, to: status, unitOccupied: true }).ok).toBe(true);
  }
});

test("살아 있는 매물은 OPEN·RESERVED 뿐이다(호실당 1건 판정 기준)", () => {
  expect(isLiveListing("OPEN")).toBe(true);
  expect(isLiveListing("RESERVED")).toBe(true);
  expect(isLiveListing("CLOSED")).toBe(false);
});

test("상태 메타는 라벨과 tone 을 모두 가진다(색만으로 뜻을 전하지 않는다)", () => {
  for (const status of LISTING_STATUS_ORDER) {
    expect(LISTING_STATUS_META[status].label.length).toBeGreaterThan(0);
    expect(["info", "warning", "neutral"]).toContain(LISTING_STATUS_META[status].tone);
  }
});
