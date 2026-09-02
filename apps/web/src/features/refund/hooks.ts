"use client";

/**
 * 환급 계산 Tanstack Query 훅 (T2.3).
 *
 * 계산은 **저장하지 않는다**(task 정의). 그래서 쿼리 캐시를 무효화할 것도, 서버 컴포넌트가
 * 미리 내려줄 초기 데이터도 없다 — 입력 → 결과 한 번뿐이라 `useMutation` 하나면 충분하다.
 */
import { useMutation } from "@tanstack/react-query";
import { requestRefundCalculation } from "./api";
import type { RefundCalcRequest } from "./schema";

export function useRefundCalculation() {
  return useMutation({
    mutationFn: (input: RefundCalcRequest) => requestRefundCalculation(input),
  });
}
