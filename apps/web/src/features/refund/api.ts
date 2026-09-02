/**
 * 환급 계산 API 호출부 (T2.3).
 *
 * 에러는 D1 규약대로 `{ error: { code, message } }` 한 형태라 `ApiError`(T0.4)로 바꿔 던진다 —
 * 래퍼 모양은 `features/lease/api.ts`(T1.2)와 같다. **비로그인도 부르는 엔드포인트**라
 * 세션 헤더를 따로 붙이지 않는다.
 */
import { ApiError } from "@/features/auth/api";
import type { RefundCalcResult } from "./calc";
import type { RefundDocumentSlot } from "./documents";
import type {
  CreateRefundApplicationInput,
  RefundCalcRequest,
  UpdateRefundApplicationInput,
} from "./schema";
import type { RefundApplicationDto, RefundListResult, RefundUploadResult } from "./types";

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

// ─────────────────────────────────────────────────────────────────────────────
// T2.4 환급 신청 — 목록·생성·수정·제출·업로드
//
// 계산(`requestRefundCalculation`)과 달리 **로그인 상태에서만** 부른다. 에러 규약은 같다.
// ─────────────────────────────────────────────────────────────────────────────

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
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

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export function fetchMyRefunds(): Promise<RefundListResult> {
  return requestJson<RefundListResult>("/api/refunds");
}

export function createRefundApplication(
  input: CreateRefundApplicationInput,
): Promise<RefundApplicationDto> {
  return requestJson<{ application: RefundApplicationDto }>(
    "/api/refunds",
    jsonInit("POST", input),
  ).then((body) => body.application);
}

export function updateRefundApplication(
  id: string,
  input: UpdateRefundApplicationInput,
): Promise<RefundApplicationDto> {
  return requestJson<{ application: RefundApplicationDto }>(
    `/api/refunds/${id}`,
    jsonInit("PATCH", input),
  ).then((body) => body.application);
}

export function submitRefundApplication(id: string): Promise<RefundApplicationDto> {
  return requestJson<{ application: RefundApplicationDto }>(`/api/refunds/${id}/submit`, {
    method: "POST",
  }).then((body) => body.application);
}

/** 서류 업로드 — `multipart/form-data` 라 `content-type` 을 **직접 정하지 않는다**(경계 문자열이 필요하다) */
export function uploadRefundDocument(input: {
  applicationId: string;
  slot: RefundDocumentSlot;
  file: File;
}): Promise<RefundUploadResult> {
  const form = new FormData();
  form.set("applicationId", input.applicationId);
  form.set("slot", input.slot);
  form.set("file", input.file);
  return requestJson<RefundUploadResult>("/api/uploads", { method: "POST", body: form });
}
