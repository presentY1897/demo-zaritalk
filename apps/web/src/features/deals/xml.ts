/**
 * 국토교통부 실거래가 응답 XML 파서 — **새 의존성 없이** 손으로 짠 스캐너 (T4.3).
 *
 * ## 왜 라이브러리를 쓰지 않았나
 *
 * `fast-xml-parser` 같은 것을 넣으면 `pnpm-lock.yaml` 이 바뀐다(이 task 소유가 아니다).
 * 그리고 실제 응답은 **한 겹짜리 평면 XML** 이다 — `response > body > items > item > <태그>값</태그>`
 * 가 전부이고 속성·네임스페이스·CDATA·중첩이 없다. 그 모양에 맞춘 스캐너면 30줄로 끝나고,
 * 실호출로 받아 둔 fixture(`./fixtures/*.xml`)가 그것을 지킨다.
 *
 * ## 두 가지 응답 봉투가 온다 (실호출로 확인)
 *
 * | 상황 | 루트 | 예 |
 * |---|---|---|
 * | 정상·빈 결과 | `<response>` | `<header><resultCode>000</resultCode>…<body><items>…` |
 * | 키 오류 | `<OpenAPI_ServiceResponse>` | `<cmmMsgHeader><errMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</errMsg>…` |
 *
 * 키 오류 봉투는 **HTTP 403·401 과 함께** 오고, `<header>` 가 아예 없다. 그래서 두 봉투를
 * 각각 읽는 함수를 두고 라우트·수집기가 사유를 구분할 수 있게 한다.
 *
 * ## 알아 둘 것
 *
 * - 결과가 없으면 `<items/>` **자기닫음 태그**로 온다(빈 `<items></items>` 가 아니다).
 * - 값이 비면 `<contractTerm> </contractTerm>` 처럼 **공백 한 칸**이 온다. `""` 가 아니다.
 * - 단지명에 `&` 가 들어가면 `&amp;` 로 이스케이프된다 — 엔티티를 되돌려야 한다.
 * - **잘못된 `LAWD_CD`·`DEAL_YMD` 도 200 + `resultCode 000` + 빈 items** 다. 즉 파라미터
 *   검증을 API 가 대신해 주지 않으므로 우리 zod 스키마가 먼저 막아야 한다(`./schema.ts`).
 *
 * `@zari/db` 를 import 하지 않는다 — 순수 문자열 처리라 DB 없이 테스트한다.
 */

/** `<item>` 하나를 태그명 → 값 으로 편 것. 값은 항상 문자열이다(빈 값은 `""`). */
export type MolitXmlItem = Record<string, string>;

/** 정상 봉투(`<response>`)를 읽은 결과 */
export type MolitXmlBody = {
  /** `"000"` 이 정상. 그 밖의 값은 상위(수집기)가 실패로 다룬다 */
  resultCode: string;
  resultMsg: string;
  /** 그 달·그 지역의 전체 건수 — 페이지를 더 읽을지 정하는 기준 */
  totalCount: number;
  numOfRows: number;
  pageNo: number;
  items: MolitXmlItem[];
};

/** 키 오류 봉투(`<OpenAPI_ServiceResponse>`) */
export type MolitXmlFault = {
  errMsg: string;
  returnAuthMsg: string | null;
  returnReasonCode: string | null;
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** `&amp;` · `&#39;` · `&#x27;` 을 되돌린다. 모르는 엔티티는 그대로 둔다. */
export function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * 루트 바로 아래의 단일 태그 값. 없으면 `null`.
 * `<items>` 안쪽까지 뒤지지 않게 **첫 번째 매치**만 본다(헤더가 body 보다 앞에 온다).
 */
export function readTag(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}\\s*>([\\s\\S]*?)</${tag}>`).exec(xml);
  if (!match) return null;
  return decodeXmlEntities(match[1] ?? "").trim();
}

/** `<item>…</item>` 블록 하나를 태그명 → 값 으로 편다. 자기닫음 태그는 `""` 이다. */
function parseItemBlock(block: string): MolitXmlItem {
  const item: MolitXmlItem = {};
  const field = /<([A-Za-z][A-Za-z0-9_]*)\s*(?:\/>|>([\s\S]*?)<\/\1>)/g;
  let match: RegExpExecArray | null;
  while ((match = field.exec(block)) !== null) {
    const name = match[1]!;
    const raw = match[2];
    // 값이 공백 한 칸으로 오는 필드가 흔하다 — 여기서 한 번에 trim 해 둔다
    item[name] = raw === undefined ? "" : decodeXmlEntities(raw).trim();
  }
  return item;
}

/** 응답 전체에서 `<item>` 을 모두 뽑는다. 결과가 없으면 빈 배열(`<items/>`). */
export function parseXmlItems(xml: string): MolitXmlItem[] {
  const items: MolitXmlItem[] = [];
  const block = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = block.exec(xml)) !== null) {
    items.push(parseItemBlock(match[1] ?? ""));
  }
  return items;
}

function readInt(xml: string, tag: string): number {
  const raw = readTag(xml, tag);
  if (raw === null) return 0;
  const value = Number.parseInt(raw.replaceAll(",", ""), 10);
  return Number.isFinite(value) ? value : 0;
}

/**
 * 키 오류 봉투인지 본다. 정상 응답이면 `null`.
 * HTTP status 로도 구분되지만(401·403), status 만 믿지 않고 본문으로 한 번 더 확인한다.
 */
export function parseMolitFault(xml: string): MolitXmlFault | null {
  if (!xml.includes("OpenAPI_ServiceResponse") && !xml.includes("cmmMsgHeader")) return null;
  const errMsg = readTag(xml, "errMsg");
  if (!errMsg) return null;
  return {
    errMsg,
    returnAuthMsg: readTag(xml, "returnAuthMsg"),
    returnReasonCode: readTag(xml, "returnReasonCode"),
  };
}

/**
 * 정상 봉투를 읽는다. `<response>` 도 `<header>` 도 없으면 `null`(= XML 이 아니거나 다른 응답).
 * `resultCode` 판정은 하지 않는다 — 값을 그대로 실어 보내고 수집기가 정책을 정한다.
 */
export function parseMolitBody(xml: string): MolitXmlBody | null {
  const resultCode = readTag(xml, "resultCode");
  if (resultCode === null) return null;
  return {
    resultCode,
    resultMsg: readTag(xml, "resultMsg") ?? "",
    totalCount: readInt(xml, "totalCount"),
    numOfRows: readInt(xml, "numOfRows"),
    pageNo: readInt(xml, "pageNo"),
    items: parseXmlItems(xml),
  };
}
