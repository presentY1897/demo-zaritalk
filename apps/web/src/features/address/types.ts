/**
 * 주소 검색 DTO (T3.1·T3.4 공용) — **다른 task 가 그대로 재사용한다.**
 *
 * **`@zari/db` 를 import 하지 않는다** — 검색 필드가 클라이언트 컴포넌트다.
 * 카카오 응답의 `x`(경도)·`y`(위도) 문자열은 프록시 라우트에서 숫자로 바꿔 내려준다 —
 * 화면에서 `Number()` 를 부르지 않게 하려는 것이고, 좌표 범위 검증도 서버에서 이미 끝난다.
 */

/** 후보가 어디서 왔는가 — 주소 검색(지번·도로명) / 장소 키워드 검색 */
export type AddressSourceValue = "ADDRESS" | "PLACE";

/** 검색 결과 후보 1건 */
export type AddressCandidate = {
  /** 목록 key 용. 카카오 장소 id 또는 좌표+주소로 만든 합성 키 */
  id: string;
  /** 지번 주소 — `Building.address`·`Workplace.address` 에 저장하는 값 */
  address: string;
  /** 도로명 주소. 없는 결과(행정동 등)도 있어 nullable */
  roadAddress: string | null;
  lat: number;
  lng: number;
  /** 장소명("왕십리역 2호선") — 키워드 결과에만 있다. 근무지 라벨 기본값으로 쓴다 */
  placeName: string | null;
  /** 카테고리("지하철역") — 키워드 결과 보조 표시 */
  category: string | null;
  source: AddressSourceValue;
};

/**
 * 폼이 받아 가는 선택 결과.
 * task 가 요구한 `{ address, roadAddress, lat, lng }` 에 `placeName` 만 더한 것이다
 * (근무지 라벨 자동 제안에 쓴다 — 필요 없으면 무시하면 된다).
 */
export type AddressSelection = {
  address: string;
  roadAddress: string | null;
  lat: number;
  lng: number;
  placeName?: string | null;
};

/** `GET /api/address/search` 응답 */
export type AddressSearchResponse = {
  candidates: AddressCandidate[];
  meta: {
    /** 카카오가 알려 준 전체 건수(주소 + 장소 합) */
    total: number;
    /** 마지막 페이지인가 */
    isEnd: boolean;
  };
};

/** `GET /api/address/reverse` 응답 — 좌표에 걸리는 주소가 없으면 `address: null` */
export type ReverseAddressResponse = { address: AddressSelection | null };

/** 후보 → 폼 값 */
export function toSelection(candidate: AddressCandidate): AddressSelection {
  return {
    address: candidate.address,
    roadAddress: candidate.roadAddress,
    lat: candidate.lat,
    lng: candidate.lng,
    placeName: candidate.placeName,
  };
}

/** 화면에 보여 줄 한 줄 — 도로명이 있으면 도로명을 앞세운다(사람이 더 잘 알아본다) */
export function displayAddress(value: AddressSelection | AddressCandidate): string {
  return value.roadAddress ?? value.address;
}
