/**
 * 자리페이 API 호출부 (T2.2).
 * 에러는 D1 규약대로 `{ error: { code, message, details } }` 한 형태라 `ApiError`(T0.4)로 바꿔 던진다.
 * 래퍼 모양은 T1.2 `features/lease/api.ts` 와 같다.
 */
import { ApiError } from "@/features/auth/api";
import type { ConfirmInput } from "./schema";
import type { CheckoutDto, ConfirmResultDto } from "./types";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });

  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? "요청을 처리하지 못했습니다.",
      error?.details,
    );
  }
  return body as T;
}

/** 주문번호 발급 — 결제 금액은 서버가 청구 잔액으로 확정해 돌려준다 */
export function createCheckout(chargeId: string): Promise<CheckoutDto> {
  return requestJson<CheckoutDto>("/api/toss/checkout", {
    method: "POST",
    body: JSON.stringify({ chargeId }),
  });
}

/** 승인 — successUrl 쿼리를 그대로 넘긴다. 이 호출이 끝나야 결제가 완료된다 */
export function confirmPayment(input: ConfirmInput): Promise<ConfirmResultDto> {
  return requestJson<ConfirmResultDto>("/api/toss/confirm", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
