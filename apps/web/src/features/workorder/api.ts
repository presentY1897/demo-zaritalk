/**
 * 작업 의뢰 API 호출부 (T5.1).
 * 에러는 D1 규약대로 `{ error: { code, message } }` 한 형태라 `ApiError`(T0.4)로 바꿔 던진다.
 * 래퍼 모양은 T2.6 `features/complaint/api.ts` 와 같다.
 */
import { ApiError } from "@/features/auth/api";
import type {
  ConvertComplaintInput,
  CreateQuoteInput,
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
} from "./schema";
import type {
  AcceptQuoteResult,
  ConvertComplaintResult,
  CreateQuoteResult,
  CreateWorkOrderResult,
  ListWorkOrdersResult,
  UpdateWorkOrderResult,
} from "./types";

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
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

export function fetchWorkOrders(): Promise<ListWorkOrdersResult> {
  return requestJson<ListWorkOrdersResult>("/api/work-orders");
}

export function createWorkOrder(input: CreateWorkOrderInput): Promise<CreateWorkOrderResult> {
  return requestJson<CreateWorkOrderResult>("/api/work-orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** 완료·취소. 완료 응답에는 함께 닫힌 민원의 상태(`complaintStatus`)가 실려 온다(T5.3) */
export function updateWorkOrder(
  workOrderId: string,
  input: UpdateWorkOrderInput,
): Promise<UpdateWorkOrderResult> {
  return requestJson<UpdateWorkOrderResult>(`/api/work-orders/${workOrderId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** 민원 → 작업 의뢰 전환 (T2.6 스레드의 「작업 의뢰로 전환」 버튼) */
export function convertComplaintToWorkOrder(
  complaintId: string,
  input: ConvertComplaintInput,
): Promise<ConvertComplaintResult> {
  return requestJson<ConvertComplaintResult>(`/api/complaints/${complaintId}/convert`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** 마스터의 견적 제안 — 의뢰당 1회(두 번째는 409) (T5.3) */
export function submitQuote(
  workOrderId: string,
  input: CreateQuoteInput,
): Promise<CreateQuoteResult> {
  return requestJson<CreateQuoteResult>(`/api/work-orders/${workOrderId}/quotes`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** 임대인의 견적 수락 — 나머지 자동 거절 + 의뢰 배정까지 한 트랜잭션이다 (T5.3) */
export function acceptQuote(quoteId: string): Promise<AcceptQuoteResult> {
  return requestJson<AcceptQuoteResult>(`/api/quotes/${quoteId}/accept`, { method: "POST" });
}
