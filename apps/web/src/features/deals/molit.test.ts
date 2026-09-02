/**
 * 국토부 API 클라이언트 (T4.3).
 *
 * 단위는 `fetch` 를 mock 해서 **요청이 문서대로 나가는지**(특히 ⚠️ 이중 인코딩)와
 * 실패 응답 매핑, 페이지네이션만 본다. 마지막 하나는 **실제 국토부 API 통합 테스트**로,
 * `DATA_GO_KR_API_KEY` 가 없으면 skip 한다(T2.1 토스 클라이언트와 같은 패턴).
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildMolitUrl,
  fetchMolitMonth,
  fetchMolitPage,
  getMolitServiceKey,
  MOLIT_ENDPOINTS,
} from "./molit";
import { mockMolitFetch, mockMolitNetworkError, readDealFixture } from "./testing";

const RENT = readDealFixture("rent-11200-202607");
const TRADE = readDealFixture("trade-11200-202607");
const EMPTY = readDealFixture("empty");
const FAULT = readDealFixture("fault-service-key");

/** 포털이 주는 **디코딩 키**는 `+`·`/`·`=` 가 섞인 base64 문자열이다 */
const DECODED_KEY = "abc+def/ghi=jkl";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("⚠️ 이중 인코딩 방지 — 요청 조립", () => {
  test("URLSearchParams 가 디코딩 키를 **한 번만** 인코딩한다", () => {
    const url = buildMolitUrl({
      endpoint: "RENT",
      serviceKey: DECODED_KEY,
      lawdCd: "11200",
      dealYm: "202607",
    });

    // 원본 값이 그대로 되살아난다 = 인코딩이 한 겹뿐이다
    expect(url.searchParams.get("serviceKey")).toBe(DECODED_KEY);
    // 쿼리 문자열에는 퍼센트 인코딩이 한 번만 들어간다(%2B 이지 %252B 가 아니다)
    expect(url.search).toContain("serviceKey=abc%2Bdef%2Fghi%3Djkl");
    expect(url.search).not.toContain("%252B");
  });

  test("이미 인코딩된 키를 넣으면 이중 인코딩된다 — 그래서 .env 에 디코딩 키를 넣는다", () => {
    const url = buildMolitUrl({
      endpoint: "RENT",
      serviceKey: "abc%2Bdef",
      lawdCd: "11200",
      dealYm: "202607",
    });
    // 이 상태가 되면 국토부는 SERVICE_KEY_IS_NOT_REGISTERED_ERROR 를 돌려준다
    expect(url.search).toContain("%252B");
  });

  test("파라미터 이름·기본값이 문서 그대로다", () => {
    const url = buildMolitUrl({
      endpoint: "TRADE",
      serviceKey: "k",
      lawdCd: "11680",
      dealYm: "202512",
    });
    expect(url.href.startsWith(MOLIT_ENDPOINTS.TRADE)).toBe(true);
    expect(url.searchParams.get("LAWD_CD")).toBe("11680");
    expect(url.searchParams.get("DEAL_YMD")).toBe("202512");
    expect(url.searchParams.get("pageNo")).toBe("1");
    expect(Number(url.searchParams.get("numOfRows"))).toBeGreaterThan(0);
  });
});

describe("키가 없으면 부르지 않는다", () => {
  test("NO_KEY — fetch 호출 0회", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", "");
    const calls = mockMolitFetch({ RENT: { xml: RENT } });
    const result = await fetchMolitPage({ endpoint: "RENT", lawdCd: "11200", dealYm: "202607" });
    expect(result).toMatchObject({ ok: false, failure: { reason: "NO_KEY" } });
    expect(calls).toHaveLength(0);
    expect(getMolitServiceKey()).toBeNull();
  });
});

describe("응답 매핑", () => {
  test("정상 — items·totalCount 를 그대로 싣는다", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", DECODED_KEY);
    mockMolitFetch({ RENT: { xml: RENT } });
    const result = await fetchMolitPage({ endpoint: "RENT", lawdCd: "11200", dealYm: "202607" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items.length).toBeGreaterThan(0);
    expect(result.data.totalCount).toBeGreaterThan(0);
  });

  test("키 오류 봉투(HTTP 403) → UNAUTHORIZED + 원문 사유", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", DECODED_KEY);
    mockMolitFetch({ RENT: { status: 403, xml: FAULT } });
    const result = await fetchMolitPage({ endpoint: "RENT", lawdCd: "11200", dealYm: "202607" });
    expect(result).toMatchObject({
      ok: false,
      failure: { reason: "UNAUTHORIZED", status: 403, detail: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" },
    });
  });

  test("resultCode 가 000 이 아니면 UPSTREAM", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", DECODED_KEY);
    mockMolitFetch({
      RENT: {
        xml: "<response><header><resultCode>99</resultCode><resultMsg>INTERNAL ERROR</resultMsg></header><body><items/></body></response>",
      },
    });
    const result = await fetchMolitPage({ endpoint: "RENT", lawdCd: "11200", dealYm: "202607" });
    expect(result).toMatchObject({ ok: false, failure: { reason: "UPSTREAM" } });
  });

  test("HTTP 429 → RATE_LIMITED", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", DECODED_KEY);
    mockMolitFetch({ RENT: { status: 429, xml: "" } });
    const result = await fetchMolitPage({ endpoint: "RENT", lawdCd: "11200", dealYm: "202607" });
    expect(result).toMatchObject({ ok: false, failure: { reason: "RATE_LIMITED", status: 429 } });
  });

  test("XML 이 아니면 MALFORMED", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", DECODED_KEY);
    mockMolitFetch({ RENT: { xml: "<html>502</html>" } });
    const result = await fetchMolitPage({ endpoint: "RENT", lawdCd: "11200", dealYm: "202607" });
    expect(result).toMatchObject({ ok: false, failure: { reason: "MALFORMED" } });
  });

  test("네트워크 오류 → NETWORK", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", DECODED_KEY);
    mockMolitNetworkError();
    const result = await fetchMolitPage({ endpoint: "RENT", lawdCd: "11200", dealYm: "202607" });
    expect(result).toMatchObject({ ok: false, failure: { reason: "NETWORK", status: null } });
  });
});

describe("한 달 전체 읽기", () => {
  test("정규화까지 마쳐서 돌려준다 — 매매는 SALE, 만원 단위", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", DECODED_KEY);
    const calls = mockMolitFetch({ TRADE: { xml: TRADE } });
    const result = await fetchMolitMonth({ endpoint: "TRADE", lawdCd: "11200", dealYm: "202607" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.deals[0]).toMatchObject({ dealType: "SALE", price: 249_000 });
    expect(result.data.requests).toBe(calls.length);
  });

  test("totalCount 에 닿을 때까지 페이지를 넘긴다", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", DECODED_KEY);
    // trade fixture 는 20건 / totalCount 101 이라 6페이지까지 읽고 멈춘다(20*6 >= 101)
    const calls = mockMolitFetch({ TRADE: { xml: TRADE } });
    const result = await fetchMolitMonth({ endpoint: "TRADE", lawdCd: "11200", dealYm: "202607" });
    expect(result.ok).toBe(true);
    expect(calls.length).toBe(6);
    expect(calls.map((call) => call.url.searchParams.get("pageNo"))).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
  });

  test("빈 응답이면 한 번만 부른다", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", DECODED_KEY);
    const calls = mockMolitFetch({ RENT: { xml: EMPTY } });
    const result = await fetchMolitMonth({ endpoint: "RENT", lawdCd: "11200", dealYm: "209901" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.deals).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  test("중간 페이지가 실패하면 반쪽 데이터를 돌려주지 않는다", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", DECODED_KEY);
    mockMolitFetch({ TRADE: [{ xml: TRADE }, { status: 500, xml: "" }] });
    const result = await fetchMolitMonth({ endpoint: "TRADE", lawdCd: "11200", dealYm: "202607" });
    expect(result).toMatchObject({ ok: false, failure: { reason: "UPSTREAM", status: 500 } });
  });
});

/**
 * 통합 — **실제 국토부 API 1회**. `DATA_GO_KR_API_KEY` 가 없으면 skip 한다.
 *
 * 확인하는 것: ① 엔드포인트가 살아 있고 ② **디코딩 키가 이중 인코딩 없이 통과**하며
 * ③ 응답이 우리 파서가 아는 모양(금액에 콤마, 만원 단위)이라는 것.
 * 데이터 내용은 시점에 따라 달라지므로 값 자체를 단정하지 않는다.
 */
describe("통합(실 API)", () => {
  const hasKey = Boolean(process.env.DATA_GO_KR_API_KEY?.trim());

  test.skipIf(!hasKey)("실제 전월세 호출 — 인증 통과 + 파싱 가능", async () => {
    const result = await fetchMolitMonth({
      endpoint: "RENT",
      lawdCd: "11200",
      dealYm: "202607",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.deals.length).toBeGreaterThan(0);

    const first = result.data.deals[0]!;
    expect(first.lawdCd).toBe("11200");
    expect(["JEONSE", "WOLSE"]).toContain(first.dealType);
    expect(first.aptName.length).toBeGreaterThan(0);
    expect(first.areaM2).toBeGreaterThan(0);
    // 만원 단위 — 서울 아파트 보증금이 원 단위였다면 억 단위 숫자가 나왔을 것이다
    expect(Number.isInteger(first.deposit)).toBe(true);
    expect(first.dealDate.toISOString()).toMatch(/^2026-07-\d{2}T00:00:00\.000Z$/);
  }, 30_000);
});
