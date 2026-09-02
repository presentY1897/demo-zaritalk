/**
 * 작업 의뢰 상태·업종 라벨과 **상태 전이표** (T5.1) — 표시·전이 규칙의 단일 출처.
 *
 * `@zari/db` 를 import 하지 않는 순수 모듈이라 클라이언트 화면과 라우트 핸들러가 같이 쓴다.
 * 색만으로 뜻을 전하지 않도록 배지에는 **항상 라벨을 함께** 넣는다(T0.6 원칙).
 *
 * ## 상태 전이표
 *
 * | 현재 \ 목표 | `DONE` 완료 | `CANCELLED` 취소 |
 * |---|---|---|
 * | `REQUESTED` 요청 | ✅ | ✅ |
 * | `QUOTED` 견적도착 | ✅ | ✅ |
 * | `ASSIGNED` 배정 | ✅ | ✅ |
 * | `DONE` 완료 | ❌ | ❌ |
 * | `CANCELLED` 취소 | ❌ | ❌ |
 *
 * - **임대인이 고를 수 있는 목표는 완료·취소 둘뿐이다.** `QUOTED`·`ASSIGNED` 는 사람이 고르는
 *   값이 아니라 견적(T5.3)이 도착·수락되며 시스템이 옮기는 값이라 요청 스키마 enum 에서 빠져 있다
 *   (보내면 400). 민원 상태(T2.6)에서 `OPEN` 을 뺀 것과 같은 이유다.
 * - **종결(완료·취소)은 되돌릴 수 없다.** 돈이 오가는 작업의 종결 사유를 조용히 바꿔치기하지
 *   못하게 한 선택이다 — 다시 하려면 의뢰를 새로 낸다.
 * - 같은 상태로의 전이도 거부(409)한다. 화면에서는 그 버튼이 비활성이다.
 */
import type { MasterCategoryValue, WorkOrderPlaceDto, WorkOrderStatusValue } from "./types";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";
export type StatusMeta = { label: string; tone: StatusTone };

/** 의뢰 상태 — 배지 라벨과 tone */
export const WORK_ORDER_STATUS_META: Record<WorkOrderStatusValue, StatusMeta> = {
  REQUESTED: { label: "요청", tone: "warning" },
  QUOTED: { label: "견적도착", tone: "info" },
  ASSIGNED: { label: "배정", tone: "info" },
  DONE: { label: "완료", tone: "success" },
  CANCELLED: { label: "취소", tone: "neutral" },
};

/** 목록 정렬·필터에서 쓰는 노출 순서 */
export const WORK_ORDER_STATUS_ORDER: readonly WorkOrderStatusValue[] = [
  "REQUESTED",
  "QUOTED",
  "ASSIGNED",
  "DONE",
  "CANCELLED",
];

/** 아직 진행 중인 상태 — 마스터 피드는 `REQUESTED` 만 보지만 목록 정렬은 이 집합을 위로 올린다 */
export const WORK_ORDER_OPEN_STATUSES: readonly WorkOrderStatusValue[] = [
  "REQUESTED",
  "QUOTED",
  "ASSIGNED",
];

export function isOpenWorkOrder(status: WorkOrderStatusValue): boolean {
  return WORK_ORDER_OPEN_STATUSES.includes(status);
}

/** 임대인이 고를 수 있는 목표 상태 — 견적이 옮기는 `QUOTED`·`ASSIGNED` 는 빠져 있다 */
export const WORK_ORDER_STATUS_TARGETS = ["DONE", "CANCELLED"] as const;
export type WorkOrderStatusTarget = (typeof WORK_ORDER_STATUS_TARGETS)[number];

/** 상태 전이표 — 위 표 그대로다 */
export const ALLOWED_WORK_ORDER_TRANSITIONS: Record<
  WorkOrderStatusValue,
  readonly WorkOrderStatusTarget[]
> = {
  REQUESTED: ["DONE", "CANCELLED"],
  QUOTED: ["DONE", "CANCELLED"],
  ASSIGNED: ["DONE", "CANCELLED"],
  DONE: [],
  CANCELLED: [],
};

/** 전이가 허용되는가. 종결 상태에서 나가는 길은 없다. */
export function canTransitionWorkOrder(
  from: WorkOrderStatusValue,
  to: WorkOrderStatusValue,
): boolean {
  return (ALLOWED_WORK_ORDER_TRANSITIONS[from] as readonly WorkOrderStatusValue[]).includes(to);
}

/** 전이가 막힌 이유 — API 409 메시지와 화면 안내에 같은 문구를 쓴다 */
export function workOrderTransitionRejectReason(
  from: WorkOrderStatusValue,
  to: WorkOrderStatusValue,
): string {
  if (from === to) return `이미 「${WORK_ORDER_STATUS_META[to].label}」 상태입니다.`;
  if (ALLOWED_WORK_ORDER_TRANSITIONS[from].length === 0) {
    return `「${WORK_ORDER_STATUS_META[from].label}」 처리된 의뢰는 다시 바꿀 수 없습니다. 필요하면 의뢰를 새로 등록해 주세요.`;
  }
  return `「${WORK_ORDER_STATUS_META[from].label}」에서 「${WORK_ORDER_STATUS_META[to].label}」(으)로는 바꿀 수 없습니다.`;
}

/** 업종 라벨 — 생성 시트의 선택지와 배지가 같은 문구를 쓴다 */
export const MASTER_CATEGORY_META: Record<MasterCategoryValue, { label: string; hint: string }> = {
  REPAIR: { label: "수리/설비", hint: "누수·보일러·전기" },
  CLEANING: { label: "청소", hint: "입주·이사 청소" },
  INTERIOR: { label: "인테리어", hint: "도배·바닥·부분 시공" },
  ETC: { label: "기타", hint: "그 밖의 작업" },
};

/** 생성 시트의 업종 버튼 순서 — 요청 스키마(`schema.ts`)의 enum 도 이 배열을 그대로 읽는다 */
export const MASTER_CATEGORY_ORDER = [
  "REPAIR",
  "CLEANING",
  "INTERIOR",
  "ETC",
] as const satisfies readonly MasterCategoryValue[];

/** "행당해피빌 201호" — 건물이 없는 의뢰(스키마상 가능)는 "대상 미지정" */
export function formatWorkOrderPlace(place: WorkOrderPlaceDto | null): string {
  if (!place) return "대상 미지정";
  return place.unitLabel ? `${place.buildingName} ${place.unitLabel}` : `${place.buildingName} 공용부`;
}
