/**
 * 중개 요청·타겟 상태의 **단일 출처** (T3.6·T3.7) — 라벨·tone·**상태 전이표**.
 *
 * `@zari/db` 를 import 하지 않는 순수 모듈이라 라우트 핸들러·서버 조회·클라이언트 화면이
 * **같은 답**을 쓴다. 버튼 비활성 사유와 API 409 문구가 갈라지지 않게 하기 위한 것이다
 * (T3.1 `features/listing/status.ts` 와 같은 규약).
 *
 * ## 타겟 상태 전이표 — `SENT → VIEWED → ACCEPTED | DECLINED` 만 허용한다
 *
 * | 현재 \ 목표 | `VIEWED` 열람 | `ACCEPTED` 수락 | `DECLINED` 거절 |
 * |---|---|---|---|
 * | `SENT` 발송됨 | ✅ | ❌ 409 (먼저 열람) | ❌ 409 (먼저 열람) |
 * | `VIEWED` 열람 | ⚪️ 멱등(변화 없음) | ✅ | ✅ |
 * | `ACCEPTED` 수락 | ⚪️ 멱등 | ❌ 409 (이미 응답) | ❌ 409 (이미 응답) |
 * | `DECLINED` 거절 | ⚪️ 멱등 | ❌ 409 (이미 응답) | ❌ 409 (이미 응답) |
 *
 * - **뒤로 가는 전이는 없다.** 수락·거절은 종결 상태이고, 열람 표시를 되돌릴 수도 없다.
 * - **열람(`VIEWED`)은 멱등이다** — 같은 요청을 두 번 열어도 200 이고 아무 것도 바뀌지 않는다.
 *   상세 화면이 열릴 때마다 열람을 표시하므로 여기서 409 를 내면 화면이 매번 에러를 그린다.
 * - **보지 않고 수락할 수 없다.** "열람 → 수락" 이 T3.6 문서가 정한 흐름이고, 임대인 화면의
 *   「열람 n · 수락 n」 현황이 뜻을 가지려면 수락은 반드시 열람을 지나야 한다.
 *   화면은 상세를 열 때 자동으로 열람을 표시하므로 사용자는 이 규칙을 만날 일이 없다 —
 *   API 를 직접 부르는 쪽만 순서를 지키면 된다.
 * - **수락은 복수 허용**이다(여러 중개인이 같은 요청을 수락할 수 있다). 요청 쪽 상태는
 *   **첫 수락에서 한 번만** `OPEN → MATCHED` 로 넘어간다(`shouldMatchRequest`).
 */
import type { BrokerageRequestStatusValue, BrokerageTargetStatusValue } from "./types";

export type BrokerageTone = "success" | "warning" | "danger" | "info" | "neutral" | "brand";
export type BrokerageStatusMeta = { label: string; tone: BrokerageTone; description: string };

/** 요청 상태 — 배지 라벨과 tone (색만으로 뜻을 전하지 않는다 · T0.6) */
export const BROKERAGE_REQUEST_STATUS_META: Record<
  BrokerageRequestStatusValue,
  BrokerageStatusMeta
> = {
  OPEN: { label: "응답 대기", tone: "warning", description: "중개인의 응답을 기다리는 중" },
  MATCHED: { label: "매칭", tone: "success", description: "수락한 중개인이 있습니다" },
  CLOSED: { label: "종료", tone: "neutral", description: "더 이상 응답을 받지 않습니다" },
};

/** 타겟(중개인 한 명에게 간 요청) 상태 */
export const BROKERAGE_TARGET_STATUS_META: Record<
  BrokerageTargetStatusValue,
  BrokerageStatusMeta
> = {
  SENT: { label: "새 요청", tone: "brand", description: "아직 열어보지 않았습니다" },
  VIEWED: { label: "열람", tone: "info", description: "열어봤지만 아직 응답 전입니다" },
  ACCEPTED: { label: "수락", tone: "success", description: "중개를 맡기로 했습니다" },
  DECLINED: { label: "거절", tone: "neutral", description: "이번 건은 맡지 않습니다" },
};

/** 현황 표·집계에서 쓰는 노출 순서 */
export const BROKERAGE_TARGET_STATUS_ORDER: readonly BrokerageTargetStatusValue[] = [
  "SENT",
  "VIEWED",
  "ACCEPTED",
  "DECLINED",
];

/** 중개인이 응답으로 고를 수 있는 값 — 열람은 화면이 자동으로 올리므로 버튼이 없다 */
export const BROKERAGE_RESPONSES = ["ACCEPTED", "DECLINED"] as const;
export type BrokerageResponseValue = (typeof BROKERAGE_RESPONSES)[number];

/** respond 라우트가 받을 수 있는 값 전부(열람 표시 포함) */
export const BROKERAGE_RESPOND_TARGETS = ["VIEWED", "ACCEPTED", "DECLINED"] as const;
export type BrokerageRespondTarget = (typeof BROKERAGE_RESPOND_TARGETS)[number];

/** 종결 상태 — 여기서는 어디로도 갈 수 없다 */
export function isRespondedTarget(status: BrokerageTargetStatusValue): boolean {
  return status === "ACCEPTED" || status === "DECLINED";
}

export type TargetTransitionResult =
  /** 상태를 바꿔 저장한다 */
  | { ok: true; changed: true }
  /** 이미 그 지점을 지났다 — 200 이지만 아무 것도 바꾸지 않는다(열람 멱등) */
  | { ok: true; changed: false }
  /** 409 — 사유는 그대로 화면 문구가 된다 */
  | { ok: false; reason: string };

/**
 * 타겟 상태 전이 판정 — 위 표 그대로다. **라우트와 화면이 같이 쓴다.**
 */
export function checkTargetTransition(
  from: BrokerageTargetStatusValue,
  to: BrokerageRespondTarget,
): TargetTransitionResult {
  if (to === "VIEWED") {
    // 열람은 SENT 에서만 실제로 바뀌고, 그 뒤로는 조용히 넘어간다(멱등)
    return from === "SENT" ? { ok: true, changed: true } : { ok: true, changed: false };
  }

  if (isRespondedTarget(from)) {
    return {
      ok: false,
      reason: `이미 ${BROKERAGE_TARGET_STATUS_META[from].label}한 요청입니다.`,
    };
  }
  if (from === "SENT") {
    return { ok: false, reason: "요청을 먼저 열람해 주세요." };
  }
  return { ok: true, changed: true };
}

/**
 * 이 응답으로 요청이 `MATCHED` 로 넘어가야 하는가 — **첫 수락에서 한 번만** true.
 *
 * 수락은 복수 허용이므로 두 번째 수락에서는 이미 `MATCHED` 라 false 다.
 * `CLOSED` 된 요청은 되살리지 않는다.
 */
export function shouldMatchRequest(
  requestStatus: BrokerageRequestStatusValue,
  response: BrokerageRespondTarget,
): boolean {
  return response === "ACCEPTED" && requestStatus === "OPEN";
}

/** "행당해피빌 101호" — 목록·발송 로그가 같은 문구를 쓴다 */
export function formatBrokeragePlace(place: {
  buildingName: string;
  unitLabel: string;
}): string {
  return `${place.buildingName} ${place.unitLabel}`;
}

/** 소수 1자리 km — 목록에서 거리 비교가 한눈에 되도록 */
export function formatDistanceKm(km: number): string {
  return `${km.toFixed(1)}km`;
}
