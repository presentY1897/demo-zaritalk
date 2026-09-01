"use client";

/**
 * 고지서 Tanstack Query 훅 (T1.7 · T1.8).
 * `QueryClientProvider` 는 `app/providers.tsx`(T0.7)에 이미 있다.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchLandlordMessages, fetchNoticeTarget, fetchPublicNotice, sendNotice } from "./api";
import type { NoticeCtaVariant } from "./cta";
import type { SendNoticeInput } from "./schema";
import type { MessageLogDto, NoticeTargetDto } from "./types";

export const noticeKeys = {
  /** 발송 시트가 읽는 계약 정보 */
  target: (leaseId: string) => ["notice", "target", leaseId] as const,
  /** 임대인 발송 이력 */
  messages: (leaseId?: string) => ["notice", "messages", leaseId ?? "all"] as const,
  /** 공개 고지서 열람(= openedAt 기록 + notice_view) */
  publicNotice: (token: string) => ["notice", "public", token] as const,
};

export function useNoticeTarget(leaseId: string | null, initialData?: NoticeTargetDto) {
  return useQuery({
    queryKey: noticeKeys.target(leaseId ?? ""),
    queryFn: () => fetchNoticeTarget(leaseId as string),
    enabled: Boolean(leaseId),
    initialData,
  });
}

export function useLandlordMessages(initialData?: MessageLogDto[], leaseId?: string) {
  return useQuery({
    queryKey: noticeKeys.messages(leaseId),
    queryFn: () => fetchLandlordMessages({ leaseId }),
    initialData,
  });
}

export function useSendNotice(leaseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SendNoticeInput) => sendNotice(leaseId, input),
    onSuccess: async () => {
      // 이력 목록과 대상 계약(청구 상태가 바뀌지는 않지만 최신 이력이 붙는다)을 다시 읽는다
      await queryClient.invalidateQueries({ queryKey: ["notice", "messages"] });
      await queryClient.invalidateQueries({ queryKey: noticeKeys.target(leaseId) });
    },
  });
}

/**
 * 공개 고지서 열람 신호. 페이지가 마운트되면 한 번 호출된다.
 *
 * `useQuery` 를 쓰는 이유는 **중복 호출 방지**다 — React StrictMode 의 이중 effect 나
 * 리렌더에도 같은 queryKey 로 한 번만 나간다(`staleTime: Infinity`).
 */
export function useNoticeOpen(token: string, variant?: NoticeCtaVariant) {
  return useQuery({
    queryKey: noticeKeys.publicNotice(token),
    queryFn: () => fetchPublicNotice(token, variant),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });
}
