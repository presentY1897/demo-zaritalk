/**
 * 카카오 로컬 API 응답 픽스처 (T3.1·T3.4) — **테스트에서만 import 한다**.
 *
 * 실제 응답을 그대로 줄여 놓은 것이다(2026-09 확인). 필드 이름·타입(좌표가 **문자열**,
 * `x` 가 경도·`y` 가 위도)이 실제와 같아야 정규화 코드를 제대로 검증한다.
 */

/** `search/address.json` — "서울 성동구 행당로 79" */
export const ADDRESS_RESPONSE = {
  documents: [
    {
      address: {
        address_name: "서울 성동구 행당동 347",
        b_code: "1120010700",
        main_address_no: "347",
        mountain_yn: "N",
        region_1depth_name: "서울",
        region_2depth_name: "성동구",
        region_3depth_name: "행당동",
        x: "127.027507006183",
        y: "37.5582053468995",
      },
      address_name: "서울 성동구 행당로 79",
      address_type: "ROAD_ADDR",
      road_address: {
        address_name: "서울 성동구 행당로 79",
        building_name: "행당동 대림아파트",
        main_building_no: "79",
        road_name: "행당로",
        underground_yn: "N",
        x: "127.027507006183",
        y: "37.5582053468995",
        zone_no: "04713",
      },
      x: "127.027507006183",
      y: "37.5582053468995",
    },
  ],
  meta: { is_end: true, pageable_count: 1, total_count: 1 },
};

/** `search/keyword.json` — "왕십리역" */
export const KEYWORD_RESPONSE = {
  documents: [
    {
      address_name: "서울 성동구 행당동 192",
      category_group_code: "SW8",
      category_group_name: "지하철역",
      category_name: "교통,수송 > 지하철,전철 > 수도권2호선",
      id: "21160481",
      phone: "02-6110-2081",
      place_name: "왕십리역 2호선",
      place_url: "http://place.map.kakao.com/21160481",
      road_address_name: "서울 성동구 왕십리로 지하 300",
      x: "127.03710337610202",
      y: "37.561268363317176",
    },
  ],
  meta: { is_end: false, pageable_count: 44, total_count: 199, same_name: { keyword: "왕십리역" } },
};

/** 결과 0건 */
export const EMPTY_RESPONSE = {
  documents: [],
  meta: { is_end: true, pageable_count: 0, total_count: 0 },
};

/** `geo/coord2address.json` */
export const COORD2ADDRESS_RESPONSE = {
  meta: { total_count: 1 },
  documents: [
    {
      address: { address_name: "서울 성동구 행당동 347" },
      road_address: { address_name: "서울 성동구 행당로 79", zone_no: "04713" },
    },
  ],
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** 카카오 인증 실패 응답(실호출로 확인한 형태) */
export const ACCESS_DENIED_BODY = {
  errorType: "AccessDeniedError",
  message: "wrong appKey(bogus) format",
};
