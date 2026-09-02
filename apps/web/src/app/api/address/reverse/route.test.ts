import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { COORD2ADDRESS_RESPONSE, jsonResponse } from "@/features/address/testing";
import { GET } from "./route";

/** 좌표 → 주소 프록시 (T3.2 가 쓸 자리). 외부 호출은 mock 한다. */
const TEST_KEY = "test-rest-key";
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
});

const get = (qs: string) => GET(new Request(`http://localhost/api/address/reverse?${qs}`));

test("좌표가 없거나 대한민국 범위 밖이면 400 — 외부 호출도 하지 않는다", async () => {
  expect((await get("")).status).toBe(400);
  expect((await get("lat=37.5")).status).toBe(400);
  expect((await get("lat=35.6812&lng=139.7671")).status).toBe(400);
  expect((await get("lat=abc&lng=127.0")).status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("좌표를 주소로 바꾼다 — x 에 경도, y 에 위도를 보낸다", async () => {
  fetchMock.mockResolvedValue(jsonResponse(COORD2ADDRESS_RESPONSE));

  const res = await get("lat=37.5582&lng=127.0275");
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body.address.address).toBe("서울 성동구 행당동 347");
  expect(body.address.roadAddress).toBe("서울 성동구 행당로 79");
  expect(body.address.lat).toBeCloseTo(37.5582, 4);

  const url = new URL(String(fetchMock.mock.calls[0]![0]));
  expect(url.searchParams.get("x")).toBe("127.0275");
  expect(url.searchParams.get("y")).toBe("37.5582");
});

test("주소가 걸리지 않는 좌표(바다 등)는 200 + address null", async () => {
  fetchMock.mockResolvedValue(jsonResponse({ meta: { total_count: 0 }, documents: [] }));

  const res = await get("lat=34.0&lng=126.0");
  expect(res.status).toBe(200);
  expect((await res.json()).address).toBeNull();
});

test("카카오 장애면 500 으로 접어 준다", async () => {
  fetchMock.mockResolvedValue(jsonResponse({ errorType: "InternalError" }, 500));
  expect((await get("lat=37.5582&lng=127.0275")).status).toBe(500);
});
