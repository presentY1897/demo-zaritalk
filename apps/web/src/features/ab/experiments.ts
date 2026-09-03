/**
 * 실험 레지스트리 (T6.1) — **실험 정의의 단일 출처**.
 *
 * 실운영 실험은 [D2](../../../../../docs/DECISIONS.md#-d2-ab-실험-소재-1개-실운영) 가 정한 `notice_cta` 하나다.
 * 변형 이름·문구는 [T1.8](../../../../../docs/tasks/t1.8-notice-public.md) 이 만든
 * `features/notice/cta.ts` 가 이미 갖고 있으므로 **여기서 다시 적지 않고 그대로 가져온다** —
 * 두 곳에 적으면 한쪽만 고치는 사고가 난다.
 *
 * 퍼널 단계(이벤트 이름·라벨)도 여기에 둔다. 어드민 퍼널 차트(T6.2)는 규칙을 하나도 들고 있지
 * 않고 API 응답의 단계 목록을 그대로 그린다(T2.5 가 `availableActions` 로 푼 것과 같은 방식).
 */
import { NOTICE_CTA_EXPERIMENT, NOTICE_CTA_VARIANTS } from "@/features/notice/cta";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import type { WeightedVariant } from "./hash";

/** 퍼널 한 단계 — 이벤트 이름과 화면에 그릴 라벨 */
export type FunnelStepSpec = {
  event: string;
  label: string;
  /**
   * 이 단계의 이벤트가 `props.variant` 를 싣고 오는가.
   * 싣고 오면 **배정된 변형과 일치할 때만** 센다(아래 "미리보기 오염 차단" 참고).
   */
  carriesVariant: boolean;
};

export type ExperimentSpec = {
  key: string;
  name: string;
  description: string;
  variants: readonly (WeightedVariant & { label: string })[];
  funnel: readonly FunnelStepSpec[];
};

/**
 * `notice_cta` — 공개 고지서(T1.8) 가입 CTA 문구·배치 2안.
 *
 * - A(대조군): 고지서를 다 읽은 뒤 하단 카드
 * - B: 금액 위 배너 한 줄 + 하단 카드
 *
 * 50:50. 퍼널은 D2 가 정한 4단계다.
 */
const NOTICE_CTA_SPEC: ExperimentSpec = {
  key: NOTICE_CTA_EXPERIMENT,
  name: "공개 고지서 가입 CTA",
  description: "미가입 세입자가 보는 고지서 하단 CTA 의 문구·배치 2안 (D2)",
  variants: [
    { key: NOTICE_CTA_VARIANTS[0], label: "A · 하단 카드(대조군)", weight: 50 },
    { key: NOTICE_CTA_VARIANTS[1], label: "B · 상단 배너 + 하단 카드", weight: 50 },
  ],
  funnel: [
    { event: TRACK_EVENTS.NOTICE_VIEW, label: "고지서 열람", carriesVariant: true },
    { event: TRACK_EVENTS.NOTICE_CTA_CLICK, label: "CTA 클릭", carriesVariant: true },
    { event: TRACK_EVENTS.SIGNUP_START, label: "가입 시작", carriesVariant: false },
    { event: TRACK_EVENTS.SIGNUP_COMPLETE, label: "가입 완료", carriesVariant: false },
  ],
};

export const EXPERIMENTS: Record<string, ExperimentSpec> = {
  [NOTICE_CTA_SPEC.key]: NOTICE_CTA_SPEC,
};

/** 실험 키 형식 — 이벤트 이름과 같은 규약(소문자·숫자·`_`)이라 URL 로 받아도 안전하다. */
const EXPERIMENT_KEY_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+){0,3}$/;

export function isExperimentKeyShape(value: string): boolean {
  return EXPERIMENT_KEY_PATTERN.test(value);
}

/** 등록되지 않은 실험이면 `undefined` — 호출부가 404 로 만든다. */
export function findExperiment(key: string): ExperimentSpec | undefined {
  return isExperimentKeyShape(key) ? EXPERIMENTS[key] : undefined;
}

export function experimentVariantKeys(spec: ExperimentSpec): string[] {
  return spec.variants.map((variant) => variant.key);
}
