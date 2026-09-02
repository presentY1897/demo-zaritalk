/**
 * 환급 신청 **상태 머신 — 판정의 단일 출처** (T2.4·T2.5).
 *
 * 세입자 화면(`/tenant/refund`)·세입자 API(`/api/refunds/**`)·어드민 심사 큐가 **같은 표**를 본다.
 * `@zari/db` 를 import 하지 않는 순수 모듈이라 클라이언트 컴포넌트와 라우트 핸들러가 같이 쓴다
 * (민원 T2.6 `features/complaint/status.ts` 와 같은 구조).
 *
 * ## 상태 전이표
 *
 * | 현재 | 목표 | 주체 | 액션 | 코멘트 |
 * |---|---|---|---|---|
 * | `DRAFT` 작성중 | `SUBMITTED` 제출 | 세입자 | `POST /api/refunds/[id]/submit` | — |
 * | `SUBMITTED` 제출 | `REVIEWING` 심사중 | 어드민 | 심사시작 | 선택 |
 * | `REVIEWING` 심사중 | `NEED_MORE_DOCS` 보완요청 | 어드민 | 보완요청 | **필수** |
 * | `REVIEWING` 심사중 | `APPROVED` 승인 | 어드민 | 승인 | 선택 |
 * | `REVIEWING` 심사중 | `REJECTED` 반려 | 어드민 | 반려 | **필수** |
 * | `NEED_MORE_DOCS` 보완요청 | `REVIEWING` 심사중 | 세입자 | 보완 재제출 | — |
 * | `APPROVED` 승인 | `COMPLETED` 완료 | 어드민 | 지급 완료 | 선택 |
 * | `REJECTED` · `COMPLETED` | — | — | **종결(전이 없음)** | — |
 *
 * ### 왜 이렇게 정했나
 *
 * - **`SUBMITTED` 에서 바로 승인·반려할 수 없다.** 심사시작을 거쳐야 `reviewedById`(심사자)가
 *   찍히고, 큐에서 "누가 잡고 있는 건인지" 가 드러난다. T2.5 최소 테스트가 요구하는
 *   "SUBMITTED 에서만 심사시작" 도 이 규칙의 다른 면이다.
 * - **보완 재제출은 `SUBMITTED` 가 아니라 `REVIEWING` 으로 돌아간다.** 이미 심사자가 붙은 건이므로
 *   제출 대기 줄의 맨 뒤가 아니라 **그 심사자 책상**으로 돌아가는 것이 맞다. 같은 엔드포인트
 *   (`POST /[id]/submit`)가 현재 상태에 따라 목표를 고른다(`submitTargetFor`).
 * - **반려·완료는 종결이다.** 되살리려면 새 신청을 만든다 — 결정 사유를 조용히 바꿔치기하지 못하게.
 * - **코멘트 필수는 보완요청·반려 둘뿐이다.** 신청자가 다음에 무엇을 해야 하는지 모르는 채로
 *   상태만 바뀌는 것을 막는다(T2.5 요구사항).
 */

/** `RefundStatus`(prisma) 미러 — 스키마 enum 과 값이 같아야 한다 */
export type RefundStatusValue =
  | "DRAFT"
  | "SUBMITTED"
  | "REVIEWING"
  | "NEED_MORE_DOCS"
  | "APPROVED"
  | "REJECTED"
  | "COMPLETED";

/** 전이를 일으키는 주체 */
export type RefundActor = "TENANT" | "ADMIN";

/** 어드민 심사 액션 — 화면 버튼 1개 = 액션 1개 */
export type RefundReviewAction = "START" | "NEED_MORE_DOCS" | "APPROVE" | "REJECT" | "COMPLETE";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "brand";
export type RefundStatusMeta = { label: string; tone: StatusTone; description: string };

/** 상태 배지 라벨·tone·세입자에게 보여 줄 한 줄 설명 */
export const REFUND_STATUS_META: Record<RefundStatusValue, RefundStatusMeta> = {
  DRAFT: {
    label: "작성중",
    tone: "neutral",
    description: "아직 제출 전입니다. 서류를 채우고 제출해 주세요.",
  },
  SUBMITTED: {
    label: "제출",
    tone: "info",
    description: "접수되었습니다. 담당자가 곧 심사를 시작합니다.",
  },
  REVIEWING: {
    label: "심사중",
    tone: "info",
    description: "담당자가 서류를 확인하고 있습니다.",
  },
  NEED_MORE_DOCS: {
    label: "보완요청",
    tone: "warning",
    description: "서류가 더 필요합니다. 아래 코멘트를 확인하고 추가로 올려 주세요.",
  },
  APPROVED: {
    label: "승인",
    tone: "success",
    description: "승인되었습니다. 환급금 지급 절차가 진행됩니다.",
  },
  REJECTED: {
    label: "반려",
    tone: "danger",
    description: "반려되었습니다. 사유를 확인해 주세요.",
  },
  COMPLETED: {
    label: "완료",
    tone: "success",
    description: "환급이 완료되었습니다.",
  },
};

/** 목록 필터·정렬에서 쓰는 노출 순서 */
export const REFUND_STATUS_ORDER: readonly RefundStatusValue[] = [
  "DRAFT",
  "SUBMITTED",
  "REVIEWING",
  "NEED_MORE_DOCS",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
];

/** 어드민 심사 큐의 기본 대상 — "아직 사람 손이 필요한" 상태들 */
export const REFUND_QUEUE_STATUSES: readonly RefundStatusValue[] = [
  "SUBMITTED",
  "REVIEWING",
  "NEED_MORE_DOCS",
];

export type RefundTransition = {
  from: RefundStatusValue;
  to: RefundStatusValue;
  actor: RefundActor;
  /** 어드민 액션이면 어떤 버튼인지 */
  action: RefundReviewAction | "SUBMIT";
  /** 심사 코멘트가 반드시 있어야 하는가 */
  requiresNote: boolean;
  label: string;
};

/** 위 표 그대로 — 허용된 전이만 들어 있다 */
export const REFUND_TRANSITIONS: readonly RefundTransition[] = [
  {
    from: "DRAFT",
    to: "SUBMITTED",
    actor: "TENANT",
    action: "SUBMIT",
    requiresNote: false,
    label: "제출",
  },
  {
    from: "SUBMITTED",
    to: "REVIEWING",
    actor: "ADMIN",
    action: "START",
    requiresNote: false,
    label: "심사 시작",
  },
  {
    from: "REVIEWING",
    to: "NEED_MORE_DOCS",
    actor: "ADMIN",
    action: "NEED_MORE_DOCS",
    requiresNote: true,
    label: "보완 요청",
  },
  {
    from: "REVIEWING",
    to: "APPROVED",
    actor: "ADMIN",
    action: "APPROVE",
    requiresNote: false,
    label: "승인",
  },
  {
    from: "REVIEWING",
    to: "REJECTED",
    actor: "ADMIN",
    action: "REJECT",
    requiresNote: true,
    label: "반려",
  },
  {
    from: "NEED_MORE_DOCS",
    to: "REVIEWING",
    actor: "TENANT",
    action: "SUBMIT",
    requiresNote: false,
    label: "보완 제출",
  },
  {
    from: "APPROVED",
    to: "COMPLETED",
    actor: "ADMIN",
    action: "COMPLETE",
    requiresNote: false,
    label: "지급 완료",
  },
];

/** 전이가 허용되는가. 같은 상태로의 전이는 언제나 false. */
export function canTransition(from: RefundStatusValue, to: RefundStatusValue): boolean {
  return REFUND_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

/** 전이가 막힌 이유 — API 409 메시지와 화면 안내가 같은 문구를 쓴다 */
export function transitionRejectReason(
  from: RefundStatusValue,
  to: RefundStatusValue,
): string {
  if (from === to) return `이미 「${REFUND_STATUS_META[to].label}」 상태입니다.`;
  if (isTerminal(from)) {
    return `「${REFUND_STATUS_META[from].label}」(으)로 종결된 신청입니다. 새 신청을 만들어 주세요.`;
  }
  return `「${REFUND_STATUS_META[from].label}」에서 「${REFUND_STATUS_META[to].label}」(으)로는 바꿀 수 없습니다.`;
}

/** 더 이상 전이가 없는 상태 */
export function isTerminal(status: RefundStatusValue): boolean {
  return !REFUND_TRANSITIONS.some((t) => t.from === status);
}

/** 어드민이 일으키는 전이 — `action` 이 심사 액션으로 좁혀져 있다 */
export type RefundAdminTransition = RefundTransition & { action: RefundReviewAction };

function isAdminTransition(t: RefundTransition): t is RefundAdminTransition {
  return t.actor === "ADMIN" && t.action !== "SUBMIT";
}

/** 어드민 액션 정의 — 액션 이름 하나로 "어디서 어디로, 코멘트가 필요한가" 가 정해진다 */
export function reviewTransitionsFor(action: RefundReviewAction): RefundAdminTransition[] {
  return REFUND_TRANSITIONS.filter(isAdminTransition).filter((t) => t.action === action);
}

/** 지금 상태에서 그 액션을 할 수 있는가 — 가능하면 전이를, 아니면 null */
export function resolveReviewTransition(
  from: RefundStatusValue,
  action: RefundReviewAction,
): RefundAdminTransition | null {
  return (
    REFUND_TRANSITIONS.filter(isAdminTransition).find(
      (t) => t.action === action && t.from === from,
    ) ?? null
  );
}

/**
 * 지금 상태에서 어드민이 누를 수 있는 버튼들.
 *
 * **어드민 앱은 이 배열을 API 응답으로 받아 그대로 그린다** — 상태 머신을 두 벌 두지 않으려는
 * 선택이다(어드민은 별도 Next 앱이라 `@/features/**` 를 import 할 수 없다).
 */
export function availableReviewActions(from: RefundStatusValue): RefundAdminTransition[] {
  return REFUND_TRANSITIONS.filter(isAdminTransition).filter((t) => t.from === from);
}

/** 세입자가 내용을 고칠 수 있는 상태 — 제출한 뒤에는 못 고친다 */
export function isEditableStatus(status: RefundStatusValue): boolean {
  return status === "DRAFT";
}

/** 세입자가 서류를 올릴 수 있는 상태 — 작성중이거나 보완요청을 받았을 때뿐 */
export function isUploadableStatus(status: RefundStatusValue): boolean {
  return status === "DRAFT" || status === "NEED_MORE_DOCS";
}

/**
 * `POST /api/refunds/[id]/submit` 의 목표 상태.
 * 최초 제출은 `SUBMITTED`, 보완 재제출은 `REVIEWING`(심사자 책상으로 되돌린다).
 */
export function submitTargetFor(status: RefundStatusValue): RefundStatusValue | null {
  const transition = REFUND_TRANSITIONS.find((t) => t.actor === "TENANT" && t.from === status);
  return transition?.to ?? null;
}

/** 세입자 화면 스테퍼 — 제출 → 심사중 → 승인/반려 → 완료 */
export const REFUND_STEPS = [
  { key: "SUBMIT", label: "제출", statuses: ["SUBMITTED"] },
  { key: "REVIEW", label: "심사중", statuses: ["REVIEWING", "NEED_MORE_DOCS"] },
  { key: "DECISION", label: "승인/반려", statuses: ["APPROVED", "REJECTED"] },
  { key: "DONE", label: "완료", statuses: ["COMPLETED"] },
] as const satisfies readonly {
  key: string;
  label: string;
  statuses: readonly RefundStatusValue[];
}[];

export type RefundStepKey = (typeof REFUND_STEPS)[number]["key"];
export type RefundStepState = "TODO" | "CURRENT" | "DONE";

/** 스테퍼 진행도 — DRAFT 는 아직 0단계(전부 TODO)다 */
const STEP_INDEX: Record<RefundStatusValue, number> = {
  DRAFT: -1,
  SUBMITTED: 0,
  REVIEWING: 1,
  NEED_MORE_DOCS: 1,
  APPROVED: 2,
  REJECTED: 2,
  COMPLETED: 3,
};

export function stepStateFor(status: RefundStatusValue, stepKey: RefundStepKey): RefundStepState {
  const current = STEP_INDEX[status];
  const index = REFUND_STEPS.findIndex((step) => step.key === stepKey);
  if (index < current) return "DONE";
  if (index === current) return "CURRENT";
  return "TODO";
}
