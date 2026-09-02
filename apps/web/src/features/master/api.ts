/**
 * 마스터 피드·추천함·플랜 API 호출부 (T5.2).
 * 에러 변환 규약은 T5.1 `features/workorder/api.ts` 와 같다(`requestJson` 을 그대로 쓴다).
 */
import { requestJson } from "@/features/workorder/api";
import type { UpdateMasterPlanInput } from "@/features/workorder/schema";
import type {
  MasterFeedResult,
  MasterTargetsResult,
  UpdateMasterPlanResult,
} from "@/features/workorder/types";

/** pull — 업종·반경 매칭 피드(거리순) */
export function fetchMasterFeed(): Promise<MasterFeedResult> {
  return requestJson<MasterFeedResult>("/api/master/feed");
}

/** push — 나에게 발송된 추천(최신순). FREE 면 빈 목록 + `upgradeRequired` */
export function fetchMasterTargets(): Promise<MasterTargetsResult> {
  return requestJson<MasterTargetsResult>("/api/master/targets");
}

/** 데모용 플랜 전환 */
export function updateMasterPlan(input: UpdateMasterPlanInput): Promise<UpdateMasterPlanResult> {
  return requestJson<UpdateMasterPlanResult>("/api/master/plan", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
