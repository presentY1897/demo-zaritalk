/**
 * `GET /api/master/targets` — 마스터 **추천함(push)** (T5.2). 유료(PRO) 전용.
 *
 * 나에게 발송된 `WorkOrderTarget` 을 최신 발송순으로 준다.
 * **FREE(또는 만료된 PRO)면 빈 목록 + `upgradeRequired: true`** 다 — 403 이 아니다.
 * 화면이 "권한 없음" 이 아니라 **업그레이드 안내**를 그려야 하고, 그 안내에도 내 플랜 정보가 필요하다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 마스터 프로필·업종/활동지역 없음 | 403 `FORBIDDEN` |
 */
import { requireMaster } from "@/features/master/ownership";
import { listMasterTargets, toMasterPlanDto } from "@/features/master/queries";
import { isProActive } from "@/features/master/plan";
import type { MasterPlanValue } from "@/features/workorder/types";
import { ok } from "@/lib/api/response";

export async function GET(): Promise<Response> {
  const master = await requireMaster();
  if (master.response) return master.response;

  const { detail } = master.data;
  const workOrders = await listMasterTargets(detail);
  const upgradeRequired = !isProActive(detail.plan as MasterPlanValue, detail.planUntil);

  return ok({ workOrders, master: toMasterPlanDto(detail), upgradeRequired });
}
