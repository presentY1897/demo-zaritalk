"use client";

/**
 * 계약·수납 Tanstack Query 훅 (T1.2·T1.5).
 *
 * 서버 컴포넌트가 첫 데이터를 내려주고(`features/lease/queries.ts`) 클라이언트가 `initialData` 로
 * 같은 캐시에 얹는다. 납부를 추가·삭제하면 청구 목록과 **자산 화면(T1.1)** 캐시를 함께 무효화한다 —
 * 청구 상태가 바뀌면 호실 그리드의 연체 색도 달라지기 때문이다.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { landlordKeys } from "@/features/landlord/hooks";
import {
  createLease,
  createPayment,
  deletePayment,
  fetchCharges,
  fetchLease,
  updateLease,
  type CreateLeaseResult,
  type UpdateLeaseResult,
} from "./api";
import type { CreateLeaseInput, CreatePaymentInput, UpdateLeaseInput } from "./schema";
import type { ChargeDto, LeaseDetailDto } from "./types";

export const leaseKeys = {
  lease: (id: string) => ["lease", id] as const,
  charges: (leaseId: string) => ["lease", leaseId, "charges"] as const,
};

export function useLease(id: string, initialData?: LeaseDetailDto) {
  return useQuery({ queryKey: leaseKeys.lease(id), queryFn: () => fetchLease(id), initialData });
}

export function useCharges(leaseId: string, initialData?: ChargeDto[]) {
  return useQuery({
    queryKey: leaseKeys.charges(leaseId),
    queryFn: () => fetchCharges(leaseId),
    initialData,
  });
}

export function useCreateLease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLeaseInput) => createLease(input),
    onSuccess: async (result: CreateLeaseResult) => {
      // 호실 상태(공실 → 대기)가 바뀌므로 자산 화면 캐시도 함께 비운다
      await queryClient.invalidateQueries({ queryKey: landlordKeys.buildings });
      await queryClient.invalidateQueries({
        queryKey: landlordKeys.building(result.lease.unit.buildingId),
      });
      await queryClient.invalidateQueries({ queryKey: landlordKeys.unit(result.lease.unitId) });
    },
  });
}

export function useUpdateLease(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateLeaseInput) => updateLease(id, input),
    onSuccess: async (result: UpdateLeaseResult) => {
      queryClient.setQueryData(leaseKeys.lease(id), result.lease);
      await queryClient.invalidateQueries({ queryKey: leaseKeys.charges(id) });
      await queryClient.invalidateQueries({ queryKey: landlordKeys.buildings });
      await queryClient.invalidateQueries({
        queryKey: landlordKeys.building(result.lease.unit.buildingId),
      });
      await queryClient.invalidateQueries({ queryKey: landlordKeys.unit(result.lease.unitId) });
    },
  });
}

/**
 * 납부가 바뀌면 같이 비워야 하는 캐시의 범위.
 *
 * 청구 상태가 바뀌면 **호실 그리드의 연체 색**도 달라진다(`unit-status.ts` 는 OVERDUE 청구 유무를
 * 본다). 쿼리 기본 `staleTime` 이 30초라 그냥 두면 자산 화면이 한동안 옛 색을 그대로 보여 주므로,
 * 계약이 걸린 호실·건물 캐시까지 명시적으로 무효화한다.
 */
export type PaymentScope = { leaseId: string; unitId: string; buildingId: string };

async function invalidatePaymentScope(
  queryClient: ReturnType<typeof useQueryClient>,
  scope: PaymentScope,
) {
  await queryClient.invalidateQueries({ queryKey: leaseKeys.charges(scope.leaseId) });
  await queryClient.invalidateQueries({ queryKey: leaseKeys.lease(scope.leaseId) });
  await queryClient.invalidateQueries({ queryKey: landlordKeys.buildings });
  await queryClient.invalidateQueries({ queryKey: landlordKeys.building(scope.buildingId) });
  await queryClient.invalidateQueries({ queryKey: landlordKeys.unit(scope.unitId) });
}

/** 납부 추가 — 「받음 체크」·「가상 입금 시뮬레이션」이 같은 훅을 쓴다 */
export function useCreatePayment(scope: PaymentScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePaymentInput & { chargeId: string }) =>
      createPayment(input.chargeId, {
        amount: input.amount,
        method: input.method,
        memo: input.memo,
      }),
    onSuccess: () => invalidatePaymentScope(queryClient, scope),
  });
}

/** 오기록 취소 */
export function useDeletePayment(scope: PaymentScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) => deletePayment(paymentId),
    onSuccess: () => invalidatePaymentScope(queryClient, scope),
  });
}
