"use client";

/**
 * 민원 Tanstack Query 훅 (T2.6).
 *
 * 목록의 첫 데이터는 서버 컴포넌트가 `initialData` 로 넘긴다(`features/complaint/queries.ts` 와
 * 같은 함수라 API 응답과 모양이 같다). 접수·답장·상태 변경은 목록의 배지·정렬을 바꾸므로
 * 성공하면 목록 캐시를 비운다.
 *
 * **스레드 상세는 쿼리로 두지 않는다** — 서버 컴포넌트가 내려준 값에서 시작해
 * 답장·상태 변경 **응답에 실려 온 갱신본**으로 갱신하면 충분하고(왕복이 한 번 준다),
 * 상세 전용 GET 엔드포인트를 만들 이유도 없어진다. 화면이 들고 있는 state 다.
 *
 * 임대인 홈(T1.9)의 미확인 민원 배지는 서버 컴포넌트가 그린 값이라 여기서 무효화할 수 없다 —
 * 상태를 바꾼 화면에서 `router.refresh()` 를 불러 다음 진입에 갱신되게 한다.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createComplaint,
  fetchComplaints,
  sendComplaintMessage,
  updateComplaintStatus,
} from "./api";
import type {
  CreateComplaintInput,
  CreateComplaintMessageInput,
  UpdateComplaintStatusInput,
} from "./schema";
import type { ComplaintParty, ComplaintSummaryDto } from "./types";

export const complaintKeys = {
  all: ["complaints"] as const,
  list: (role: ComplaintParty) => ["complaints", "list", role] as const,
};

export function useComplaints(role: ComplaintParty, initialData?: ComplaintSummaryDto[]) {
  return useQuery({
    queryKey: complaintKeys.list(role),
    queryFn: () => fetchComplaints(role),
    initialData,
  });
}

/** 접수 — 성공하면 내 민원 목록을 다시 읽는다 */
export function useCreateComplaint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateComplaintInput) => createComplaint(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: complaintKeys.all });
    },
  });
}

/** 스레드 답장 — 응답에 갱신된 상세가 실려 온다 */
export function useSendComplaintMessage(complaintId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateComplaintMessageInput) => sendComplaintMessage(complaintId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: complaintKeys.all });
    },
  });
}

/** 상태 변경(임대인 전용) — 응답에 갱신된 상세가 실려 온다 */
export function useUpdateComplaintStatus(complaintId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateComplaintStatusInput) => updateComplaintStatus(complaintId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: complaintKeys.all });
    },
  });
}
