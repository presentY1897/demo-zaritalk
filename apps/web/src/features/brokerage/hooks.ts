"use client";

/**
 * 중개 요청·수신함 Tanstack Query 훅 (T3.6·T3.7).
 *
 * 첫 데이터는 서버 컴포넌트가 `initialData` 로 넘긴다. 응답(수락·거절)은 임대인 쪽 현황과
 * 중개인 쪽 수신함을 **동시에** 바꾸므로 `brokerageKeys.all` 을 통째로 무효화한다.
 *
 * **미리보기는 호실별로 캐시한다** — 시트에서 호실을 바꿔 가며 인원을 비교할 때
 * 같은 호실을 다시 고르면 왕복이 없다. 발송 뒤에는 대상이 늘어날 수 있어 함께 무효화한다.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { landlordKeys } from "@/features/landlord/hooks";
import {
  createBrokerageRequest,
  fetchBrokeragePreview,
  fetchBrokerageRequests,
  fetchRealtorInbox,
  respondBrokerageTarget,
} from "./api";
import type {
  CreateBrokerageRequestInput,
  RespondBrokerageTargetInput,
} from "./schema";
import type { ListBrokerageRequestsResult, RealtorInboxResult } from "./types";

export const brokerageKeys = {
  all: ["brokerage"] as const,
  requests: () => ["brokerage", "requests"] as const,
  preview: (unitId: string) => ["brokerage", "preview", unitId] as const,
  inbox: () => ["brokerage", "inbox"] as const,
};

export function useBrokerageRequests(initialData?: ListBrokerageRequestsResult) {
  return useQuery({
    queryKey: brokerageKeys.requests(),
    queryFn: fetchBrokerageRequests,
    initialData,
  });
}

/** 발송 전 미리보기 — 호실을 고르지 않았으면 요청하지 않는다 */
export function useBrokeragePreview(unitId: string | null) {
  return useQuery({
    queryKey: brokerageKeys.preview(unitId ?? ""),
    queryFn: () => fetchBrokeragePreview(unitId as string),
    enabled: unitId !== null && unitId !== "",
  });
}

export function useCreateBrokerageRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBrokerageRequestInput) => createBrokerageRequest(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: brokerageKeys.all });
      // 호실 상세·자산 그리드에도 "중개 요청 중" 이 반영돼야 한다
      await queryClient.invalidateQueries({ queryKey: landlordKeys.buildings });
    },
  });
}

export function useRealtorInbox(initialData?: RealtorInboxResult) {
  return useQuery({
    queryKey: brokerageKeys.inbox(),
    queryFn: fetchRealtorInbox,
    initialData,
  });
}

export function useRespondBrokerageTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      targetId,
      input,
    }: {
      targetId: string;
      input: RespondBrokerageTargetInput;
    }) => respondBrokerageTarget(targetId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: brokerageKeys.all });
    },
  });
}
