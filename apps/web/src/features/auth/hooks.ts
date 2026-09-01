"use client";

/**
 * 인증·프로필 Tanstack Query 훅 (T0.4).
 * QueryClientProvider 는 `app/providers.tsx` 에 이미 있다.
 *
 * 로그인·프로필 생성 응답은 `GET /api/me` 와 같은 모양이라
 * 성공 시 `["me"]` 캐시를 그대로 채워 넣는다(재조회 없이 화면 전환).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateProfileInput } from "@/features/profiles/schema";
import { createProfile, demoLogin, fetchMe, logout, requestOtp, verifyOtp } from "./api";
import type { DemoRoleValue, MeDto } from "./types";

/** `GET /api/me` 캐시 키 — 셸(T0.5)·트래킹(T0.7)도 이 키를 쓰면 캐시를 공유한다 */
export const ME_QUERY_KEY = ["me"] as const;

export function useMe(enabled = true) {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMe,
    enabled,
    // 401 은 "비로그인" 이라는 정상 상태다 — 재시도하지 않는다
    retry: false,
  });
}

export function useRequestOtp() {
  return useMutation({ mutationFn: requestOtp });
}

export function useVerifyOtp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: verifyOtp,
    onSuccess: (result) => {
      if (result.status !== "SESSION") return;
      const { status: _status, ...me } = result;
      queryClient.setQueryData(ME_QUERY_KEY, me satisfies MeDto);
    },
  });
}

export function useDemoLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: DemoRoleValue) => demoLogin(role),
    onSuccess: (me) => queryClient.setQueryData(ME_QUERY_KEY, me),
  });
}

export function useCreateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProfileInput) => createProfile(input),
    onSuccess: (result) => queryClient.setQueryData(ME_QUERY_KEY, result.me),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => queryClient.removeQueries({ queryKey: ME_QUERY_KEY }),
  });
}
