/**
 * `POST /api/toss/checkout` — 주문번호 발급 + `TossPayment(READY)` (T2.1).
 *
 * **금액은 요청 본문에서 받지 않는다.** 클라이언트는 청구 id 만 보내고, 결제 금액은 서버가
 * 원장 엔진(T1.4) `calcOutstanding(totalDue, paidAmount)` 로 정한다 — 부분납부 청구는 잔액만
 * 결제된다. 이 금액이 승인 시점 위변조 검증의 기준값이 된다.
 *
 * | 상황 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 세입자 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 청구 | 404 `NOT_FOUND` |
 * | 남의 청구 | 403 `FORBIDDEN` |
 * | 이미 완납(잔액 0) | 409 `CONFLICT` |
 */
import { requireTenant } from "@/features/tenant/ownership";
import { requireTenantCharge } from "@/features/pay/ownership";
import { createCheckout } from "@/features/pay/queries";
import { checkoutSchema } from "@/features/pay/schema";
import { getTossClientKey, getTossSecretKey } from "@/features/pay/toss";
import { created, fail, parseJson } from "@/lib/api/response";

export async function POST(request: Request): Promise<Response> {
  const tenant = await requireTenant();
  if (tenant.response) return tenant.response;

  const parsed = await parseJson(request, checkoutSchema);
  if (parsed.response) return parsed.response;

  const owned = await requireTenantCharge(tenant.data, parsed.data.chargeId);
  if (owned.response) return owned.response;

  // 키가 없으면 위젯을 띄워도 결제가 끝나지 않는다 — 주문을 만들기 전에 막는다
  if (!getTossSecretKey() || !getTossClientKey()) {
    return fail("INTERNAL_ERROR", "결제 설정이 없습니다. 관리자에게 문의해 주세요.");
  }

  const outcome = await createCheckout(tenant.data, owned.data);
  if (outcome.kind === "settled") {
    return fail("CONFLICT", "이미 납부가 끝난 청구입니다.");
  }
  return created(outcome.checkout);
}
