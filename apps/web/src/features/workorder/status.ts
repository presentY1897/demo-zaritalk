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
 * - **임대인이 고를 수 있는 목표는 완료·취소 둘뿐이다.** `ASSIGNED` 는 사람이 고르는 값이 아니라
 *   견적 수락(T5.3 `POST /api/quotes/[id]/accept`)이 옮기는 값이라 요청 스키마 enum 에서
 *   빠져 있다(보내면 400). 민원 상태(T2.6)에서 `OPEN` 을 뺀 것과 같은 이유다.
 * - **`QUOTED` 는 아무도 쓰지 않는다.** 견적이 도착해도 의뢰는 `REQUESTED` 로 남는다 —
 *   마스터 피드(T5.2 pull)가 `REQUESTED` 만 보기 때문에 상태를 올리면 **두 번째 마스터가
 *   그 의뢰를 찾을 길이 사라져** "견적 2개 이상 비교" 라는 T5.3 완료 기준이 깨진다.
 *   근거는 [t5.3-quote.md](../../../../../docs/tasks/t5.3-quote.md#의뢰-상태-전이--quoted-를-쓰지-않는다).
 *   라벨·전이표에는 남겨 둔다(견적 마감 개념이 생기면 그 자리다).
 * - **종결(완료·취소)은 되돌릴 수 없다.** 돈이 오가는 작업의 종결 사유를 조용히 바꿔치기하지
 *   못하게 한 선택이다 — 다시 하려면 의뢰를 새로 낸다.
 * - 같은 상태로의 전이도 거부(409)한다. 화면에서는 그 버튼이 비활성이다.
 */
import type {
  MasterCategoryValue,
  QuoteSource,
  QuoteStatusValue,
  WorkOrderPlaceDto,
  WorkOrderStatusValue,
} from "./types";

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

// ─────────────────────────────────────────────────────────────────────────────
// 견적 (T5.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 견적 상태 — 배지 라벨과 tone.
 *
 * 수락은 한 의뢰에 한 건뿐이고, 수락되는 순간 나머지는 전부 `REJECTED` 가 된다
 * (`POST /api/quotes/[id]/accept` 의 트랜잭션). 그래서 「제안」은 **아직 결정 전**이라는 뜻이다.
 */
export const QUOTE_STATUS_META: Record<QuoteStatusValue, StatusMeta> = {
  PROPOSED: { label: "제안", tone: "info" },
  ACCEPTED: { label: "수락", tone: "success" },
  REJECTED: { label: "거절", tone: "neutral" },
};

/** 마스터 「내 견적」 목록의 필터 순서 */
export const QUOTE_STATUS_ORDER: readonly QuoteStatusValue[] = [
  "PROPOSED",
  "ACCEPTED",
  "REJECTED",
];

/** 아직 결과가 나오지 않은 견적인가 — 목록에서 위로 올린다 */
export function isPendingQuote(status: QuoteStatusValue): boolean {
  return status === "PROPOSED";
}

/**
 * 견적이 **어느 길로 온 의뢰**에 낸 것인지 (push 추천 / pull 피드).
 * `Badge` 의 tone 을 그대로 쓴다 — 하드코딩 색상 0(T0.6).
 */
export const QUOTE_SOURCE_META: Record<
  QuoteSource,
  { label: string; tone: "brand" | "neutral"; hint: string }
> = {
  PUSH: { label: "추천", tone: "brand", hint: "추천(push)으로 받은 의뢰" },
  PULL: { label: "피드", tone: "neutral", hint: "전체 피드(pull)에서 찾은 의뢰" },
};

/** "180,000원" — 견적 금액 표기(원 단위 정수) */
export function formatQuoteAmount(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/**
 * 이 의뢰에 지금 견적을 받을 수 있는가 — **`REQUESTED` 일 때만.**
 *
 * 배정(`ASSIGNED`)된 뒤에는 이미 한 업체가 정해졌고, 종결(`DONE`·`CANCELLED`)된 의뢰는
 * 더 받을 이유가 없다. API 는 이 함수가 false 면 409 를 준다.
 */
export function acceptsNewQuote(status: WorkOrderStatusValue): boolean {
  return status === "REQUESTED";
}

/** 견적을 받을 수 없는 이유 — API 409 메시지와 화면 안내가 같은 문구를 쓴다 */
export function quoteRejectReason(status: WorkOrderStatusValue): string {
  if (status === "ASSIGNED") return "이미 다른 업체가 배정된 의뢰입니다.";
  return `「${WORK_ORDER_STATUS_META[status].label}」 상태의 의뢰에는 견적을 낼 수 없습니다.`;
}
