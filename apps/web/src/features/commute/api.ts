/**
 * 통근시간 API 호출부 (T3.5). 에러는 D1 규약이라 `ApiError`(T0.4)로 바꿔 던진다.
 *
 * **Tanstack Query 훅을 두지 않았다.** 상세 시트는 근무지 행마다 따로 조회하는데
 * `useMutation` 은 한 번에 한 건의 상태만 들고 있어 행 5개를 표현할 수 없고
 * (훅을 반복문 안에서 부를 수도 없다), 결과는 서버 캐시가 아니라 **그 시트의 화면 상태**다.
 * 그래서 `ListingCommuteButton` 이 `useState` 로 직접 든다.
 */
import { ApiError } from "@/features/auth/api";
import type { CommuteLookupInput, CommuteLookupResponse } from "./types";

export async function lookupCommute(input: CommuteLookupInput): Promise<CommuteLookupResponse> {
  const response = await fetch("/api/commute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? "통근시간을 불러오지 못했습니다.",
      error?.details,
    );
  }
  return body as CommuteLookupResponse;
}
