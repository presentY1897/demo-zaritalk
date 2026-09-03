/**
 * A/B 퍼널 집계 (T6.1·T6.2) — **DB 없이** 도는 최소 테스트.
 * 핵심: 단계 카운트의 anonId 중복 제거 · 변형별 분리.
 */
import { expect, test } from "vitest";
import { EXPERIMENTS } from "@/features/ab/experiments";
import { NOTICE_CTA_EXPERIMENT } from "@/features/notice/cta";
import { buildFunnel, type FunnelEventInput } from "./funnel";

const spec = EXPERIMENTS[NOTICE_CTA_EXPERIMENT];
if (!spec) throw new Error("notice_cta 실험이 등록돼 있어야 한다");

const view = (anonId: string, variant: string): FunnelEventInput => ({
  anonId,
  name: "notice_view",
  variant,
});
const click = (anonId: string, variant: string): FunnelEventInput => ({
  anonId,
  name: "notice_cta_click",
  variant,
});
const start = (anonId: string): FunnelEventInput => ({ anonId, name: "signup_start" });
const complete = (anonId: string): FunnelEventInput => ({ anonId, name: "signup_complete" });

function counts(result: ReturnType<typeof buildFunnel>, variant: string): number[] {
  return result.variants.find((item) => item.variant === variant)?.steps.map((s) => s.count) ?? [];
}

test("같은 사람이 여러 번 봐도 1 — anonId 중복 제거", () => {
  const result = buildFunnel({
    spec,
    assignments: [{ anonId: "a1", variant: "A" }],
    events: [view("a1", "A"), view("a1", "A"), view("a1", "A"), click("a1", "A"), click("a1", "A")],
  });

  expect(counts(result, "A")).toEqual([1, 1, 0, 0]);
  expect(result.totals.countedEvents).toBe(5); // 이벤트는 5건이지만 사람은 1명
});

test("변형별로 분리되고 전환율이 각자 계산된다", () => {
  const result = buildFunnel({
    spec,
    assignments: [
      { anonId: "a1", variant: "A" },
      { anonId: "a2", variant: "A" },
      { anonId: "b1", variant: "B" },
      { anonId: "b2", variant: "B" },
    ],
    events: [
      view("a1", "A"),
      view("a2", "A"),
      click("a1", "A"),
      view("b1", "B"),
      view("b2", "B"),
      click("b1", "B"),
      click("b2", "B"),
      start("b2"),
      complete("b2"),
    ],
  });

  expect(counts(result, "A")).toEqual([2, 1, 0, 0]);
  expect(counts(result, "B")).toEqual([2, 2, 1, 1]);

  const b = result.variants.find((item) => item.variant === "B");
  expect(b?.conversionRate).toBe(0.5);
  expect(b?.steps[1]?.rateFromPrev).toBe(1);
  expect(b?.steps[2]?.rateFromPrev).toBe(0.5);
  expect(b?.assignedCount).toBe(2);
});

test("앞 단계를 지나지 않은 사람은 뒤 단계에 끼지 못한다 (누적 퍼널)", () => {
  const result = buildFunnel({
    spec,
    assignments: [{ anonId: "a1", variant: "A" }],
    // 고지서를 열지 않고 가입만 한 방문자 — 퍼널 어느 단계에도 잡히지 않는다
    events: [start("a1"), complete("a1")],
  });

  expect(counts(result, "A")).toEqual([0, 0, 0, 0]);
  expect(result.variants[0]?.conversionRate).toBe(0);
});

test("배정되지 않은 방문자의 이벤트는 세지 않는다 (다른 경로 가입)", () => {
  const result = buildFunnel({
    spec,
    assignments: [{ anonId: "a1", variant: "A" }],
    events: [view("a1", "A"), click("a1", "A"), start("a1"), complete("a1"), start("zzz"), complete("zzz")],
  });

  expect(counts(result, "A")).toEqual([1, 1, 1, 1]);
  expect(result.totals.assigned).toBe(1);
});

test("`?variant=` 미리보기 — 배정과 다른 변형이 실린 이벤트는 세지 않는다", () => {
  const result = buildFunnel({
    spec,
    assignments: [{ anonId: "a1", variant: "A" }],
    // A 로 배정된 사람이 ?variant=B 로 열어 B 화면을 보고 클릭했다
    events: [view("a1", "B"), click("a1", "B")],
  });

  expect(counts(result, "A")).toEqual([0, 0, 0, 0]);
  expect(counts(result, "B")).toEqual([0, 0, 0, 0]);
  expect(result.totals.mismatchedEvents).toBe(2);
  expect(result.totals.countedEvents).toBe(0);
});

test("변형을 싣지 않는 단계(가입)는 배정으로 귀속된다", () => {
  const result = buildFunnel({
    spec,
    assignments: [{ anonId: "a1", variant: "A" }],
    events: [view("a1", "A"), click("a1", "A"), start("a1"), complete("a1")],
  });

  expect(counts(result, "A")).toEqual([1, 1, 1, 1]);
  expect(result.variants[0]?.conversionRate).toBe(1);
});

test("빈 데이터 — 모든 단계 0, 전환율 0 (NaN 이 새지 않는다)", () => {
  const result = buildFunnel({ spec, assignments: [], events: [] });

  expect(result.variants).toHaveLength(2);
  for (const variant of result.variants) {
    expect(variant.assignedCount).toBe(0);
    expect(variant.steps.map((step) => step.count)).toEqual([0, 0, 0, 0]);
    expect(variant.conversionRate).toBe(0);
    for (const step of variant.steps) {
      expect(Number.isNaN(step.rateFromTop)).toBe(false);
      expect(Number.isNaN(step.rateFromPrev)).toBe(false);
    }
  }
  expect(result.steps.map((step) => step.event)).toEqual([
    "notice_view",
    "notice_cta_click",
    "signup_start",
    "signup_complete",
  ]);
});

test("실험 정의에 없는 변형으로 배정된 줄은 모수에 넣지 않는다", () => {
  const result = buildFunnel({
    spec,
    assignments: [
      { anonId: "a1", variant: "A" },
      { anonId: "z1", variant: "Z" },
    ],
    events: [view("a1", "A"), view("z1", "Z")],
  });

  expect(result.totals.assigned).toBe(1);
  expect(counts(result, "A")).toEqual([1, 0, 0, 0]);
});

test("단계 카운트는 절대 늘지 않는다 (전환율 ≤ 100%)", () => {
  const result = buildFunnel({
    spec,
    assignments: [
      { anonId: "a1", variant: "A" },
      { anonId: "a2", variant: "A" },
    ],
    events: [view("a1", "A"), click("a1", "A"), start("a1"), start("a2"), complete("a2")],
  });

  const steps = result.variants.find((item) => item.variant === "A")?.steps ?? [];
  for (const [index, step] of steps.entries()) {
    if (index > 0) expect(step.count).toBeLessThanOrEqual(steps[index - 1]?.count ?? 0);
    expect(step.rateFromTop).toBeLessThanOrEqual(1);
    expect(step.rateFromPrev).toBeLessThanOrEqual(1);
  }
});
