/**
 * 계약·수납 API 호출부 (T1.2·T1.5).
 * 에러는 D1 규약대로 `{ error: { code, message } }` 한 형태라 `ApiError`(T0.4)로 바꿔 던진다.
 * 래퍼 모양은 T1.1 `features/landlord/api.ts` 와 같다.
 */
import { ApiError } from "@/features/auth/api";
import type { CreateLeaseInput, CreatePaymentInput, UpdateLeaseInput } from "./schema";
import type { ChargeDto, LeaseDetailDto, LeaseEndSettlementDto } from "./types";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });

  if (response.status === 204) return undefined as T;

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

export function fetchLeases(query: { unitId?: string } = {}): Promise<LeaseDetailDto[]> {
  const search = query.unitId ? `?unitId=${encodeURIComponent(query.unitId)}` : "";
  return requestJson<{ leases: LeaseDetailDto[] }>(`/api/leases${search}`).then(
    (body) => body.leases,
  );
}

export function fetchLease(id: string): Promise<LeaseDetailDto> {
  return requestJson<{ lease: LeaseDetailDto }>(`/api/leases/${id}`).then((body) => body.lease);
}

export type CreateLeaseResult = { lease: LeaseDetailDto; charge: ChargeDto | null };

export function createLease(input: CreateLeaseInput): Promise<CreateLeaseResult> {
  return requestJson<CreateLeaseResult>("/api/leases", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type UpdateLeaseResult = { lease: LeaseDetailDto; settlement?: LeaseEndSettlementDto };

export function updateLease(id: string, input: UpdateLeaseInput): Promise<UpdateLeaseResult> {
  return requestJson<UpdateLeaseResult>(`/api/leases/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function fetchCharges(leaseId: string): Promise<ChargeDto[]> {
  return requestJson<{ charges: ChargeDto[] }>(`/api/leases/${leaseId}/charges`).then(
    (body) => body.charges,
  );
}

export function createPayment(chargeId: string, input: CreatePaymentInput): Promise<ChargeDto> {
  return requestJson<{ charge: ChargeDto }>(`/api/charges/${chargeId}/payments`, {
    method: "POST",
    body: JSON.stringify(input),
  }).then((body) => body.charge);
}

export function deletePayment(paymentId: string): Promise<ChargeDto> {
  return requestJson<{ charge: ChargeDto }>(`/api/payments/${paymentId}`, {
    method: "DELETE",
  }).then((body) => body.charge);
}
