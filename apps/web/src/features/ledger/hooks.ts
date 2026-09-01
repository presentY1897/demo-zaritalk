"use client";

/**
 * 임대장부 Tanstack Query 훅 (T1.6).
 *
 * 첫 데이터는 서버 컴포넌트(page.tsx)가 `getLedgerYear` 로 읽어 내려주고,
 * 연도·건물 필터를 바꾸면 같은 모양의 API 응답을 다시 읽는다.
 * `initialData` 는 **초기 조건과 일치할 때만** 넣는다 — 다른 연도 키에 붙이면
 * 2026년 데이터가 2025년 화면에 그대로 남는다.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchLedger } from "./api";
import type { LedgerQuery, LedgerYearDto } from "./types";

export const ledgerKeys = {
  all: ["landlord", "ledger"] as const,
  year: (year: number, buildingId: string | null) =>
    ["landlord", "ledger", year, buildingId] as const,
};

export function useLedger(query: LedgerQuery, initialData?: LedgerYearDto) {
  const buildingId = query.buildingId ?? null;
  const matchesInitial =
    initialData !== undefined &&
    initialData.year === query.year &&
    initialData.buildingId === buildingId;

  return useQuery({
    queryKey: ledgerKeys.year(query.year, buildingId),
    queryFn: () => fetchLedger({ year: query.year, buildingId }),
    initialData: matchesInitial ? initialData : undefined,
    // 연도를 넘길 때 화면이 빈 상태로 깜빡이지 않게 직전 결과를 그대로 둔다
    placeholderData: (previous) => previous,
  });
}
