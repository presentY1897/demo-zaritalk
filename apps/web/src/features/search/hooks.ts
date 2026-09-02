"use client";

/**
 * 매물 탐색 Tanstack Query 훅 (T3.2).
 *
 * ## 지도 이동이 곧 네트워크가 되지 않게 하는 장치
 *
 * 1. **쿼리 키가 곧 캐시다.** 키는 `formatBounds`(소수 4자리로 끊은 영역) + `filtersKey` 라
 *    미세한 이동은 **같은 키**가 되어 캐시에서 바로 나온다(요청 0건).
 * 2. `placeholderData: keepPreviousData` — 새 영역을 읽는 동안 이전 목록을 그대로 둔다.
 *    리스트가 비었다 다시 차는 깜빡임이 없다.
 * 3. `staleTime` 30초 — 왔다 갔다 하는 팬(pan)이 같은 영역을 다시 물어도 네트워크로 나가지 않는다.
 *
 * 그보다 앞단(카카오 `idle` 이벤트 + 350ms 디바운스 + 이미 받아 온 영역이면 아예 다시 묻지 않기)은
 * `MapSearchView` 와 `features/search/bounds.ts` 에 있다.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchListings, searchCacheKey, type FetchListingsInput } from "./api";
import type { ListingSearchResult } from "./types";

export const searchKeys = {
  all: ["listing-search"] as const,
  list: (key: string) => ["listing-search", key] as const,
};

export function useListingSearch(
  input: FetchListingsInput,
  options: { initialKey: string; initialData: ListingSearchResult },
) {
  const key = searchCacheKey(input);
  return useQuery({
    queryKey: searchKeys.list(key),
    queryFn: () => fetchListings(input),
    // 서버 컴포넌트가 그린 첫 화면과 **같은 키일 때만** 초기 데이터를 쓴다.
    // 키가 다른데 넣으면 다른 영역의 결과를 그 영역의 것으로 착각한다.
    initialData: key === options.initialKey ? options.initialData : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
