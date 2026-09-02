/**
 * 마스터 유료 플랜 규칙 (T5.2 · [D4](../../../../../docs/DECISIONS.md#-d4-마스터-매칭-방식--pull--push-하이브리드)).
 *
 * `@zari/db` 를 모르는 순수 모듈이라 화면(배지·업그레이드 안내)과 서버(추천 대상 선정)가
 * **같은 판정**을 쓴다. 판정이 갈리면 "PRO 인데 추천이 안 온다" 같은 거짓말이 화면에 남는다.
 *
 * - `FREE` — 전체 피드(pull)만. 자기 업종·반경의 `REQUESTED` 의뢰를 뒤져서 찾아간다.
 * - `PRO` — 위에 더해 **추천(push)** 을 받는다. 의뢰가 생기는 즉시 추천함에 꽂힌다.
 * - `planUntil` 은 유료 만료 시각이다. **지났으면 `PRO` 라도 무료와 같이 취급한다** —
 *   결제가 끊긴 계정에 추천이 계속 가면 안 되기 때문이다. `null` 이면 만료가 없다.
 */
import type { MasterPlanValue } from "@/features/workorder/types";

export type PlanTone = "brand" | "neutral";

export const MASTER_PLAN_META: Record<
  MasterPlanValue,
  { label: string; tone: PlanTone; description: string }
> = {
  FREE: {
    label: "무료",
    tone: "neutral",
    description: "전체 피드에서 내 업종·활동반경의 의뢰를 직접 찾습니다.",
  },
  PRO: {
    label: "PRO",
    tone: "brand",
    description: "조건에 맞는 의뢰를 추천으로 먼저 받아봅니다.",
  },
};

/** 지금 이 순간 추천(push)을 받을 수 있는 상태인가 — 만료된 PRO 는 false */
export function isProActive(
  plan: MasterPlanValue,
  planUntil: Date | string | null,
  now: Date = new Date(),
): boolean {
  if (plan !== "PRO") return false;
  if (planUntil === null) return true;
  const until = planUntil instanceof Date ? planUntil : new Date(planUntil);
  if (Number.isNaN(until.getTime())) return true; // 못 읽는 값은 만료로 보지 않는다
  return until.getTime() >= now.getTime();
}

/** 데모 토글로 PRO 를 켤 때 붙이는 유효기간(30일) */
export const DEMO_PRO_DURATION_DAYS = 30;

export function demoPlanUntil(plan: MasterPlanValue, now: Date = new Date()): Date | null {
  if (plan !== "PRO") return null;
  return new Date(now.getTime() + DEMO_PRO_DURATION_DAYS * 24 * 60 * 60 * 1000);
}
