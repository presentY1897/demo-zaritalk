/**
 * 작업 의뢰 상태 전이표·라벨 단위 테스트 (T5.1) — **DB 없이 돈다**(순수 모듈).
 */
import { describe, expect, test } from "vitest";
import {
  ALLOWED_WORK_ORDER_TRANSITIONS,
  canTransitionWorkOrder,
  formatWorkOrderPlace,
  isOpenWorkOrder,
  MASTER_CATEGORY_META,
  MASTER_CATEGORY_ORDER,
  WORK_ORDER_STATUS_META,
  WORK_ORDER_STATUS_ORDER,
  WORK_ORDER_STATUS_TARGETS,
  workOrderTransitionRejectReason,
} from "./status";
import type { WorkOrderStatusValue } from "./types";

describe("상태 전이표", () => {
  test("요청 → 완료·취소 둘 다 된다", () => {
    expect(canTransitionWorkOrder("REQUESTED", "DONE")).toBe(true);
    expect(canTransitionWorkOrder("REQUESTED", "CANCELLED")).toBe(true);
  });

  test("견적도착·배정에서도 완료·취소로 닫을 수 있다", () => {
    for (const from of ["QUOTED", "ASSIGNED"] as const) {
      expect(canTransitionWorkOrder(from, "DONE")).toBe(true);
      expect(canTransitionWorkOrder(from, "CANCELLED")).toBe(true);
    }
  });

  test("종결(완료·취소)에서 나가는 길은 없다", () => {
    for (const from of ["DONE", "CANCELLED"] as const) {
      for (const to of WORK_ORDER_STATUS_ORDER) {
        expect(canTransitionWorkOrder(from, to)).toBe(false);
      }
    }
  });

  test("같은 상태로의 전이는 언제나 막는다", () => {
    for (const status of WORK_ORDER_STATUS_ORDER) {
      expect(canTransitionWorkOrder(status, status)).toBe(false);
    }
  });

  test("REQUESTED·QUOTED·ASSIGNED 로 되돌릴 수 없다 (전이표에 목표로 없다)", () => {
    const targets = new Set(Object.values(ALLOWED_WORK_ORDER_TRANSITIONS).flat());
    expect([...targets].sort()).toEqual(["CANCELLED", "DONE"]);
  });

  test("임대인이 고를 수 있는 목표는 완료·취소 둘뿐", () => {
    expect(WORK_ORDER_STATUS_TARGETS).toEqual(["DONE", "CANCELLED"]);
  });
});

describe("거부 문구", () => {
  test("같은 상태는 '이미 …' 로 알린다", () => {
    expect(workOrderTransitionRejectReason("DONE", "DONE")).toContain("이미");
  });

  test("종결된 의뢰는 새로 등록하라고 안내한다", () => {
    expect(workOrderTransitionRejectReason("CANCELLED", "DONE")).toContain("새로 등록");
  });
});

describe("라벨·tone", () => {
  test("모든 상태에 라벨과 tone 이 있다 (색만으로 뜻을 전하지 않는다)", () => {
    for (const status of WORK_ORDER_STATUS_ORDER) {
      const meta = WORK_ORDER_STATUS_META[status as WorkOrderStatusValue];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.tone.length).toBeGreaterThan(0);
    }
  });

  test("진행 중 판정 — 요청·견적도착·배정만 true", () => {
    expect(WORK_ORDER_STATUS_ORDER.filter(isOpenWorkOrder)).toEqual([
      "REQUESTED",
      "QUOTED",
      "ASSIGNED",
    ]);
  });

  test("업종 4종에 라벨·힌트가 있다", () => {
    expect(MASTER_CATEGORY_ORDER).toHaveLength(4);
    for (const category of MASTER_CATEGORY_ORDER) {
      expect(MASTER_CATEGORY_META[category].label.length).toBeGreaterThan(0);
    }
  });
});

describe("대상 표기", () => {
  const place = {
    buildingId: "b1",
    buildingName: "행당해피빌",
    buildingAddress: "서울 성동구 행당로 79",
    unitId: "u1",
    unitLabel: "201호",
  };

  test("호실이 있으면 '건물 호실'", () => {
    expect(formatWorkOrderPlace(place)).toBe("행당해피빌 201호");
  });

  test("호실이 없으면 공용부", () => {
    expect(formatWorkOrderPlace({ ...place, unitId: null, unitLabel: null })).toBe(
      "행당해피빌 공용부",
    );
  });

  test("건물 자체가 없으면 '대상 미지정'", () => {
    expect(formatWorkOrderPlace(null)).toBe("대상 미지정");
  });
});
