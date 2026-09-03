/**
 * `GET /api/admin/metrics/funnel?experiment=notice_cta` — A/B 퍼널 (T6.1·T6.2).
 *
 * D2 퍼널 `notice_view → notice_cta_click → signup_start → signup_complete` 를
 * **변형별로** 센다. 단계 카운트는 anonId 중복 제거이고, 각 단계는 앞 단계를 지난 사람만 센다
 * (규칙과 근거는 `features/metrics/funnel.ts` 주석).
 *
 * 응답은 단계 목록(`steps`)까지 실어 보낸다 — 어드민 화면은 실험 정의를 하나도 들고 있지 않고
 * 받은 것을 그대로 그린다(T2.5 가 `availableActions` 로 푼 것과 같은 방식).
 *
 * 인증은 T2.5 어드민 판정 그대로. 등록되지 않은 실험 키는 404 다.
 */
import { z } from "zod";
import { NOTICE_CTA_EXPERIMENT } from "@/features/notice/cta";
import { getExperimentFunnel } from "@/features/metrics/queries";
import { requireMetricsAdmin } from "@/features/metrics/ownership";
import { fail, ok, parseQuery } from "@/lib/api/response";

const querySchema = z.object({
  experiment: z.string().trim().min(1).max(64).optional(),
});

export async function GET(request: Request): Promise<Response> {
  const admin = await requireMetricsAdmin(request);
  if (admin.response) return admin.response;

  const parsed = parseQuery(request, querySchema);
  if (parsed.response) return parsed.response;

  const funnel = await getExperimentFunnel(parsed.data.experiment ?? NOTICE_CTA_EXPERIMENT);
  if (!funnel) return fail("NOT_FOUND", "등록되지 않은 실험입니다.");

  return ok({ funnel });
}
