/**
 * `POST /api/master/plan` — **데모용 플랜 전환**(FREE ↔ PRO) (T5.2).
 *
 * 결제 없이 토글한다. [D4](../../../../../../docs/DECISIONS.md#-d4-마스터-매칭-방식--pull--push-하이브리드) 의
 * "유료는 받아본다" 를 시연하려면 한 계정으로 두 상태를 오갈 수 있어야 하기 때문이다 —
 * 실제 서비스라면 결제 성공 콜백이 이 자리에 온다.
 *
 * `PRO` 로 켜면 `planUntil` 을 30일 뒤로 세우고, `FREE` 로 끄면 `null` 로 지운다
 * (만료 판정은 `features/master/plan.ts` 의 `isProActive` 한 곳에서만 한다).
 *
 * **PRO 로 켜면 추천함을 그 자리에서 채운다**(`backfillTargetsForMaster`) — 지금 열려 있는
 * `REQUESTED` 의뢰 중 내 업종·반경에 맞는 것을 한 번 훑는다. 토글 직후 추천함이 비어 있으면
 * 유료의 값어치가 화면에 드러나지 않기 때문이다(T5.2 완료 기준). **의뢰당 거리순 10명 상한은
 * 그대로 지켜진다** — 내가 11번째로 먼 마스터라면 채워지지 않는다.
 * `FREE` 로 끄면 과거 타겟 행은 지우지 않고 **조회에서만 가린다**(발송 기록이므로 남긴다).
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 마스터 프로필·업종/활동지역 없음 | 403 `FORBIDDEN` |
 * | 모르는 플랜 값 | 400 `VALIDATION_ERROR` |
 */
import { prisma, type MasterPlan } from "@zari/db";
import { requireMaster } from "@/features/master/ownership";
import { demoPlanUntil } from "@/features/master/plan";
import { toMasterPlanDto } from "@/features/master/queries";
import { backfillTargetsForMaster } from "@/features/workorder/matching";
import { updateMasterPlanSchema } from "@/features/workorder/schema";
import { ok, parseJson } from "@/lib/api/response";

export async function POST(request: Request): Promise<Response> {
  const master = await requireMaster();
  if (master.response) return master.response;

  const parsed = await parseJson(request, updateMasterPlanSchema);
  if (parsed.response) return parsed.response;

  const detail = await prisma.masterDetail.update({
    where: { profileId: master.data.profile.id },
    data: {
      plan: parsed.data.plan as MasterPlan,
      planUntil: demoPlanUntil(parsed.data.plan),
    },
  });

  const backfilled =
    parsed.data.plan === "PRO" ? await backfillTargetsForMaster(detail) : 0;

  return ok({ master: toMasterPlanDto(detail), backfilledCount: backfilled });
}
