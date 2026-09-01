/**
 * 임대장부 API 호출부 (T1.6).
 * 에러는 D1 규약(`{ error: { code, message } }`)이라 `ApiError`(T0.4)로 바꿔 던진다.
 */
import { ApiError } from "@/features/auth/api";
import type { LedgerQuery, LedgerYearDto } from "./types";

/** `?year=2026&buildingId=…` — 건물 필터가 없으면 파라미터 자체를 빼서 "전체"임을 분명히 한다 */
export function ledgerSearchParams(query: LedgerQuery): string {
  const params = new URLSearchParams({ year: String(query.year) });
  if (query.buildingId) params.set("buildingId", query.buildingId);
  return params.toString();
}

export async function fetchLedger(query: LedgerQuery): Promise<LedgerYearDto> {
  const response = await fetch(`/api/landlord/ledger?${ledgerSearchParams(query)}`, {
    headers: { "content-type": "application/json" },
  });
  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? "장부를 불러오지 못했습니다.",
      error?.details,
    );
  }
  return body as LedgerYearDto;
}
