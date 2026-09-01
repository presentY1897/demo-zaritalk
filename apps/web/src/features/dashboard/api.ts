/**
 * 대시보드 API 호출부 (T1.9).
 * 에러는 D1 규약대로 `{ error: { code, message } }` 한 형태라 `ApiError`(T0.4)로 바꿔 던진다.
 */
import { ApiError } from "@/features/auth/api";
import type { LandlordSummaryDto } from "./types";

export async function fetchLandlordSummary(): Promise<LandlordSummaryDto> {
  const response = await fetch("/api/landlord/summary", {
    headers: { "content-type": "application/json" },
  });
  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? "대시보드를 불러오지 못했습니다.",
      error?.details,
    );
  }
  return (body as { summary: LandlordSummaryDto }).summary;
}
