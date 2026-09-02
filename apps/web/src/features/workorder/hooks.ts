"use client";

/**
 * 작업 의뢰 Tanstack Query 훅 (T5.1).
 *
 * 목록의 첫 데이터는 서버 컴포넌트가 `initialData` 로 넘긴다(`features/workorder/queries.ts` 와
 * 같은 함수라 API 응답과 모양이 같다). 생성·상태 변경은 목록의 정렬·배지를 바꾸므로
 * 성공하면 목록 캐시를 비운다 — T2.6 `features/complaint/hooks.ts` 와 같은 흐름이다.
 *
 * **상세는 쿼리로 두지 않는다** — 서버 컴포넌트가 내려준 값에서 시작해 상태 변경 응답에
 * 실려 온 갱신본으로 갈아 끼우면 충분하다.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptQuote,
  convertComplaintToWorkOrder,
  createWorkOrder,
  fetchWorkOrders,
  submitQuote,
  updateWorkOrder,
} from "./api";
import type {
  ConvertComplaintInput,
  CreateQuoteInput,
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
} from "./schema";
import type { ListWorkOrdersResult } from "./types";

export const workOrderKeys = {
  all: ["work-orders"] as const,
  list: () => ["work-orders", "list"] as const,
};

/** 견적 캐시 키 (T5.3) — 제안·수락이 양쪽 화면의 목록을 함께 흔든다 */
export const quoteKeys = {
  all: ["quotes"] as const,
};

export function useWorkOrders(initialData?: ListWorkOrdersResult) {
  return useQuery({
    queryKey: workOrderKeys.list(),
    queryFn: fetchWorkOrders,
    initialData,
  });
}

/** 의뢰 등록 — 응답에 이번에 나간 추천 수(`dispatchedCount`)가 함께 온다 */
export function useCreateWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkOrderInput) => createWorkOrder(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workOrderKeys.all });
    },
  });
}

/** 완료·취소 */
export function useUpdateWorkOrder(workOrderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateWorkOrderInput) => updateWorkOrder(workOrderId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workOrderKeys.all });
    },
  });
}

/** 민원 → 작업 의뢰 전환 (T2.6 스레드에서 부른다) */
export function useConvertComplaint(complaintId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConvertComplaintInput) =>
      convertComplaintToWorkOrder(complaintId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workOrderKeys.all });
    },
  });
}

/** 견적 제안(마스터) — 성공하면 「내 견적」 목록도 다시 읽는다 (T5.3) */
export function useSubmitQuote(workOrderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuoteInput) => submitQuote(workOrderId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: quoteKeys.all });
    },
  });
}

/**
 * 견적 수락(임대인) — 응답에 **갱신된 견적 전부**가 실려 오므로 화면은 그대로 갈아 끼운다.
 * 의뢰 목록의 상태 배지도 바뀌므로 목록 캐시를 비운다.
 */
export function useAcceptQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (quoteId: string) => acceptQuote(quoteId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workOrderKeys.all });
      await queryClient.invalidateQueries({ queryKey: quoteKeys.all });
    },
  });
}
