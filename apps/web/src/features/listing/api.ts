/**
 * 매물 API 호출부 (T3.1). 에러는 D1 규약이라 `ApiError`(T0.4)로 바꿔 던진다.
 * (`features/landlord/api.ts` 와 같은 최소 래퍼 — 그 파일의 `requestJson` 은 export 돼 있지 않다.)
 */
import { ApiError } from "@/features/auth/api";
import type { CreateListingInput, UpdateListingInput } from "./schema";
import type { ListingDto } from "./types";

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

export function createListing(input: CreateListingInput): Promise<ListingDto> {
  return requestJson<{ listing: ListingDto }>("/api/listings", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((body) => body.listing);
}

export function updateListing(id: string, input: UpdateListingInput): Promise<ListingDto> {
  return requestJson<{ listing: ListingDto }>(`/api/listings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }).then((body) => body.listing);
}

export function deleteListing(id: string): Promise<void> {
  return requestJson<void>(`/api/listings/${id}`, { method: "DELETE" });
}
