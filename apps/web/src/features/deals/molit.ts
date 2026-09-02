/**
 * 국토교통부 아파트 실거래가 API 클라이언트 — **서버 전용** (T4.3).
 *
 * | 용도 | 엔드포인트 | 공식 문서 |
 * |---|---|---|
 * | 아파트 **전월세** | `…/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent` | [15126474](https://www.data.go.kr/data/15126474/openapi.do) |
 * | 아파트 **매매** | `…/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade` | [15126469](https://www.data.go.kr/data/15126469/openapi.do) |
 *
 * 파라미터는 `serviceKey`·`LAWD_CD`(시군구 5자리)·`DEAL_YMD`(YYYYMM)·`numOfRows`·`pageNo` 다.
 * **응답은 XML** 이라 `./xml.ts` 가 읽는다.
 *
 * ## ⚠️ 이중 인코딩 함정 — 실호출로 확인했다
 *
 * `DATA_GO_KR_API_KEY` 에는 포털의 **디코딩 키**(`+`·`/`·`=` 가 그대로 들어 있는 88자)를 넣는다.
 * `URLSearchParams`(= `url.searchParams.set`)가 조립하면서 **한 번만** 퍼센트 인코딩하므로
 * 그대로 통과한다. 포털이 함께 주는 *인코딩 키*(`%2B` 가 박힌 값)를 넣으면 여기서 한 번 더
 * 인코딩돼 `%252B` 가 되고 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(HTTP 403)가 난다.
 * **문자열로 URL 을 이어 붙이지도 말 것** — 그러면 반대로 인코딩이 아예 빠진다.
 *
 * ## 응답의 함정 (전부 실호출로 확인)
 *
 * - **잘못된 `LAWD_CD`·`DEAL_YMD` 도 HTTP 200 + `resultCode 000` + `<items/>`** 다.
 *   즉 API 가 파라미터를 검증해 주지 않는다 → 우리 zod 스키마(`./schema.ts`)가 먼저 막는다.
 * - 키 오류만 HTTP 401·403 + 다른 봉투(`<OpenAPI_ServiceResponse>`)로 온다.
 * - 금액은 만원 단위 + 콤마 문자열, 빈 값은 공백 한 칸이다 → `./parse.ts`.
 *
 * ## 실패는 던지지 않는다
 *
 * 한 (지역·월·엔드포인트) 조각이 실패해도 나머지는 계속 수집해야 하므로
 * `MolitResult` 로 접어서 돌려준다(T3.1 카카오 클라이언트와 같은 방식).
 */
import { normalizeDeals, type MolitEndpointKey, type NormalizedDeal } from "./parse";
import { parseMolitBody, parseMolitFault, type MolitXmlItem } from "./xml";

export const MOLIT_ENDPOINTS: Record<MolitEndpointKey, string> = {
  RENT: "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent",
  TRADE: "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade",
};

/** 한 페이지에 받아 올 행 수. 시군구 한 달 거래는 많아야 수백 건이라 대부분 1페이지에 끝난다 */
export const MOLIT_PAGE_SIZE = 500;
/** 한 (지역·월·엔드포인트)에서 읽을 최대 페이지 수 — 무한 루프 방지 */
export const MOLIT_MAX_PAGES = 10;
/** 외부 호출 타임아웃(ms) — 온디맨드 수집이 화면을 오래 붙잡지 않게 */
export const MOLIT_TIMEOUT_MS = 8_000;

export type MolitFailureReason =
  /** 서버에 `DATA_GO_KR_API_KEY` 가 없다 */
  | "NO_KEY"
  /** 키가 거절됐다(401·403 + `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 등) */
  | "UNAUTHORIZED"
  /** 쿼터 초과(429 · `LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR`) */
  | "RATE_LIMITED"
  /** 그 밖의 4xx·5xx, 또는 `resultCode` 가 `000` 이 아님 */
  | "UPSTREAM"
  /** XML 이 아니거나 봉투를 알아볼 수 없다 */
  | "MALFORMED"
  /** 네트워크 실패·타임아웃 */
  | "NETWORK";

export type MolitFailure = {
  reason: MolitFailureReason;
  status: number | null;
  /** 국토부가 준 원문 사유(있을 때만) — 로그·어드민 표에만 쓴다 */
  detail?: string;
};

export type MolitResult<T> = { ok: true; data: T } | { ok: false; failure: MolitFailure };

/** 서버 환경변수에서 디코딩 키를 읽는다. 비어 있으면 `null` */
export function getMolitServiceKey(): string | null {
  const key = process.env.DATA_GO_KR_API_KEY?.trim();
  return key ? key : null;
}

/**
 * 요청 URL 조립. **`URLSearchParams` 가 인코딩을 한 번만** 하도록 여기 한 곳에서만 만든다.
 * 테스트가 이 함수의 결과를 직접 확인한다(이중 인코딩 회귀 방지).
 */
export function buildMolitUrl(input: {
  endpoint: MolitEndpointKey;
  serviceKey: string;
  lawdCd: string;
  dealYm: string;
  numOfRows?: number;
  pageNo?: number;
}): URL {
  const url = new URL(MOLIT_ENDPOINTS[input.endpoint]);
  url.searchParams.set("serviceKey", input.serviceKey);
  url.searchParams.set("LAWD_CD", input.lawdCd);
  url.searchParams.set("DEAL_YMD", input.dealYm);
  url.searchParams.set("numOfRows", String(input.numOfRows ?? MOLIT_PAGE_SIZE));
  url.searchParams.set("pageNo", String(input.pageNo ?? 1));
  return url;
}

/** 국토부가 준 오류 문구 → 우리 사유. 문구는 공공데이터포털 공통 에러 코드다 */
function reasonFromErrMsg(errMsg: string, status: number | null): MolitFailureReason {
  const upper = errMsg.toUpperCase();
  if (upper.includes("SERVICE_KEY") || upper.includes("ACCESS_DENIED")) return "UNAUTHORIZED";
  if (upper.includes("LIMITED_NUMBER") || upper.includes("EXCEEDS")) return "RATE_LIMITED";
  if (status === 401 || status === 403) return "UNAUTHORIZED";
  if (status === 429) return "RATE_LIMITED";
  return "UPSTREAM";
}

export type MolitPage = {
  items: MolitXmlItem[];
  totalCount: number;
  pageNo: number;
  numOfRows: number;
};

/** 한 페이지 호출. 실패는 던지지 않고 `MolitFailure` 로 접는다 */
export async function fetchMolitPage(input: {
  endpoint: MolitEndpointKey;
  lawdCd: string;
  dealYm: string;
  pageNo?: number;
  numOfRows?: number;
  serviceKey?: string;
}): Promise<MolitResult<MolitPage>> {
  const serviceKey = input.serviceKey ?? getMolitServiceKey();
  if (!serviceKey) return { ok: false, failure: { reason: "NO_KEY", status: null } };

  const url = buildMolitUrl({ ...input, serviceKey });

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(MOLIT_TIMEOUT_MS),
      // 수집분은 우리 DB 가 캐시다 — Next 데이터 캐시를 한 겹 더 두면 멱등 판정이 흐려진다
      cache: "no-store",
    });
  } catch {
    return { ok: false, failure: { reason: "NETWORK", status: null } };
  }

  const text = await response.text().catch(() => "");

  const fault = parseMolitFault(text);
  if (fault) {
    return {
      ok: false,
      failure: {
        reason: reasonFromErrMsg(fault.errMsg, response.status),
        status: response.status,
        detail: fault.errMsg,
      },
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      failure: {
        reason: response.status === 429 ? "RATE_LIMITED" : "UPSTREAM",
        status: response.status,
      },
    };
  }

  const body = parseMolitBody(text);
  if (!body) return { ok: false, failure: { reason: "MALFORMED", status: response.status } };
  if (body.resultCode !== "000") {
    return {
      ok: false,
      failure: {
        reason: reasonFromErrMsg(body.resultMsg, response.status),
        status: response.status,
        detail: `${body.resultCode} ${body.resultMsg}`.trim(),
      },
    };
  }

  return {
    ok: true,
    data: {
      items: body.items,
      totalCount: body.totalCount,
      pageNo: body.pageNo || (input.pageNo ?? 1),
      numOfRows: body.numOfRows || (input.numOfRows ?? MOLIT_PAGE_SIZE),
    },
  };
}

export type MolitMonthFetch = {
  deals: NormalizedDeal[];
  discarded: number;
  /** 실제 호출 횟수(페이지 수) — 쿼터를 눈으로 볼 수 있게 결과에 싣는다 */
  requests: number;
  totalCount: number;
};

/**
 * 한 (지역·월·엔드포인트)를 **끝까지** 읽어 정규화한다.
 *
 * `totalCount` 를 넘어설 때까지 `pageNo` 를 올리되 `MOLIT_MAX_PAGES` 에서 멈춘다.
 * 중간 페이지가 실패하면 **거기까지 읽은 것을 실패로 돌린다** — 반쪽 데이터를 저장해
 * "수집했다" 고 표시하면 다음 실행이 나머지를 채우지 않기 때문이다(멱등이라 통째로 다시 읽으면 된다).
 */
export async function fetchMolitMonth(input: {
  endpoint: MolitEndpointKey;
  lawdCd: string;
  dealYm: string;
  serviceKey?: string;
}): Promise<MolitResult<MolitMonthFetch>> {
  const collected: MolitXmlItem[] = [];
  let requests = 0;
  let totalCount = 0;

  for (let pageNo = 1; pageNo <= MOLIT_MAX_PAGES; pageNo += 1) {
    const page = await fetchMolitPage({ ...input, pageNo });
    requests += 1;
    if (!page.ok) return page;

    totalCount = page.data.totalCount;
    collected.push(...page.data.items);

    if (page.data.items.length === 0) break;
    if (collected.length >= totalCount) break;
  }

  const { deals, discarded } = normalizeDeals(collected, {
    lawdCd: input.lawdCd,
    endpoint: input.endpoint,
  });
  return { ok: true, data: { deals, discarded, requests, totalCount } };
}

/** 실패 사유 → 사람이 읽는 한 줄. 어드민 표·응답 문구가 같은 문장을 쓴다 */
export const MOLIT_FAILURE_MESSAGE: Record<MolitFailureReason, string> = {
  NO_KEY: "DATA_GO_KR_API_KEY 가 설정되지 않았습니다.",
  UNAUTHORIZED: "국토부 API 키가 거절되었습니다(디코딩 키인지 확인하세요).",
  RATE_LIMITED: "국토부 API 일일 호출 한도를 넘었습니다.",
  UPSTREAM: "국토부 API 가 오류를 돌려주었습니다.",
  MALFORMED: "국토부 API 응답을 해석하지 못했습니다.",
  NETWORK: "국토부 API 에 연결하지 못했습니다.",
};
