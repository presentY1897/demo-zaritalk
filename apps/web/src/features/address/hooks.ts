"use client";

/**
 * 주소 검색 훅 (T3.1·T3.4).
 *
 * **입력마다 자동으로 부르지 않는다.** 「검색」 버튼·Enter 로만 호출한다 —
 * 외부 API 호출 수를 사용자가 통제하게 하고, E2E 도 "쳤는데 아직 안 떴다" 같은
 * 타이밍 싸움을 하지 않게 된다. 같은 검색어는 Tanstack Query 캐시로 재사용한다.
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { searchAddresses } from "./api";

export const addressKeys = {
  search: (query: string, size: number) => ["address", "search", query, size] as const,
};

export function useAddressSearch(size = 8) {
  /** 실제로 서버에 물어본 검색어. 입력값(`term`)과 분리해 둔다 */
  const [submitted, setSubmitted] = useState("");

  const query = useQuery({
    queryKey: addressKeys.search(submitted, size),
    queryFn: () => searchAddresses(submitted, size),
    enabled: submitted.trim().length >= 2,
    // 주소는 잘 바뀌지 않는다 — 한 폼 안에서 같은 검색어를 다시 치면 캐시를 쓴다
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    submitted,
    search: (term: string) => setSubmitted(term.trim()),
    reset: () => setSubmitted(""),
    candidates: query.data?.candidates ?? [],
    isPending: query.isFetching,
    error: query.error,
    /** 검색은 했는데 후보가 0건 */
    isEmpty: Boolean(query.data) && (query.data?.candidates.length ?? 0) === 0,
  };
}
