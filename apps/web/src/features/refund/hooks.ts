"use client";

/**
 * 환급 계산 Tanstack Query 훅 (T2.3).
 *
 * 계산은 **저장하지 않는다**(task 정의). 그래서 쿼리 캐시를 무효화할 것도, 서버 컴포넌트가
 * 미리 내려줄 초기 데이터도 없다 — 입력 → 결과 한 번뿐이라 `useMutation` 하나면 충분하다.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRefundApplication,
  fetchMyRefunds,
  requestRefundCalculation,
  submitRefundApplication,
  updateRefundApplication,
  uploadRefundDocument,
} from "./api";
import type { RefundDocumentSlot } from "./documents";
import type { CreateRefundApplicationInput, RefundCalcRequest } from "./schema";
import type { RefundListResult } from "./types";

export function useRefundCalculation() {
  return useMutation({
    mutationFn: (input: RefundCalcRequest) => requestRefundCalculation(input),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// T2.4 환급 신청 훅
//
// 첫 데이터는 서버 컴포넌트가 `initialData` 로 넘긴다(`features/refund/queries.ts` 와 같은
// 함수라 API 응답과 모양이 같다). 저장·업로드·제출은 목록의 상태·서류를 바꾸므로 캐시를 비운다.
// ─────────────────────────────────────────────────────────────────────────────

export const refundKeys = {
  all: ["refunds"] as const,
  list: () => ["refunds", "list"] as const,
};

export function useMyRefunds(initialData?: RefundListResult) {
  return useQuery({
    queryKey: refundKeys.list(),
    queryFn: fetchMyRefunds,
    initialData,
  });
}

/** 임시저장 — id 가 있으면 수정, 없으면 생성. 화면은 한 버튼으로 둘 다 쓴다. */
export function useSaveRefundApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: CreateRefundApplicationInput }) =>
      id ? updateRefundApplication(id, input) : createRefundApplication(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: refundKeys.all });
    },
  });
}

export function useUploadRefundDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { applicationId: string; slot: RefundDocumentSlot; file: File }) =>
      uploadRefundDocument(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: refundKeys.all });
    },
  });
}

export function useSubmitRefundApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitRefundApplication(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: refundKeys.all });
    },
  });
}
