"use client";

/**
 * 근무지 Tanstack Query 훅 (T3.4).
 * 첫 데이터는 서버 컴포넌트가 `initialData` 로 넘긴다(`queries.ts` 와 같은 함수).
 * **T3.5(통근시간)** 도 `workplaceKeys.list` 를 그대로 읽으면 된다.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createWorkplace, deleteWorkplace, fetchWorkplaces, updateWorkplace } from "./api";
import type { CreateWorkplaceInput, UpdateWorkplaceInput } from "./schema";
import type { WorkplaceDto } from "./types";

export const workplaceKeys = {
  list: ["workplaces"] as const,
};

export function useWorkplaces(initialData?: WorkplaceDto[]) {
  return useQuery({
    queryKey: workplaceKeys.list,
    queryFn: fetchWorkplaces,
    initialData,
  });
}

function useWorkplaceInvalidation() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: workplaceKeys.list });
}

export function useCreateWorkplace() {
  const invalidate = useWorkplaceInvalidation();
  return useMutation({
    mutationFn: (input: CreateWorkplaceInput) => createWorkplace(input),
    onSuccess: invalidate,
  });
}

export function useUpdateWorkplace() {
  const invalidate = useWorkplaceInvalidation();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWorkplaceInput }) =>
      updateWorkplace(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteWorkplace() {
  const invalidate = useWorkplaceInvalidation();
  return useMutation({ mutationFn: (id: string) => deleteWorkplace(id), onSuccess: invalidate });
}
