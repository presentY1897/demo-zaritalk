/**
 * 카카오모빌리티 **자동차 길찾기** 제공자 — 서버 전용 (T3.5).
 *
 * [공식 문서](https://developers.kakaomobility.com/guide/navi-api/directions) ·
 * 아래 내용은 전부 **실호출로 확인**했다.
 *
 * ```
 * GET https://apis-navi.kakaomobility.com/v1/directions
 *     ?origin=127.03648,37.56152&destination=127.02762,37.49794&priority=RECOMMEND&summary=true
 * Authorization: KakaoAK <REST 키>
 * ```
 *
 * ## 함정 세 가지
 *
 * 1. **좌표는 `경도,위도`(x,y) 순서다.** 우리 DB·DTO 는 전부 `lat, lng` 순이라 여기서만 뒤집는다.
 *    바꿔 넣으면 400 이 아니라 **엉뚱한 좌표로 200** 이 온다(위도 127 은 없지만 카카오는
 *    조용히 경로 없음으로 떨어진다) — 조용한 오답이라 이 파일 한 곳에서만 조립한다.
 * 2. **`summary=true` 를 반드시 붙인다.** 없으면 `sections[].roads[].vertexes` 에 경로 좌표가
 *    통째로 실려 온다(같은 요청이 521B → 수백 KB). 우리가 쓰는 값은 `summary.distance`·
 *    `summary.duration` 뿐이다.
 * 3. **경로를 못 찾아도 HTTP 200 이다.** 실패는 `routes[0].result_code` 로 온다
 *    (`0` = 길찾기 성공, `1` = 결과 없음, `104` = 출발지-도착지 5m 이내 …). status 만 보면
 *    "성공했는데 값이 없는" 상태가 된다.
 *
 * ## 실패는 던지지 않는다
 *
 * 대중교통이 성공했으면 자동차가 실패해도 저장해야 한다(부분 결과). 그래서 모든 실패를
 * `CommuteResult` 로 접는다 — T3.1 카카오 로컬 클라이언트·T4.3 국토부 클라이언트와 같은 방식이다.
 */
import type {
  CommuteFailure,
  CommuteLeg,
  CommutePoint,
  CommuteProvider,
  CommuteResult,
} from "./provider";

export const KAKAO_DIRECTIONS_URL = "https://apis-navi.kakaomobility.com/v1/directions";

/**
 * 외부 호출 타임아웃(ms). 사용자가 「조회」를 누르고 기다리는 시간이라 짧게 잡는다 —
 * 넘기면 자동차만 실패하고 대중교통 값은 그대로 저장된다.
 */
export const KAKAO_TIMEOUT_MS = 6_000;

type KakaoDirectionsResponse = {
  trans_id?: string;
  routes?: {
    result_code?: number;
    result_msg?: string;
    summary?: {
      distance?: number;
      duration?: number;
      fare?: { taxi?: number; toll?: number };
    };
  }[];
};

function apiKey(): string | null {
  const key = process.env.KAKAO_REST_API_KEY?.trim();
  return key ? key : null;
}

/** `경도,위도` — 카카오가 요구하는 순서. 소수 7자리면 cm 급이라 그 이상은 자른다 */
export function toKakaoCoord(point: CommutePoint): string {
  return `${point.lng.toFixed(7)},${point.lat.toFixed(7)}`;
}

/** 요청 URL 조립 — 좌표 순서를 여기 한 곳에서만 정한다(테스트가 이 함수를 직접 본다) */
export function buildKakaoDirectionsUrl(origin: CommutePoint, destination: CommutePoint): URL {
  const url = new URL(KAKAO_DIRECTIONS_URL);
  url.searchParams.set("origin", toKakaoCoord(origin));
  url.searchParams.set("destination", toKakaoCoord(destination));
  // RECOMMEND = 카카오내비 기본(실시간 교통 반영 추천 경로)
  url.searchParams.set("priority", "RECOMMEND");
  // 경로 좌표(vertexes)를 빼고 요약만 받는다 — 위 주석 2번
  url.searchParams.set("summary", "true");
  return url;
}

function failureFromStatus(status: number): CommuteFailure {
  if (status === 401 || status === 403) return { reason: "UNAUTHORIZED", status };
  if (status === 429) return { reason: "RATE_LIMITED", status };
  return { reason: "UPSTREAM", status };
}

/** 응답 → 결과. `result_code !== 0` 이면 경로 없음이다(HTTP 는 200) */
export function parseKakaoDirections(body: KakaoDirectionsResponse): CommuteResult {
  const route = body.routes?.[0];
  if (!route) return { ok: false, failure: { reason: "UPSTREAM", status: 200 } };

  if (route.result_code !== 0) {
    return {
      ok: false,
      failure: {
        reason: "NO_ROUTE",
        status: 200,
        detail: route.result_msg ?? `result_code=${route.result_code}`,
      },
    };
  }

  const duration = route.summary?.duration;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0) {
    return { ok: false, failure: { reason: "UPSTREAM", status: 200, detail: "duration 없음" } };
  }

  const distance = route.summary?.distance;
  const leg: CommuteLeg = {
    // 초 → 분. 0초짜리 경로도 "1분" 으로 보여 준다(0분은 화면에서 뜻이 없다)
    minutes: Math.max(1, Math.round(duration / 60)),
    distanceM: typeof distance === "number" && Number.isFinite(distance) ? distance : null,
    mock: false,
    detail: {
      provider: "kakao-mobility",
      mock: false,
      priority: "RECOMMEND",
      durationSec: duration,
      distanceM: typeof distance === "number" ? distance : null,
      taxiFare: route.summary?.fare?.taxi ?? null,
      tollFare: route.summary?.fare?.toll ?? null,
    },
  };
  return { ok: true, data: leg };
}

/** 자동차 — **실연동**. 키가 없으면 `NO_KEY` 로 조용히 실패한다(화면은 대중교통만 보여 준다) */
export const kakaoCarProvider: CommuteProvider = {
  mode: "car",
  mock: false,
  name: "kakao-mobility",

  async route(origin: CommutePoint, destination: CommutePoint): Promise<CommuteResult> {
    const key = apiKey();
    if (!key) return { ok: false, failure: { reason: "NO_KEY", status: null } };

    let response: Response;
    try {
      response = await fetch(buildKakaoDirectionsUrl(origin, destination), {
        headers: { Authorization: `KakaoAK ${key}` },
        signal: AbortSignal.timeout(KAKAO_TIMEOUT_MS),
        // 우리가 직접 `CommuteCache` 로 캐시한다 — Next 데이터 캐시를 겹쳐 두지 않는다
        cache: "no-store",
      });
    } catch {
      return { ok: false, failure: { reason: "NETWORK", status: null } };
    }

    if (!response.ok) return { ok: false, failure: failureFromStatus(response.status) };

    let body: KakaoDirectionsResponse;
    try {
      body = (await response.json()) as KakaoDirectionsResponse;
    } catch {
      return { ok: false, failure: { reason: "UPSTREAM", status: response.status } };
    }
    return parseKakaoDirections(body);
  },
};
