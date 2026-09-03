/**
 * `GET /api/admin/charges` — 청구·수납 원장 조회 (T6.3).
 *
 * - `?status=OVERDUE,PARTIALLY_PAID` · `?year=`·`?month=`
 * - `?leaseId=` — 계약 드릴다운. 이때 응답의 `lease` 에 그 계약 요약이 함께 온다
 *
 * 금액·연체일수·미납액은 한 줄도 여기서 계산하지 않는다 — 전부 `@/lib/rent`(T1.4)가 판정한
 * 값이고, 기준일(`asOf`)은 `kstToday()` 다. 응답의 `asOf` 가 그 기준일을 밝힌다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 세션도 시크릿도 없음 | 401 `UNAUTHORIZED` |
 * | 비어드민 세션 | 403 `FORBIDDEN` |
 * | `year`·`month`·`page`·`pageSize` 범위 밖 | 400 `VALIDATION_ERROR` |
 */
import { requireAdmin } from "@/features/admin/guard";
import { listAdminCharges } from "@/features/admin/queries";
import { adminChargesQuerySchema } from "@/features/admin/schema";
import { ok, parseQuery } from "@/lib/api/response";

export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdmin(request);
  if (admin.response) return admin.response;

  const parsed = parseQuery(request, adminChargesQuerySchema);
  if (parsed.response) return parsed.response;

  return ok(await listAdminCharges(parsed.data));
}
