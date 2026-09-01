"use client";

/**
 * 세입자 Tanstack Query 훅 (T1.3).
 *
 * 첫 데이터는 서버 컴포넌트가 `initialData` 로 넘긴다(`features/tenant/queries.ts` 와 같은 함수라
 * API 응답과 모양이 같다). 수락·거절은 계약 상태를 바꾸므로 대기 목록 캐시를 비운다.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { acceptLease, declineLease, fetchPendingLeases } from "./api";
import type { PendingLeaseDto } from "./types";

export const tenantKeys = {
  pendingLeases: ["tenant", "pending-leases"] as const,
};

export function usePendingLeases(initialData?: PendingLeaseDto[]) {
  return useQuery({
    queryKey: tenantKeys.pendingLeases,
    queryFn: fetchPendingLeases,
    initialData,
  });
}

/**
 * 수락·거절 뒤 대기 목록 캐시를 비운다.
 * 세입자 홈은 서버 컴포넌트가 그리므로 화면 쪽에서 `router.refresh()` 로 갱신한다.
 */
function useLeaseDecisionInvalidation() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: tenantKeys.pendingLeases });
  };
}

/** 수락 — 계약이 `PENDING_TENANT` → `ACTIVE` 로 넘어간다 */
export function useAcceptLease() {
  const invalidate = useLeaseDecisionInvalidation();
  return useMutation({ mutationFn: (leaseId: string) => acceptLease(leaseId), onSuccess: invalidate });
}

/** 거절 — 계약이 `CANCELLED` 로 정리된다 */
export function useDeclineLease() {
  const invalidate = useLeaseDecisionInvalidation();
  return useMutation({ mutationFn: (leaseId: string) => declineLease(leaseId), onSuccess: invalidate });
}
