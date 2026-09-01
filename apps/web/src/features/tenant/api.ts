/**
 * 세입자 API 호출부 (T1.3).
 * 에러는 D1 규약대로 `{ error: { code, message } }` 한 형태라 `ApiError`(T0.4)로 바꿔 던진다.
 * 래퍼 모양은 T1.2 `features/lease/api.ts` 와 같다.
 */
import { ApiError } from "@/features/auth/api";
import type { AcceptLeaseResult, DeclineLeaseResult, PendingLeaseDto } from "./types";

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

export function fetchPendingLeases(): Promise<PendingLeaseDto[]> {
  return requestJson<{ leases: PendingLeaseDto[] }>("/api/tenant/pending-leases").then(
    (body) => body.leases,
  );
}

export function acceptLease(leaseId: string): Promise<AcceptLeaseResult> {
  return requestJson<AcceptLeaseResult>(`/api/leases/${leaseId}/accept`, { method: "POST" });
}

export function declineLease(leaseId: string): Promise<DeclineLeaseResult> {
  return requestJson<DeclineLeaseResult>(`/api/leases/${leaseId}/decline`, { method: "POST" });
}
