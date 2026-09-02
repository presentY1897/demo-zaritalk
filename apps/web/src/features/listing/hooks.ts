"use client";

/**
 * 매물 Tanstack Query 훅 (T3.1).
 *
 * 매물이 바뀌면 호실 상세(T1.1)의 매물 카드와 건물 그리드도 달라 보여야 하므로
 * `landlordKeys` 를 함께 무효화한다. 화면 자체는 서버 컴포넌트가 그리므로
 * 성공 뒤 `router.refresh()` 로 다시 읽는다.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { landlordKeys } from "@/features/landlord/hooks";
import { createListing, deleteListing, updateListing } from "./api";
import type { CreateListingInput, UpdateListingInput } from "./schema";

export const listingKeys = {
  unit: (unitId: string) => ["listing", "unit", unitId] as const,
};

function useListingInvalidation(unitId: string) {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: listingKeys.unit(unitId) });
    await queryClient.invalidateQueries({ queryKey: landlordKeys.unit(unitId) });
    await queryClient.invalidateQueries({ queryKey: landlordKeys.buildings });
  };
}

export function useCreateListing(unitId: string) {
  const invalidate = useListingInvalidation(unitId);
  return useMutation({
    mutationFn: (input: CreateListingInput) => createListing(input),
    onSuccess: invalidate,
  });
}

export function useUpdateListing(unitId: string) {
  const invalidate = useListingInvalidation(unitId);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateListingInput }) =>
      updateListing(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteListing(unitId: string) {
  const invalidate = useListingInvalidation(unitId);
  return useMutation({ mutationFn: (id: string) => deleteListing(id), onSuccess: invalidate });
}
