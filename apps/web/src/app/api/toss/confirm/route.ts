/**
 * `POST /api/toss/confirm` — 금액 위변조 검증 → 토스 승인 → 원장 반영 (T2.1).
 *
 * 위젯이 `successUrl` 로 돌려준 쿼리(`paymentKey`·`orderId`·`amount`)를 그대로 받는다.
 * **승인은 이 호출이 끝나야 완료**된다(토스 문서: successUrl 리다이렉트만으로는 결제가 끝나지 않는다).
 *
 * | 상황 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 세입자 프로필 없음 · 남의 주문 | 403 `FORBIDDEN` |
 * | 없는 주문번호 | 404 `NOT_FOUND` |
 * | **금액 불일치**(위변조·청구 변경) | 400 `VALIDATION_ERROR` |
 * | **이미 승인·취소·실패한 주문**(재승인) | 409 `CONFLICT` |
 * | 토스가 승인을 거절 | 409 `CONFLICT` + `details.tossCode` |
 *
 * > 승인 거절은 의미상 502(Bad Gateway)에 가깝지만 `lib/api/response.ts` 의 `ApiErrorCode`
 * > 집합(T0.3 소유, 이 task 는 읽기 전용)에 해당 코드가 없어 409 로 내보내고 토스 코드는
 * > `details` 에 실어 준다. 화면은 `details.tossCode`·`message` 로 사유를 그대로 보여 준다.
 */
import { requireTenant } from "@/features/tenant/ownership";
import { confirmCheckout } from "@/features/pay/queries";
import { confirmSchema } from "@/features/pay/schema";
import { fail, ok, parseJson } from "@/lib/api/response";

export async function POST(request: Request): Promise<Response> {
  const tenant = await requireTenant();
  if (tenant.response) return tenant.response;

  const parsed = await parseJson(request, confirmSchema);
  if (parsed.response) return parsed.response;

  const outcome = await confirmCheckout(tenant.data, parsed.data);

  switch (outcome.kind) {
    case "ok":
      return ok(outcome.result);
    case "not_found":
      return fail("NOT_FOUND", "결제 주문을 찾을 수 없습니다.");
    case "forbidden":
      return fail("FORBIDDEN", "내 결제만 승인할 수 있습니다.");
    case "amount_mismatch":
      return fail(
        "VALIDATION_ERROR",
        `결제 금액이 청구 잔액과 다릅니다. 다시 시도해 주세요.`,
        {
          expected: outcome.expected,
          received: outcome.received,
          outstanding: outcome.outstanding,
        },
      );
    case "already":
      return fail("CONFLICT", "이미 처리된 결제입니다.", { status: outcome.status });
    case "declined":
      return fail("CONFLICT", outcome.message, {
        tossCode: outcome.code,
        tossMessage: outcome.message,
      });
  }
}
