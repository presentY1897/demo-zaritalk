/**
 * 통근시간 테스트 픽스처 (T3.5) — **테스트에서만 import 한다**.
 *
 * 카카오모빌리티 응답은 **실호출로 받아 온 것을 그대로** 옮겼다(행당해피빌 → 강남역,
 * `summary=true`). 테스트가 이 모양을 기준으로 파싱을 검증하므로, 스펙이 바뀌면
 * 여기 픽스처부터 실호출로 다시 받아 갱신할 것.
 */

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** 정상 응답 — `summary=true` 라 `sections` 에는 거리·시간만 남는다(vertexes 가 없다) */
export const DIRECTIONS_OK = {
  trans_id: "01a0659e2ff07bb5991a21c71fd350cc",
  routes: [
    {
      result_code: 0,
      result_msg: "길찾기 성공",
      summary: {
        origin: { name: "", x: 127.03647655523983, y: 37.561519815080594 },
        destination: { name: "", x: 127.02761344394422, y: 37.4979321028153 },
        waypoints: [],
        priority: "RECOMMEND",
        fare: { taxi: 13200, toll: 0 },
        distance: 8368,
        duration: 1679,
      },
      sections: [{ distance: 8368, duration: 1679 }],
    },
  ],
};

/** 경로를 못 찾은 응답 — **HTTP 는 200 이다**(`result_code` 로만 알 수 있다) */
export const DIRECTIONS_NO_ROUTE = {
  trans_id: "01a0659e0b0e75a3b518da7bb4b16d0e",
  routes: [
    {
      result_code: 104,
      result_msg: "출발지와 도착지가 5m 이내로 설정되었습니다.",
    },
  ],
};

/** 키가 거절됐을 때(401) 카카오가 주는 봉투 — 우리 D1 규약과 다르다 */
export const DIRECTIONS_UNAUTHORIZED_BODY = {
  code: -401,
  msg: "wrong appKey(bogus) format",
};
