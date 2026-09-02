/**
 * `GET /api/master/feed` — 마스터 **전체 피드(pull)** (T5.2).
 *
 * 내 업종 + 내 활동반경 안의 `REQUESTED` 의뢰를 **거리순**으로 준다.
 * [D4](../../../../../../docs/DECISIONS.md#-d4-마스터-매칭-방식--pull--push-하이브리드) 대로
 * **플랜과 무관하게 모든 마스터가 본다** — 무료 마스터가 일감에 닿는 유일한 길이다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 마스터 프로필·업종/활동지역 없음 | 403 `FORBIDDEN` |
 */
import { requireMaster } from "@/features/master/ownership";
import { listMasterFeed, toMasterPlanDto } from "@/features/master/queries";
import { ok } from "@/lib/api/response";

export async function GET(): Promise<Response> {
  const master = await requireMaster();
  if (master.response) return master.response;

  const workOrders = await listMasterFeed(master.data.detail);
  return ok({ workOrders, master: toMasterPlanDto(master.data.detail) });
}
