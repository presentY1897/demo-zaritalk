/**
 * A/B 퍼널 집계 (T6.1·T6.2) — 순수 함수, DB 없음.
 *
 * D2 퍼널: `notice_view → notice_cta_click → signup_start → signup_complete`.
 *
 * ## ① 단계 카운트는 **anonId 중복 제거**다
 *
 * 같은 사람이 고지서를 세 번 열어도 `notice_view` 는 3건 쌓이지만 퍼널의 1단계는 **1**이다.
 * 전환율의 분모·분자가 "사람 수" 여야 비율이 뜻을 갖는다 — 이벤트 수로 세면 새로고침이 많은
 * 변형의 전환율이 낮게 나온다. 그래서 단계마다 `Set<anonId>` 로 접는다.
 *
 * ## ② 각 단계는 **앞 단계를 지난 사람 중에서만** 센다 (누적 퍼널)
 *
 * 단계 집합이 부분집합으로 좁아지므로 카운트가 절대 늘지 않고, 전환율이 100%를 넘을 수 없다.
 * 고지서를 안 보고 다른 경로로 가입한 사람이 `signup_complete` 만으로 4단계에 끼는 일도 없다.
 * (시간 순서는 보지 않는다. anonId 하나가 곧 한 방문자의 한 여정인 규모라 순서 검증은 과하다 —
 * 필요해지면 `TrackingEvent.createdAt` 이 남아 있으니 여기서만 조건을 더하면 된다.)
 *
 * ## ③ 모수는 **배정된 사람**(`AbAssignment`)이다
 *
 * 배정은 공개 고지서를 실제로 연 순간에만 생기므로(T1.8 화면이 `assignVariant` 를 부른다),
 * "실험에 노출된 사람" 과 "배정 줄이 있는 사람" 이 같다.
 *
 * ## ④ 변형을 싣고 오는 이벤트는 **배정과 일치할 때만** 센다
 *
 * `notice_view`·`notice_cta_click` 의 `props.variant` 는 **화면에 실제로 그려진 문구**다.
 * 데모·E2E 의 `?variant=` 미리보기(T6.1)나 손으로 쿼리를 바꾼 방문자는 배정과 다른 화면을 보므로
 * 그 이벤트는 어느 변형의 성과도 아니다 — 세지 않는다. 이것이 **강제 경로가 실험을 오염시키지
 * 못하게 하는 장치**이고, 그래서 `?variant=` 를 지우지 않고 남겨 둘 수 있었다.
 */
import type { ExperimentSpec } from "@/features/ab/experiments";
import { ratio } from "./series";

export type FunnelAssignmentInput = { anonId: string; variant: string };
export type FunnelEventInput = { anonId: string; name: string; variant?: string | null };

export type FunnelStep = {
  event: string;
  label: string;
  /** 이 단계에 도달한 **사람 수**(anonId 중복 제거) */
  count: number;
  /** 1단계 대비 (0~1) */
  rateFromTop: number;
  /** 직전 단계 대비 (0~1). 1단계는 1 */
  rateFromPrev: number;
};

export type FunnelVariantResult = {
  variant: string;
  label: string;
  /** 이 변형에 배정된 사람 수 — 50:50 이 실제로 지켜지는지 여기서 보인다 */
  assignedCount: number;
  steps: FunnelStep[];
  /** 마지막 단계 ÷ 1단계 (0~1) */
  conversionRate: number;
};

export type FunnelResult = {
  experimentKey: string;
  experimentName: string;
  description: string;
  steps: { event: string; label: string }[];
  variants: FunnelVariantResult[];
  totals: { assigned: number; linkedUsers: number; countedEvents: number; mismatchedEvents: number };
};

function buildVariant(
  spec: ExperimentSpec,
  variant: { key: string; label: string },
  population: Set<string>,
  reachedByStep: Map<string, Set<string>>,
): FunnelVariantResult {
  let passed = population;
  const steps: FunnelStep[] = [];
  let topCount = 0;
  let previousCount = 0;

  for (const [index, step] of spec.funnel.entries()) {
    const reached = reachedByStep.get(step.event) ?? new Set<string>();
    // 앞 단계를 지난 사람만 남긴다(누적 퍼널)
    passed = new Set([...passed].filter((anonId) => reached.has(anonId)));
    const count = passed.size;
    if (index === 0) topCount = count;

    steps.push({
      event: step.event,
      label: step.label,
      count,
      rateFromTop: index === 0 ? (count > 0 ? 1 : 0) : ratio(count, topCount),
      rateFromPrev: index === 0 ? (count > 0 ? 1 : 0) : ratio(count, previousCount),
    });
    previousCount = count;
  }

  return {
    variant: variant.key,
    label: variant.label,
    assignedCount: population.size,
    steps,
    conversionRate: ratio(steps.at(-1)?.count ?? 0, topCount),
  };
}

export function buildFunnel(input: {
  spec: ExperimentSpec;
  assignments: readonly FunnelAssignmentInput[];
  events: readonly FunnelEventInput[];
  linkedUsers?: number;
}): FunnelResult {
  const { spec, assignments, events } = input;

  /** anonId → 배정 변형 */
  const assignedVariant = new Map<string, string>();
  /** 변형 → 배정된 anonId 들 */
  const population = new Map<string, Set<string>>(
    spec.variants.map((variant) => [variant.key, new Set<string>()]),
  );
  for (const assignment of assignments) {
    const bucket = population.get(assignment.variant);
    if (!bucket) continue; // 실험 정의에 없는 변형(정의 변경 흔적)은 세지 않는다
    bucket.add(assignment.anonId);
    assignedVariant.set(assignment.anonId, assignment.variant);
  }

  const carriesVariant = new Map(spec.funnel.map((step) => [step.event, step.carriesVariant]));
  /** 이벤트 이름 → 그 이벤트를 남긴 anonId 집합(중복 제거) */
  const reachedByStep = new Map<string, Set<string>>(
    spec.funnel.map((step) => [step.event, new Set<string>()]),
  );

  let countedEvents = 0;
  let mismatchedEvents = 0;

  for (const event of events) {
    const reached = reachedByStep.get(event.name);
    if (!reached) continue;

    const assigned = assignedVariant.get(event.anonId);
    if (!assigned) continue; // 실험에 배정되지 않은 방문자(다른 경로 가입 등)

    if (carriesVariant.get(event.name) && event.variant !== assigned) {
      mismatchedEvents += 1; // `?variant=` 미리보기 등 — 배정과 다른 화면을 본 이벤트
      continue;
    }

    reached.add(event.anonId);
    countedEvents += 1;
  }

  return {
    experimentKey: spec.key,
    experimentName: spec.name,
    description: spec.description,
    steps: spec.funnel.map((step) => ({ event: step.event, label: step.label })),
    variants: spec.variants.map((variant) =>
      buildVariant(spec, variant, population.get(variant.key) ?? new Set(), reachedByStep),
    ),
    totals: {
      assigned: assignedVariant.size,
      linkedUsers: input.linkedUsers ?? 0,
      countedEvents,
      mismatchedEvents,
    },
  };
}
