import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  buildKakaoDirectionsUrl,
  KAKAO_DIRECTIONS_URL,
  kakaoCarProvider,
  parseKakaoDirections,
} from "./kakao";
import {
  DIRECTIONS_NO_ROUTE,
  DIRECTIONS_OK,
  DIRECTIONS_UNAUTHORIZED_BODY,
  jsonResponse,
} from "./testing";

/**
 * 카카오모빌리티 자동차 길찾기 (T3.5) — **외부 호출은 전부 mock 한다.**
 * 실호출 형태는 `testing.ts` 픽스처가 그대로 옮겨 놓았다.
 */

const TEST_KEY = "test-rest-key-should-never-leak";
const originalFetch = globalThis.fetch;
const originalKey = process.env.KAKAO_REST_API_KEY;

const HAENGDANG = { lat: 37.56152, lng: 127.03648 };
const GANGNAM = { lat: 37.49794, lng: 127.02762 };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.KAKAO_REST_API_KEY = TEST_KEY;
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.KAKAO_REST_API_KEY;
  else process.env.KAKAO_REST_API_KEY = originalKey;
  vi.restoreAllMocks();
});

test("좌표는 **경도,위도** 순서로 나간다 — 뒤집으면 조용한 오답이 된다", () => {
  const url = buildKakaoDirectionsUrl(HAENGDANG, GANGNAM);

  expect(url.origin + url.pathname).toBe(KAKAO_DIRECTIONS_URL);
  expect(url.searchParams.get("origin")).toBe("127.0364800,37.5615200");
  expect(url.searchParams.get("destination")).toBe("127.0276200,37.4979400");
  expect(url.searchParams.get("priority")).toBe("RECOMMEND");
  // 없으면 경로 좌표(vertexes)가 통째로 실려 온다 — 같은 요청이 521B → 수백 KB
  expect(url.searchParams.get("summary")).toBe("true");
});

test("정상 응답을 분으로 접는다 — 초 단위 duration 을 반올림한다", () => {
  const result = parseKakaoDirections(DIRECTIONS_OK);
  expect(result.ok).toBe(true);
  if (!result.ok) return;

  // 1679초 = 27.98분 → 28분
  expect(result.data.minutes).toBe(28);
  expect(result.data.distanceM).toBe(8368);
  expect(result.data.mock).toBe(false);
  expect(result.data.detail).toMatchObject({
    provider: "kakao-mobility",
    mock: false,
    durationSec: 1679,
    taxiFare: 13200,
    tollFare: 0,
  });
});

test("`result_code` 가 0 이 아니면 HTTP 200 이어도 실패다", () => {
  const result = parseKakaoDirections(DIRECTIONS_NO_ROUTE);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.failure.reason).toBe("NO_ROUTE");
  expect(result.failure.detail).toContain("5m");
});

test("경로는 있는데 duration 이 없으면 UPSTREAM 으로 접는다", () => {
  const broken = { routes: [{ result_code: 0, summary: { distance: 100 } }] };
  const result = parseKakaoDirections(broken);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.failure.reason).toBe("UPSTREAM");

  expect(parseKakaoDirections({ routes: [] }).ok).toBe(false);
  expect(parseKakaoDirections({}).ok).toBe(false);
});

test("키가 없으면 외부를 부르지 않고 NO_KEY 로 실패한다", async () => {
  delete process.env.KAKAO_REST_API_KEY;

  const result = await kakaoCarProvider.route(HAENGDANG, GANGNAM);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.failure.reason).toBe("NO_KEY");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("REST 키는 Authorization 헤더로만 나간다 — 쿼리스트링에 실리지 않는다", async () => {
  fetchMock.mockResolvedValue(jsonResponse(DIRECTIONS_OK));

  const result = await kakaoCarProvider.route(HAENGDANG, GANGNAM);
  expect(result.ok).toBe(true);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
  expect((init.headers as Record<string, string>).Authorization).toBe(`KakaoAK ${TEST_KEY}`);
  expect(String(url)).not.toContain(TEST_KEY);
  expect(init.cache).toBe("no-store");
});

test("HTTP 오류는 사유별로 갈린다 — 401·403 / 429 / 그 밖", async () => {
  const cases: [number, string][] = [
    [401, "UNAUTHORIZED"],
    [403, "UNAUTHORIZED"],
    [429, "RATE_LIMITED"],
    [500, "UPSTREAM"],
  ];

  for (const [status, reason] of cases) {
    fetchMock.mockResolvedValueOnce(jsonResponse(DIRECTIONS_UNAUTHORIZED_BODY, status));
    const result = await kakaoCarProvider.route(HAENGDANG, GANGNAM);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe(reason);
    expect(result.failure.status).toBe(status);
  }
});

test("네트워크 실패·타임아웃은 NETWORK 다 — 던지지 않는다", async () => {
  fetchMock.mockRejectedValue(new Error("timeout"));

  const result = await kakaoCarProvider.route(HAENGDANG, GANGNAM);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.failure.reason).toBe("NETWORK");
});

test("JSON 이 아닌 응답도 삼킨다", async () => {
  fetchMock.mockResolvedValue(new Response("<html>502</html>", { status: 200 }));

  const result = await kakaoCarProvider.route(HAENGDANG, GANGNAM);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.failure.reason).toBe("UPSTREAM");
});
