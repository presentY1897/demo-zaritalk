/**
 * `GET /api/tenant/pending-leases` — 내 전화번호로 등록된 수락 대기 계약 (T1.3).
 *
 * 임대인이 계약을 먼저 등록하면(T1.2) 세입자는 아직 가입 전이라 계약이 `PENDING_TENANT` 로
 * 남고 전화번호만 적혀 있다. 그 번호로 가입한 세입자가 이 API 로 자기 대기 계약을 찾는다.
 * 매칭은 `@/lib/phone` 의 `normalizePhone` 으로 정규화한 숫자끼리 비교한다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 세입자 프로필 없음 | 403 `FORBIDDEN` |
 */
import { requireTenant } from "@/features/tenant/ownership";
import { listPendingLeases } from "@/features/tenant/queries";
import { ok } from "@/lib/api/response";

export async function GET(): Promise<Response> {
  const tenant = await requireTenant();
  if (tenant.response) return tenant.response;

  const leases = await listPendingLeases(tenant.data.user.phone);
  return ok({ leases });
}
