/**
 * 실거래가 API 호출부 (T4.4).
 * 에러는 D1 규약대로 `{ error: { code, message } }` 한 형태라 `ApiError`(T0.4)로 바꿔 던진다.
 * 래퍼 모양은 T4.1 `features/community/api.ts` 와 같다.
 */
import { ApiError } from "@/features/auth/api";
import type { CreateAlertInput } from "./schema";
import type {
  DealListResult,
  RealDealTypeValue,
  TransactionAlertDeleteResult,
  TransactionAlertListResult,
  TransactionAlertResult,
} from "./types";

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

export type FetchDealsParams = {
  lawdCd: string;
  dealType: RealDealTypeValue;
  q?: string | null;
  apt?: string | null;
  cursor?: string | null;
  limit?: number;
};

export function fetchDeals(params: FetchDealsParams): Promise<DealListResult> {
  const query = new URLSearchParams({ lawdCd: params.lawdCd, type: params.dealType });
  if (params.q) query.set("q", params.q);
  if (params.apt) query.set("apt", params.apt);
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit) query.set("limit", String(params.limit));
  return requestJson<DealListResult>(`/api/deals?${query.toString()}`);
}

export function fetchAlerts(): Promise<TransactionAlertListResult> {
  return requestJson<TransactionAlertListResult>("/api/transaction-alerts");
}

export function createAlertRequest(input: CreateAlertInput): Promise<TransactionAlertResult> {
  return requestJson<TransactionAlertResult>("/api/transaction-alerts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteAlertRequest(alertId: string): Promise<TransactionAlertDeleteResult> {
  return requestJson<TransactionAlertDeleteResult>(
    `/api/transaction-alerts?id=${encodeURIComponent(alertId)}`,
    { method: "DELETE" },
  );
}
