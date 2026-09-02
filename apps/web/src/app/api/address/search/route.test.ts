import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  ACCESS_DENIED_BODY,
  ADDRESS_RESPONSE,
  EMPTY_RESPONSE,
  jsonResponse,
  KEYWORD_RESPONSE,
} from "@/features/address/testing";
import { GET } from "./route";

/**
 * 주소 검색 프록시 (T3.1·T3.4).
 * **외부 호출(카카오)은 전부 mock 한다** — 테스트가 네트워크·쿼터에 얽매이지 않게.
 * 실호출 형태는 `features/address/testing.ts` 픽스처가 그대로 옮겨 놓았다.
 */
const TEST_KEY = "test-rest-key-should-never-leak";
const originalFetch = globalThis.fetch;
const originalKey = process.env.KAKAO_REST_API_KEY;

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

const get = (qs: string) => GET(new Request(`http://localhost/api/address/search?${qs}`));

/** 주소 검색·키워드 검색 순서대로 응답을 준다(라우트가 둘을 병렬로 부른다) */
function respondWith(address: unknown, keyword: unknown) {
  fetchMock.mockImplementation((input: URL | string) => {
    const url = String(input);
    if (url.includes("/search/address.json")) return Promise.resolve(jsonResponse(address));
    if (url.includes("/search/keyword.json")) return Promise.resolve(jsonResponse(keyword));
    throw new Error(`예상하지 못한 호출: ${url}`);
  });
}

test("검색어가 2자 미만이면 400 — 외부 호출도 하지 않는다", async () => {
  respondWith(ADDRESS_RESPONSE, KEYWORD_RESPONSE);

  const res = await get("query=행");
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  expect(fetchMock).not.toHaveBeenCalled();

  expect((await get("")).status).toBe(400);
  expect((await get(`query=${"가".repeat(51)}`)).status).toBe(400);
  expect((await get("query=행당로&size=99")).status).toBe(400);
});

test("주소 + 장소 결과를 한 목록으로 정규화한다 — 좌표는 숫자(x=경도, y=위도)", async () => {
  respondWith(ADDRESS_RESPONSE, KEYWORD_RESPONSE);

  const res = await get("query=행당로 79");
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body.candidates).toHaveLength(2);

  const [address, place] = body.candidates;
  expect(address.source).toBe("ADDRESS");
  expect(address.address).toBe("서울 성동구 행당동 347");
  expect(address.roadAddress).toBe("서울 성동구 행당로 79");
  expect(address.lat).toBeCloseTo(37.5582053, 5);
  expect(address.lng).toBeCloseTo(127.027507, 5);
  expect(typeof address.lat).toBe("number");

  expect(place.source).toBe("PLACE");
  expect(place.placeName).toBe("왕십리역 2호선");
  expect(place.category).toBe("지하철역");
  expect(place.roadAddress).toBe("서울 성동구 왕십리로 지하 300");

  expect(body.meta.total).toBe(200);
  expect(body.meta.isEnd).toBe(false);
});

test("카카오 REST 키는 요청 헤더로만 나가고 응답에는 어떤 형태로도 담기지 않는다", async () => {
  respondWith(ADDRESS_RESPONSE, KEYWORD_RESPONSE);

  const res = await get("query=행당로 79");
  const raw = await res.text();
  expect(raw).not.toContain(TEST_KEY);
  for (const [, value] of res.headers) expect(value).not.toContain(TEST_KEY);

  expect(fetchMock).toHaveBeenCalledTimes(2);
  for (const call of fetchMock.mock.calls) {
    const init = call[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(`KakaoAK ${TEST_KEY}`);
    // 키가 쿼리스트링으로 새지 않는지
    expect(String(call[0])).not.toContain(TEST_KEY);
  }
});

test("결과가 없으면 에러가 아니라 200 + 빈 배열", async () => {
  respondWith(EMPTY_RESPONSE, EMPTY_RESPONSE);

  const res = await get("query=존재하지않는주소");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.candidates).toEqual([]);
  expect(body.meta.total).toBe(0);
});

test("양쪽 다 실패하면 500 — 카카오 원문 오류를 그대로 흘리지 않는다", async () => {
  fetchMock.mockResolvedValue(jsonResponse(ACCESS_DENIED_BODY, 401));

  const res = await get("query=행당로 79");
  expect(res.status).toBe(500);

  const raw = await res.text();
  expect(raw).not.toContain("AccessDeniedError");
  expect(JSON.parse(raw).error.code).toBe("INTERNAL_ERROR");
});

test("한쪽만 실패하면 살아 있는 쪽 결과를 준다", async () => {
  fetchMock.mockImplementation((input: URL | string) => {
    const url = String(input);
    if (url.includes("/search/address.json")) return Promise.resolve(jsonResponse(ADDRESS_RESPONSE));
    return Promise.resolve(jsonResponse({ errorType: "InternalError" }, 500));
  });

  const res = await get("query=행당로 79");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.candidates).toHaveLength(1);
  expect(body.candidates[0].source).toBe("ADDRESS");
});

test("네트워크가 죽어도 500 으로 접어 준다(예외가 새어 나가지 않는다)", async () => {
  fetchMock.mockRejectedValue(new Error("network down"));

  const res = await get("query=행당로 79");
  expect(res.status).toBe(500);
  expect((await res.json()).error.message).toContain("주소 검색");
});

test("서버에 키가 없으면 외부를 부르지 않고 500 안내를 준다", async () => {
  delete process.env.KAKAO_REST_API_KEY;

  const res = await get("query=행당로 79");
  expect(res.status).toBe(500);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("한국 범위(위 33~39 / 경 124~132) 밖 좌표는 후보에서 걸러낸다", async () => {
  respondWith(
    {
      documents: [
        { address_name: "도쿄 어딘가", x: "139.7671", y: "35.6812", road_address: null },
        ADDRESS_RESPONSE.documents[0],
      ],
      meta: { is_end: true, total_count: 2 },
    },
    EMPTY_RESPONSE,
  );

  const body = await (await get("query=행당로 79")).json();
  expect(body.candidates).toHaveLength(1);
  expect(body.candidates[0].address).toBe("서울 성동구 행당동 347");
});

test("주소·장소에 같은 지점이 겹쳐 나오면 한 번만 담는다", async () => {
  const duplicated = {
    documents: [
      {
        address_name: "서울 성동구 행당동 347",
        road_address_name: "서울 성동구 행당로 79",
        place_name: "행당동 대림아파트",
        id: "111",
        x: "127.027507006183",
        y: "37.5582053468995",
      },
    ],
    meta: { is_end: true, total_count: 1 },
  };
  respondWith(ADDRESS_RESPONSE, duplicated);

  const body = await (await get("query=행당로 79")).json();
  expect(body.candidates).toHaveLength(1);
  expect(body.candidates[0].source).toBe("ADDRESS");
});
