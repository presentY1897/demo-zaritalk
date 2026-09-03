/**
 * `GET /api/admin/metrics/overview` — 어드민 대시보드 집계 (T6.2).
 *
 * 대시보드가 부르는 엔드포인트는 **이것과 `/funnel` 둘뿐이다**(task 정의). 카드마다 API 를 만들면
 * 화면 한 장에 요청이 예닐곱 개 붙어 어느 것이 느린지도 알 수 없다. 여기서 한 번에 읽는다.
 *
 * 인증은 T2.5 어드민 판정을 그대로 쓴다(`features/metrics/ownership.ts`) —
 * 세션 `isAdmin` 또는 어드민 서버의 `x-admin-secret`. 401/403 도 그쪽 규칙 그대로다.
 *
 * ```
 * ?days=30    일별(가입·DAU) 구간, 1~180, 기본 30
 * ?months=6   월별(수납률·발송·결제) 구간, 1~24, 기본 6
 * ```
 * 범위를 벗어난 값은 400 이 아니라 **잘라서** 쓴다 — 대시보드 링크를 타고 온 운영자에게
 * 에러 화면 대신 화면을 준다(T1.6 장부가 잘못된 `year` 를 다루는 방식과 같다).
 */
import { z } from "zod";
import { getMetricsOverview } from "@/features/metrics/queries";
import { requireMetricsAdmin } from "@/features/metrics/ownership";
import { ok, parseQuery } from "@/lib/api/response";

const querySchema = z.object({
  days: z.coerce.number().optional(),
  months: z.coerce.number().optional(),
});

export async function GET(request: Request): Promise<Response> {
  const admin = await requireMetricsAdmin(request);
  if (admin.response) return admin.response;

  const parsed = parseQuery(request, querySchema);
  if (parsed.response) return parsed.response;

  const overview = await getMetricsOverview(parsed.data);
  return ok(overview);
}
