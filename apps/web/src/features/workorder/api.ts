/**
 * 작업 의뢰 API 호출부 (T5.1).
 * 에러는 D1 규약대로 `{ error: { code, message } }` 한 형태라 `ApiError`(T0.4)로 바꿔 던진다.
 * 래퍼 모양은 T2.6 `features/complaint/api.ts` 와 같다.
 */
import { ApiError } from "@/features/auth/api";
import type {
  ConvertComplaintInput,
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
} from "./schema";
import type {
  ConvertComplaintResult,
  CreateWorkOrderResult,
  LandlordWorkOrderDto,
  ListWorkOrdersResult,
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

export function updateWorkOrder(
  workOrderId: string,
  input: UpdateWorkOrderInput,
): Promise<LandlordWorkOrderDto> {
  return requestJson<{ workOrder: LandlordWorkOrderDto }>(`/api/work-orders/${workOrderId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }).then((body) => body.workOrder);
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
