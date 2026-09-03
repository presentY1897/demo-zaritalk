/**
 * 제공자 한 벌 (T3.5) — **여기가 유일한 교체 지점**이다.
 *
 * ```ts
 * { car: kakaoCarProvider,      // 실연동 (카카오모빌리티)
 *   transit: mockTransitProvider } // 모의 (D9) → ODsay 키가 생기면 이 줄만 바꾼다
 * ```
 *
 * 서비스(`service.ts`)는 제공자를 **인자로 받는다** — 테스트가 실패하는 제공자를 끼워 넣어
 * 부분 결과·전체 실패 경로를 DB·네트워크 없이 검증한다. 라우트만 이 기본값을 쓴다.
 */
import { kakaoCarProvider } from "./kakao";
import type { CommuteProviderSet } from "./provider";
import { mockTransitProvider } from "./transit";

export function defaultCommuteProviders(): CommuteProviderSet {
  return { car: kakaoCarProvider, transit: mockTransitProvider };
}
