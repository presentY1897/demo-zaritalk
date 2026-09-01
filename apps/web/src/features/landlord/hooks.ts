"use client";

/**
 * 건물·호실 Tanstack Query 훅 (T1.1).
 * `QueryClientProvider` 는 `app/providers.tsx`(T0.7)에 이미 있다.
 *
 * 화면은 **서버 컴포넌트가 첫 데이터를 내려주고**(`features/landlord/queries.ts`),
 * 클라이언트는 그 값을 `initialData` 로 받아 같은 캐시에 얹는다 — 첫 화면에서 같은 데이터를
 * 두 번 받지 않으면서, 등록·수정 뒤에는 쿼리 무효화로 최신 상태를 다시 읽는다.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBuilding,
  createUnit,
  deleteBuilding,
  deleteUnit,
  fetchBuilding,
  fetchBuildings,
  fetchUnit,
  updateBuilding,
  updateUnit,
} from "./api";
import type {
  CreateBuildingInput,
  CreateUnitInput,
  UpdateBuildingInput,
  UpdateUnitInput,
} from "./schema";
import type { BuildingDetailDto, BuildingSummaryDto, UnitDetailDto } from "./types";

/** 캐시 키 — 뒤 task(T1.2 계약 등)도 이 키를 무효화하면 자산 화면이 갱신된다 */
export const landlordKeys = {
  buildings: ["landlord", "buildings"] as const,
  building: (id: string) => ["landlord", "building", id] as const,
  unit: (id: string) => ["landlord", "unit", id] as const,
};

export function useBuildings(initialData?: BuildingSummaryDto[]) {
  return useQuery({
    queryKey: landlordKeys.buildings,
    queryFn: fetchBuildings,
    initialData,
  });
}

export function useBuilding(id: string, initialData?: BuildingDetailDto) {
  return useQuery({
    queryKey: landlordKeys.building(id),
    queryFn: () => fetchBuilding(id),
    initialData,
  });
}

export function useUnit(id: string, initialData?: UnitDetailDto) {
  return useQuery({
    queryKey: landlordKeys.unit(id),
    queryFn: () => fetchUnit(id),
    initialData,
  });
}

export function useCreateBuilding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBuildingInput) => createBuilding(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: landlordKeys.buildings }),
  });
}

export function useUpdateBuilding(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBuildingInput) => updateBuilding(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: landlordKeys.buildings });
      await queryClient.invalidateQueries({ queryKey: landlordKeys.building(id) });
    },
  });
}

export function useDeleteBuilding(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteBuilding(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: landlordKeys.buildings }),
  });
}

export function useCreateUnit(buildingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUnitInput) => createUnit(buildingId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: landlordKeys.building(buildingId) });
      await queryClient.invalidateQueries({ queryKey: landlordKeys.buildings });
    },
  });
}

export function useUpdateUnit(unitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUnitInput) => updateUnit(unitId, input),
    onSuccess: async (unit: UnitDetailDto) => {
      queryClient.setQueryData(landlordKeys.unit(unitId), unit);
      await queryClient.invalidateQueries({ queryKey: landlordKeys.building(unit.buildingId) });
      await queryClient.invalidateQueries({ queryKey: landlordKeys.buildings });
    },
  });
}

export function useDeleteUnit(unitId: string, buildingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteUnit(unitId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: landlordKeys.building(buildingId) });
      await queryClient.invalidateQueries({ queryKey: landlordKeys.buildings });
    },
  });
}
