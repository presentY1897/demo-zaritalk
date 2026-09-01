"use client";

/**
 * 대시보드 Tanstack Query 훅 (T1.9).
 *
 * 첫 데이터는 서버 컴포넌트(`/landlord/page.tsx`)가 `initialData` 로 넘겨준다 —
 * 같은 함수(`features/dashboard/queries.ts`)로 만든 값이라 API 응답과 모양이 같다.
 *
 * **뒤 task 안내** — 수납·계약이 바뀌면 `dashboardKeys.landlordSummary` 를 무효화하면
 * 홈 숫자가 갱신된다(T1.5 가 납부를 기록한 뒤, T1.2 가 계약을 등록·종료한 뒤).
 */
import { useQuery } from "@tanstack/react-query";
import { fetchLandlordSummary } from "./api";
import type { LandlordSummaryDto } from "./types";

export const dashboardKeys = {
  landlordSummary: ["dashboard", "landlord", "summary"] as const,
};

export function useLandlordSummary(initialData?: LandlordSummaryDto) {
  return useQuery({
    queryKey: dashboardKeys.landlordSummary,
    queryFn: fetchLandlordSummary,
    initialData,
  });
}
