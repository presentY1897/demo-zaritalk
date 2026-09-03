/**
 * `GET /api/admin/leases` — 계약 목록 · 상태 필터 · **연체 드릴다운** (T6.3).
 *
 * - `?status=ACTIVE,ENDED` — 콤마로 여러 개. 모르는 값은 버린다
 * - `?overdue=1` — 연체 청구(`ChargeStatus.OVERDUE`)가 하나라도 있는 계약만
 * - `?q=` — 세입자 이름·전화·호실·건물명
 *
 * 행마다 붙는 `overdueCount`(저장된 상태 기준)와 `delinquentCount`·`outstandingAmount`·
 * `maxOverdueDays`(원장 엔진 판정, 부분납 포함)는 **뜻이 다르다** — 화면이 둘을 나란히 보여 준다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 세션도 시크릿도 없음 | 401 `UNAUTHORIZED` |
 * | 비어드민 세션 | 403 `FORBIDDEN` |
 * | `page`·`pageSize` 범위 밖 | 400 `VALIDATION_ERROR` |
 */
import { requireAdmin } from "@/features/admin/guard";
import { listAdminLeases } from "@/features/admin/queries";
import { adminLeasesQuerySchema } from "@/features/admin/schema";
import { ok, parseQuery } from "@/lib/api/response";

export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdmin(request);
  if (admin.response) return admin.response;

  const parsed = parseQuery(request, adminLeasesQuerySchema);
  if (parsed.response) return parsed.response;

  return ok(await listAdminLeases(parsed.data));
}
