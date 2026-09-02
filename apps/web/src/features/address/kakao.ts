/**
 * 카카오 로컬 API 클라이언트 — **서버 전용**(T3.1·T3.4).
 *
 * `KAKAO_REST_API_KEY` 는 **절대 클라이언트로 나가지 않는다.** 화면은 우리 서버의
 * 프록시 라우트(`/api/address/*`)만 부르고, 그 라우트만 이 모듈을 import 한다.
 * (지도 표시용 `NEXT_PUBLIC_KAKAO_MAP_JS_KEY` 는 별개의 JS 키다 — T3.2 가 쓴다.)
 *
 * ## 쓰는 엔드포인트 ([공식 문서](https://developers.kakao.com/docs/latest/ko/local/dev-guide))
 *
 * | 용도 | 경로 | 주요 파라미터 | size 상한 |
 * |---|---|---|---|
 * | 주소 → 좌표 | `/v2/local/search/address.json` | `query`·`page`(1~45)·`size`·`analyze_type` | 30 |
 * | 키워드(장소) | `/v2/local/search/keyword.json` | `query`·`page`(1~45)·`size`·`x`·`y`·`radius` | 15 |
 * | 좌표 → 주소 | `/v2/local/geo/coord2address.json` | `x`(경도)·`y`(위도)·`input_coord` | — |
 *
 * 인증은 `Authorization: KakaoAK <REST 키>`. 좌표는 응답에서 **문자열**(`x`=경도, `y`=위도)로
 * 오므로 숫자로 바꾸고, 한국 범위를 벗어나면 버린다(`isWithinKorea`).
 * 실패 응답은 `{"errorType":"AccessDeniedError","message":"…"}` 꼴이라 우리 D1 규약과 다르다 —
 * 그대로 흘려보내지 않고 `KakaoFailure` 로 접어서 라우트가 우리 형태로 다시 만든다.
 */
import { isWithinKorea } from "./coords";
import type { AddressCandidate, AddressSearchResponse, AddressSelection } from "./types";

const KAKAO_LOCAL_BASE = "https://dapi.kakao.com/v2/local";

/** 카카오 문서 기준 상한 — 넘겨 보내면 400 이 온다 */
export const ADDRESS_SIZE_MAX = 30;
export const KEYWORD_SIZE_MAX = 15;

export type KakaoFailureReason =
  /** 서버에 `KAKAO_REST_API_KEY` 가 없다(로컬 `.env.local` 누락 등) */
  | "NO_KEY"
  /** 키가 거절됐다(401·403) */
  | "UNAUTHORIZED"
  /** 쿼터 초과(429) */
  | "RATE_LIMITED"
  /** 그 밖의 4xx·5xx */
  | "UPSTREAM"
  /** 네트워크 실패·타임아웃 */
  | "NETWORK";

export type KakaoFailure = { reason: KakaoFailureReason; status?: number };
export type KakaoResult<T> = { ok: true; data: T } | { ok: false; failure: KakaoFailure };

/** 외부 호출 타임아웃(ms) — 검색 한 번이 화면을 오래 붙잡지 않게 */
const TIMEOUT_MS = 4_000;

type KakaoMeta = { total_count?: number; pageable_count?: number; is_end?: boolean };

type KakaoAddressDocument = {
  /**
   * 대표 주소. **문서 타입에 따라 달라진다** — `ROAD_ADDR` 이면 도로명이 여기 들어오고
   * 지번은 `address.address_name` 에만 있다(실호출로 확인). 그래서 지번은 `address` 를 먼저 본다.
   */
  address_name?: string;
  address_type?: string;
  x?: string;
  y?: string;
  address?: { address_name?: string } | null;
  road_address?: { address_name?: string; building_name?: string } | null;
};

type KakaoKeywordDocument = {
  id?: string;
  place_name?: string;
  category_group_name?: string;
  category_name?: string;
  address_name?: string;
  road_address_name?: string;
  x?: string;
  y?: string;
};

type KakaoCoord2AddressDocument = {
  address?: { address_name?: string } | null;
  road_address?: { address_name?: string } | null;
};

function apiKey(): string | null {
  const key = process.env.KAKAO_REST_API_KEY?.trim();
  return key ? key : null;
}

/** 공통 GET — 인증 헤더를 여기서만 붙인다(키가 다른 곳으로 새지 않게) */
async function callKakao<T>(
  path: string,
  params: Record<string, string | number>,
): Promise<KakaoResult<T>> {
  const key = apiKey();
  if (!key) return { ok: false, failure: { reason: "NO_KEY" } };

  const url = new URL(`${KAKAO_LOCAL_BASE}${path}`);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // 검색 결과를 Next 데이터 캐시에 담지 않는다(검색어마다 달라지고 신선도가 중요하다)
      cache: "no-store",
    });
  } catch {
    return { ok: false, failure: { reason: "NETWORK" } };
  }

  if (!response.ok) {
    const reason: KakaoFailureReason =
      response.status === 401 || response.status === 403
        ? "UNAUTHORIZED"
        : response.status === 429
          ? "RATE_LIMITED"
          : "UPSTREAM";
    return { ok: false, failure: { reason, status: response.status } };
  }

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, failure: { reason: "UPSTREAM", status: response.status } };
  }
}

/** 문자열 좌표(`x`=경도, `y`=위도) → 숫자. 한국 범위 밖이면 null */
function toCoords(x: unknown, y: unknown): { lat: number; lng: number } | null {
  const lng = Number(x);
  const lat = Number(y);
  return isWithinKorea(lat, lng) ? { lat, lng } : null;
}

function trimOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toAddressCandidate(doc: KakaoAddressDocument): AddressCandidate | null {
  const coords = toCoords(doc.x, doc.y);
  // 지번은 `address.address_name` 이 원본이다. 없으면(행정동 결과 등) 대표 주소로 떨어진다
  const address = trimOrNull(doc.address?.address_name) ?? trimOrNull(doc.address_name);
  if (!coords || !address) return null;
  const roadAddress = trimOrNull(doc.road_address?.address_name);
  return {
    id: `address:${coords.lat},${coords.lng}:${address}`,
    address,
    roadAddress,
    lat: coords.lat,
    lng: coords.lng,
    placeName: trimOrNull(doc.road_address?.building_name),
    category: null,
    source: "ADDRESS",
  };
}

function toPlaceCandidate(doc: KakaoKeywordDocument): AddressCandidate | null {
  const coords = toCoords(doc.x, doc.y);
  const address = trimOrNull(doc.address_name) ?? trimOrNull(doc.road_address_name);
  if (!coords || !address) return null;
  return {
    id: `place:${trimOrNull(doc.id) ?? `${coords.lat},${coords.lng}`}`,
    address,
    roadAddress: trimOrNull(doc.road_address_name),
    lat: coords.lat,
    lng: coords.lng,
    placeName: trimOrNull(doc.place_name),
    category: trimOrNull(doc.category_group_name) ?? trimOrNull(doc.category_name),
    source: "PLACE",
  };
}

/** 주소 검색(지번·도로명) */
export async function searchAddress(
  query: string,
  size: number,
): Promise<KakaoResult<{ candidates: AddressCandidate[]; meta: KakaoMeta }>> {
  const result = await callKakao<{ documents?: KakaoAddressDocument[]; meta?: KakaoMeta }>(
    "/search/address.json",
    { query, size: Math.min(size, ADDRESS_SIZE_MAX), page: 1, analyze_type: "similar" },
  );
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      candidates: (result.data.documents ?? [])
        .map(toAddressCandidate)
        .filter((c): c is AddressCandidate => c !== null),
      meta: result.data.meta ?? {},
    },
  };
}

/** 장소 키워드 검색("왕십리역"·"카카오프렌즈") */
export async function searchPlace(
  query: string,
  size: number,
): Promise<KakaoResult<{ candidates: AddressCandidate[]; meta: KakaoMeta }>> {
  const result = await callKakao<{ documents?: KakaoKeywordDocument[]; meta?: KakaoMeta }>(
    "/search/keyword.json",
    { query, size: Math.min(size, KEYWORD_SIZE_MAX), page: 1 },
  );
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      candidates: (result.data.documents ?? [])
        .map(toPlaceCandidate)
        .filter((c): c is AddressCandidate => c !== null),
      meta: result.data.meta ?? {},
    },
  };
}

/**
 * 주소 + 장소를 한 번에 찾는다.
 *
 * 사용자는 "행당로 79"(주소)도 "왕십리역"(장소)도 같은 칸에 친다. 어느 쪽인지 미리 묻지 않고
 * 둘 다 부른 뒤 **주소 결과를 앞에** 놓고 합친다(주소가 더 정확한 답이다).
 * 한쪽이 실패해도 다른 쪽 결과가 있으면 그것만 돌려준다 — 검색이 통째로 죽지 않게.
 * 양쪽 다 실패하면 실패를 그대로 올린다(주소 쪽 사유를 우선).
 */
export async function searchAddressAndPlace(
  query: string,
  size: number,
): Promise<KakaoResult<AddressSearchResponse>> {
  const [address, place] = await Promise.all([
    searchAddress(query, size),
    searchPlace(query, size),
  ]);

  if (!address.ok && !place.ok) return { ok: false, failure: address.failure };

  const merged: AddressCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of [
    ...(address.ok ? address.data.candidates : []),
    ...(place.ok ? place.data.candidates : []),
  ]) {
    // 같은 좌표+주소가 주소 검색과 장소 검색에서 함께 나오는 일이 흔하다
    const key = `${candidate.lat.toFixed(6)},${candidate.lng.toFixed(6)}|${candidate.address}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
    if (merged.length >= size) break;
  }

  return {
    ok: true,
    data: {
      candidates: merged,
      meta: {
        total:
          (address.ok ? (address.data.meta.total_count ?? 0) : 0) +
          (place.ok ? (place.data.meta.total_count ?? 0) : 0),
        isEnd:
          (address.ok ? (address.data.meta.is_end ?? true) : true) &&
          (place.ok ? (place.data.meta.is_end ?? true) : true),
      },
    },
  };
}

/**
 * 좌표 → 주소. T3.2(지도 핀 이동)·T3.5 가 쓸 자리라 지금 함께 열어 둔다.
 * 바다·비주소 지역이면 카카오가 빈 배열을 주므로 `null` 을 돌려준다(에러가 아니다).
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<KakaoResult<AddressSelection | null>> {
  const result = await callKakao<{ documents?: KakaoCoord2AddressDocument[] }>(
    "/geo/coord2address.json",
    { x: lng, y: lat, input_coord: "WGS84" },
  );
  if (!result.ok) return result;

  const doc = result.data.documents?.[0];
  const address = trimOrNull(doc?.address?.address_name);
  const roadAddress = trimOrNull(doc?.road_address?.address_name);
  if (!address && !roadAddress) return { ok: true, data: null };

  return {
    ok: true,
    data: {
      address: address ?? roadAddress ?? "",
      roadAddress,
      lat,
      lng,
      placeName: null,
    },
  };
}
