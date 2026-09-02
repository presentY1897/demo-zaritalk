"use client";

/**
 * 마스터 홈 Tanstack Query 훅 (T5.2).
 *
 * 두 탭(추천함·전체 피드)의 첫 데이터는 서버 컴포넌트가 `initialData` 로 넘긴다.
 * **플랜을 바꾸면 두 캐시를 모두 비운다** — 추천함이 채워지는 것이 이 토글의 목적이고,
 * 피드 상단의 플랜 배지도 같이 갱신돼야 한다.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateMasterPlanInput } from "@/features/workorder/schema";
import type { MasterFeedResult, MasterTargetsResult } from "@/features/workorder/types";
import { fetchMasterFeed, fetchMasterTargets, updateMasterPlan } from "./api";

export const masterKeys = {
  all: ["master"] as const,
  feed: () => ["master", "feed"] as const,
  targets: () => ["master", "targets"] as const,
};

export function useMasterFeed(initialData?: MasterFeedResult) {
  return useQuery({ queryKey: masterKeys.feed(), queryFn: fetchMasterFeed, initialData });
}

export function useMasterTargets(initialData?: MasterTargetsResult) {
  return useQuery({ queryKey: masterKeys.targets(), queryFn: fetchMasterTargets, initialData });
}

export function useUpdateMasterPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMasterPlanInput) => updateMasterPlan(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: masterKeys.all });
    },
  });
}
