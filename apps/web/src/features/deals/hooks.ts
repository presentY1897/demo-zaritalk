"use client";

/**
 * 실거래가 Tanstack Query 훅 (T4.4).
 *
 * **목록은 `useInfiniteQuery`** 다 — 서버가 준 `nextCursor` 를 그대로 다음 페이지 파라미터로 쓴다.
 * 첫 페이지는 서버 컴포넌트가 `initialData` 로 내려주므로 화면 진입에 네트워크 왕복이 없다.
 * 지역·유형·검색어·단지가 바뀌면 쿼리 키가 바뀌어 **커서가 자동으로 버려진다**
 * (다른 지역·탭의 커서를 보내면 서버가 400 이다 — `./cursor.ts` 참고).
 *
 * 구독 목록은 별도 쿼리다. 비로그인이면 401 이 나므로 **시트를 열 때만**(`enabled`) 읽는다 —
 * 화면 진입만으로 401 을 만들지 않는다.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAlertRequest,
  deleteAlertRequest,
  fetchAlerts,
  fetchDeals,
  type FetchDealsParams,
} from "./api";
import type { CreateAlertInput } from "./schema";
import type { DealListResult, RealDealTypeValue } from "./types";

export const dealKeys = {
  all: ["deals"] as const,
  list: (lawdCd: string, dealType: RealDealTypeValue, q: string, apt: string | null) =>
    ["deals", "list", lawdCd, dealType, q, apt ?? ""] as const,
  alerts: ["deals", "alerts"] as const,
};

export type UseDealListInput = Omit<FetchDealsParams, "cursor"> & {
  initialPage?: DealListResult;
};

export function useDealList({ initialPage, ...params }: UseDealListInput) {
  return useInfiniteQuery({
    queryKey: dealKeys.list(params.lawdCd, params.dealType, params.q ?? "", params.apt ?? null),
    queryFn: ({ pageParam }) => fetchDeals({ ...params, cursor: pageParam as string | null }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: DealListResult) => lastPage.nextCursor,
    initialData: initialPage
      ? { pages: [initialPage], pageParams: [null as string | null] }
      : undefined,
  });
}

export function useAlerts(enabled: boolean) {
  return useQuery({
    queryKey: dealKeys.alerts,
    queryFn: fetchAlerts,
    enabled,
    retry: false,
  });
}

export function useCreateAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAlertInput) => createAlertRequest(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dealKeys.alerts });
    },
  });
}

export function useDeleteAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => deleteAlertRequest(alertId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dealKeys.alerts });
    },
  });
}
