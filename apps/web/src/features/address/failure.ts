/**
 * 카카오 실패 → D1 규약 응답 (T3.1·T3.4). 두 프록시 라우트가 같은 문구를 쓴다.
 *
 * `lib/api/response.ts` 의 `ApiErrorCode` 에는 502 자리가 없고 그 파일은 이번 task 소유가
 * 아니라(공용 규약) 새 코드를 만들지 않았다. 외부 장애는 전부 500 `INTERNAL_ERROR` 로 내려가고,
 * **원인은 응답 문구로만 구분**한다. 키 값은 어떤 경로로도 응답에 담기지 않는다.
 */
import { fail } from "@/lib/api/response";
import type { KakaoFailure } from "./kakao";

const MESSAGE: Record<KakaoFailure["reason"], string> = {
  NO_KEY: "주소 검색이 아직 설정되지 않았습니다. 잠시 후 다시 시도해 주세요.",
  UNAUTHORIZED: "주소 검색 인증에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  RATE_LIMITED: "주소 검색 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  UPSTREAM: "주소 검색 서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.",
  NETWORK: "주소 검색 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

export function failAddressLookup(failure: KakaoFailure): Response {
  return fail("INTERNAL_ERROR", MESSAGE[failure.reason]);
}
