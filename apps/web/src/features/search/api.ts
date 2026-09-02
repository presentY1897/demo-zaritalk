/**
 * 매물 탐색 API 호출부 (T3.2). 에러는 D1 규약이라 `ApiError`(T0.4)로 바꿔 던진다.
 * (`features/listing/api.ts` 와 같은 최소 래퍼 — 그쪽 `requestJson` 은 export 돼 있지 않다.)
 */
import { ApiError } from "@/features/auth/api";
import { formatBounds, type Bounds } from "./bounds";
import { filtersKey, filtersToParams, type SearchFilters } from "./filters";
import type { ListingSearchResult } from "./types";

export type FetchListingsInput = {
  bounds: Bounds | null;
  filters: SearchFilters;
  limit?: number;
  /** 통근 배지 기준 근무지 — T3.5 자리 */
  workplaceId?: string | null;
};

/** 요청 URL 을 만든다 — **값이 없는 파라미터는 넣지 않는다**(빈 값은 서버가 400 이다) */
export function listingsUrl(input: FetchListingsInput): string {
  const params = new URLSearchParams(filtersToParams(input.filters));
  if (input.bounds) params.set("bounds", formatBounds(input.bounds));
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.workplaceId) params.set("workplaceId", input.workplaceId);

  const query = params.toString();
  return query ? `/api/listings?${query}` : "/api/listings";
}

/**
 * Tanstack Query 캐시 키 문자열 — 영역·필터·근무지가 모두 들어간다.
 *
 * **서버 컴포넌트(`/search`)와 클라이언트 훅이 같은 함수를 쓴다.** 서버가 그린 첫 결과를
 * `initialData` 로 넘길 때 키가 어긋나면 다른 영역의 결과를 그 영역 것으로 착각한다.
 * (그래서 이 함수는 `"use client"` 인 `hooks.ts` 가 아니라 여기 있다 — 서버에서도 부를 수 있어야 한다.)
 */
export function searchCacheKey(input: FetchListingsInput): string {
  return [
    input.bounds ? formatBounds(input.bounds) : "all",
    filtersKey(input.filters),
    input.workplaceId ?? "",
  ].join("#");
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? "매물을 불러오지 못했습니다.",
      error?.details,
    );
  }
  return body as T;
}

export function fetchListings(input: FetchListingsInput): Promise<ListingSearchResult> {
  return requestJson<ListingSearchResult>(listingsUrl(input));
}
