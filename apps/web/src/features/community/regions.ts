/**
 * 커뮤니티 지역(시군구) 선택지 — **상수표 하나가 원본이다** (T4.1).
 *
 * `Post.regionCode` 는 스키마 주석대로 **법정동 시군구 코드 5자리**, `regionName` 은 표시명이다.
 * 코드는 행정안전부 「법정동코드」의 앞 5자리(시도 2 + 시군구 3)를 그대로 쓴다.
 *
 * ## 왜 외부 API 를 부르지 않나
 *
 * 시군구 목록은 1년에 한 번 바뀔까 말까 한 값이라 **런타임 의존을 만들 이유가 없다.**
 * 외부 주소 API(카카오·행안부)를 부르면 ① 키가 필요하고 ② 오프라인·CI 에서 목록이 비고
 * ③ 선택지가 요청마다 달라져 테스트가 흔들린다. 그래서 상수표로 박아 두고,
 * **서버(검증)와 클라이언트(선택 UI)가 같은 배열을 읽는다** — 목록이 갈라질 자리가 없다.
 *
 * 지금 범위는 **서울 25개 자치구 + 경기 주요 10개 시**다. 데모 시드의 건물이 전부 서울
 * (성동구·강남구)이라 기본값을 성동구로 둔다. 지역을 늘리려면 이 배열에 줄만 더하면 되고,
 * 저장된 글은 `regionCode`·`regionName` 을 함께 들고 있어 표에서 지워도 화면이 깨지지 않는다.
 *
 * `@zari/db` 를 import 하지 않는다 — 글쓰기 폼(클라이언트)이 그대로 쓴다.
 */

export type CommunityRegion = {
  /** 법정동 시군구 코드 5자리 */
  code: string;
  /** 시도 표시명 */
  sido: string;
  /** 시군구 표시명 */
  name: string;
};

/** 서울 25개 자치구 — 코드 오름차순(종로구 11110 … 강동구 11740) */
const SEOUL: CommunityRegion[] = [
  { code: "11110", sido: "서울", name: "종로구" },
  { code: "11140", sido: "서울", name: "중구" },
  { code: "11170", sido: "서울", name: "용산구" },
  { code: "11200", sido: "서울", name: "성동구" },
  { code: "11215", sido: "서울", name: "광진구" },
  { code: "11230", sido: "서울", name: "동대문구" },
  { code: "11260", sido: "서울", name: "중랑구" },
  { code: "11290", sido: "서울", name: "성북구" },
  { code: "11305", sido: "서울", name: "강북구" },
  { code: "11320", sido: "서울", name: "도봉구" },
  { code: "11350", sido: "서울", name: "노원구" },
  { code: "11380", sido: "서울", name: "은평구" },
  { code: "11410", sido: "서울", name: "서대문구" },
  { code: "11440", sido: "서울", name: "마포구" },
  { code: "11470", sido: "서울", name: "양천구" },
  { code: "11500", sido: "서울", name: "강서구" },
  { code: "11530", sido: "서울", name: "구로구" },
  { code: "11545", sido: "서울", name: "금천구" },
  { code: "11560", sido: "서울", name: "영등포구" },
  { code: "11590", sido: "서울", name: "동작구" },
  { code: "11620", sido: "서울", name: "관악구" },
  { code: "11650", sido: "서울", name: "서초구" },
  { code: "11680", sido: "서울", name: "강남구" },
  { code: "11710", sido: "서울", name: "송파구" },
  { code: "11740", sido: "서울", name: "강동구" },
];

/** 경기 주요 시 — 시 단위 코드(구가 있는 시도 시 단위 코드가 별도로 존재한다) */
const GYEONGGI: CommunityRegion[] = [
  { code: "41110", sido: "경기", name: "수원시" },
  { code: "41130", sido: "경기", name: "성남시" },
  { code: "41170", sido: "경기", name: "안양시" },
  { code: "41190", sido: "경기", name: "부천시" },
  { code: "41210", sido: "경기", name: "광명시" },
  { code: "41270", sido: "경기", name: "안산시" },
  { code: "41280", sido: "경기", name: "고양시" },
  { code: "41360", sido: "경기", name: "남양주시" },
  { code: "41460", sido: "경기", name: "용인시" },
  { code: "41590", sido: "경기", name: "화성시" },
];

/** 선택 가능한 전체 지역 — 화면의 시군구 셀렉트가 이 순서 그대로 그린다 */
export const COMMUNITY_REGIONS: readonly CommunityRegion[] = [...SEOUL, ...GYEONGGI];

/** 기본 보드 — 데모 시드 건물이 있는 서울 성동구 */
export const DEFAULT_REGION_CODE = "11200";

const BY_CODE = new Map(COMMUNITY_REGIONS.map((region) => [region.code, region]));

/** 코드 → 지역. 표에 없는 코드는 `undefined`(라우트가 400 으로 돌려준다) */
export function findRegion(code: string): CommunityRegion | undefined {
  return BY_CODE.get(code);
}

/** 표에 없으면 기본 지역 — 화면(서버 컴포넌트)이 잘못된 쿼리로 죽지 않게 */
export function resolveRegion(code: string | undefined | null): CommunityRegion {
  return (code ? BY_CODE.get(code) : undefined) ?? BY_CODE.get(DEFAULT_REGION_CODE)!;
}

/** 저장·표시용 이름 — "서울 성동구" */
export function regionLabel(region: CommunityRegion): string {
  return `${region.sido} ${region.name}`;
}
