/**
 * 환급 계산 API 호출부 (T2.3).
 *
 * 에러는 D1 규약대로 `{ error: { code, message } }` 한 형태라 `ApiError`(T0.4)로 바꿔 던진다 —
 * 래퍼 모양은 `features/lease/api.ts`(T1.2)와 같다. **비로그인도 부르는 엔드포인트**라
 * 세션 헤더를 따로 붙이지 않는다.
 */
import { ApiError } from "@/features/auth/api";
import type { RefundCalcResult } from "./calc";
import type { RefundCalcRequest } from "./schema";

export async function requestRefundCalculation(
  input: RefundCalcRequest,
): Promise<RefundCalcResult> {
  const response = await fetch("/api/refund/calculate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? "계산하지 못했습니다.",
      error?.details,
    );
  }
  return (body as { result: RefundCalcResult }).result;
}
