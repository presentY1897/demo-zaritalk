/**
 * 민원 상태 라벨·배지 tone 과 **상태 전이표** (T2.6) — 표시·전이 규칙의 단일 출처.
 *
 * `@zari/db` 를 import 하지 않는 순수 모듈이라 클라이언트 컴포넌트와 라우트 핸들러가 같이 쓴다.
 * 색만으로 뜻을 전하지 않도록 배지에는 **항상 라벨을 함께** 넣는다(T0.6 원칙) — 하드코딩 색상 0.
 *
 * ## 상태 전이표
 *
 * | 현재 \ 목표 | `IN_PROGRESS` 진행중 | `RESOLVED` 해결 | `REJECTED` 반려 |
 * |---|---|---|---|
 * | `OPEN` 접수 | ✅ | ✅ | ✅ |
 * | `IN_PROGRESS` 진행중 | ❌ (같은 상태) | ✅ | ✅ |
 * | `RESOLVED` 해결 | ✅ (재개) | ❌ (같은 상태) | ❌ |
 * | `REJECTED` 반려 | ✅ (재개) | ❌ | ❌ (같은 상태) |
 *
 * - **`OPEN` 은 목표가 될 수 없다.** 접수 시점에만 붙는 초기 상태이고, 임대인 홈(T1.9)의
 *   "미확인 민원" 배지가 `status === "OPEN"` 을 **미확인의 대리 지표**로 쓰기 때문이다 —
 *   임대인이 한 번 손댄 민원을 다시 "미확인" 으로 되돌리면 배지가 거짓말을 한다.
 *   (요청 스키마 `updateComplaintStatusSchema` 의 enum 에서 아예 빠져 있어 400 이다.)
 * - **종결끼리는 못 넘어간다**(해결 ↔ 반려). 다시 열려면 「진행중」으로 재개한 뒤에 바꾼다 —
 *   "해결됐다더니 또 샌다" 를 담되, 종결 사유를 조용히 바꿔치기하지는 못하게 한 선택이다.
 * - **같은 상태로의 전이는 거부**(409)한다. 화면에서는 현재 상태 버튼을 비활성으로 둔다.
 */
import type { ComplaintStatusValue } from "./types";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";
export type StatusMeta = { label: string; tone: StatusTone };

/** 민원 상태 — 배지 라벨과 tone */
export const COMPLAINT_STATUS_META: Record<ComplaintStatusValue, StatusMeta> = {
  OPEN: { label: "접수", tone: "warning" },
  IN_PROGRESS: { label: "진행중", tone: "info" },
  RESOLVED: { label: "해결", tone: "success" },
  REJECTED: { label: "반려", tone: "neutral" },
};

/** 목록 정렬·필터에서 쓰는 노출 순서 */
export const COMPLAINT_STATUS_ORDER: readonly ComplaintStatusValue[] = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "REJECTED",
];

/** 임대인이 고를 수 있는 목표 상태 — `OPEN` 은 접수 시점 전용이라 빠져 있다 */
export const COMPLAINT_STATUS_TARGETS = ["IN_PROGRESS", "RESOLVED", "REJECTED"] as const;
export type ComplaintStatusTarget = (typeof COMPLAINT_STATUS_TARGETS)[number];

/** 상태 전이표 — 위 표 그대로다 */
export const ALLOWED_TRANSITIONS: Record<
  ComplaintStatusValue,
  readonly ComplaintStatusTarget[]
> = {
  OPEN: ["IN_PROGRESS", "RESOLVED", "REJECTED"],
  IN_PROGRESS: ["RESOLVED", "REJECTED"],
  RESOLVED: ["IN_PROGRESS"],
  REJECTED: ["IN_PROGRESS"],
};

/** 전이가 허용되는가. 같은 상태·`OPEN` 으로의 회귀는 언제나 false. */
export function canTransition(from: ComplaintStatusValue, to: ComplaintStatusValue): boolean {
  return (ALLOWED_TRANSITIONS[from] as readonly ComplaintStatusValue[]).includes(to);
}

/** 전이가 막힌 이유 — API 409 메시지와 화면 안내에 같은 문구를 쓴다 */
export function transitionRejectReason(
  from: ComplaintStatusValue,
  to: ComplaintStatusValue,
): string {
  if (from === to) return `이미 「${COMPLAINT_STATUS_META[to].label}」 상태입니다.`;
  if (to === "OPEN") return "접수 상태로는 되돌릴 수 없습니다.";
  return `「${COMPLAINT_STATUS_META[from].label}」에서 「${COMPLAINT_STATUS_META[to].label}」(으)로는 바꿀 수 없습니다. 「진행중」으로 재개한 뒤에 바꿔 주세요.`;
}

/** 임대인이 손을 댄 적 없는(=홈 배지가 세는) 상태인가 */
export function isUnhandled(status: ComplaintStatusValue): boolean {
  return status === "OPEN";
}
