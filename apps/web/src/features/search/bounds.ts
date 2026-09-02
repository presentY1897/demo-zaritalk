/**
 * 지도 영역(bounds) 규약 — **정의는 여기 한 곳뿐이다** (T3.2).
 *
 * ## 형식 — `swLat,swLng,neLat,neLng`
 *
 * ```
 * GET /api/listings?bounds=37.5432,127.0211,37.5721,127.0512
 * ```
 *
 * 남서(south-west) → 북동(north-east) 순서로 **위도, 경도** 네 개를 콤마로 잇는다.
 * 카카오맵이 `map.getBounds()` 로 주는 `LatLngBounds` 가 `getSouthWest()`·`getNorthEast()`
 * 두 꼭짓점이라 그대로 옮겨 담을 수 있고, JSON 을 URL 에 싣는 것보다 짧고 읽힌다
 * (지도를 움직일 때마다 나가는 쿼리라 길이가 그대로 로그·캐시 키 비용이다).
 *
 * ## 검증 (어긋나면 400)
 *
 * | 규칙 | 이유 |
 * |---|---|
 * | 숫자 4개 정확히 | 3개·5개는 순서를 잘못 맞춘 것이다 — 조용히 다른 영역을 조회하면 안 된다 |
 * | 위도 ±90 · 경도 ±180 | 좌표가 아닌 값 |
 * | `swLat < neLat`, `swLng < neLng` | 뒤집힌 영역은 "빈 영역" 과 구별되지 않는다 |
 *
 * **대한민국 범위(`features/address/coords.ts`)로는 막지 않는다.** 그 스키마는 "사용자가
 * 저장하는 지점" 을 막는 것이고, 여기는 화면이 보고 있는 영역이다 — 동해·서해 쪽으로 지도를
 * 조금만 밀어도 영역 모서리는 한국 밖으로 나간다. 범위로 막으면 정상 조작이 400 이 된다.
 *
 * **최대 크기 제한도 두지 않았다.** "전국이 보이게 축소" 는 정상 조작이다. 대신 결과 수를
 * `limit` 으로 자르고 응답에 `truncated` 를 실어 화면이 "지도를 확대해 주세요" 라고
 * 안내하게 했다 — 조작을 막는 대신 결과를 자르는 쪽이 낫다.
 *
 * ## 재조회를 줄이는 세 가지 (전부 이 파일의 순수 함수다)
 *
 * 1. **`roundBounds`** — 소수 4자리(≈11m)로 끊는다. 손가락 떨림 수준의 이동은 **같은 쿼리 키**가
 *    되어 Tanstack Query 캐시에서 그대로 나온다(네트워크 0).
 * 2. **`expandBounds`** — 화면보다 한 겹 넓게 받아 온다. 짧은 팬(pan)은 이미 받아 둔 영역
 *    안이라 다시 부르지 않는다.
 * 3. **`containsBounds`** — 새 화면 영역이 **이미 받아 온 영역 안**이고 그 응답이 잘리지
 *    않았다면(`truncated === false`) 그 영역의 매물을 전부 갖고 있다는 뜻이다. 다시 부르지 않고
 *    `withinBounds` 로 화면에 보이는 것만 골라 낸다.
 *
 * 시간 기반 디바운스(350ms)와 카카오의 `idle` 이벤트(끌기·확대가 **끝난 뒤** 한 번)는
 * 화면 쪽(`MapSearchView`)에 있다. 이 파일은 `@zari/db` 도 브라우저 API 도 쓰지 않는다.
 */

/** 지도가 보고 있는 사각 영역. 남서 → 북동 두 꼭짓점. */
export type Bounds = {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
};

export type LatLng = { lat: number; lng: number };

/** 좌표를 끊는 소수 자릿수 — 4자리는 위도 기준 약 11m 다. */
export const BOUNDS_PRECISION = 4;

/** 화면 영역보다 얼마나 넓게 받아 올지(각 변 기준 비율). 0.25 면 가로·세로가 1.5배가 된다. */
export const BOUNDS_FETCH_MARGIN = 0.25;

const LAT_LIMIT = 90;
const LNG_LIMIT = 180;

function isCoordinate(value: number, limit: number): boolean {
  return Number.isFinite(value) && value >= -limit && value <= limit;
}

/** 네 값이 좌표이고 남서 → 북동 순서인가 */
export function isValidBounds(bounds: Bounds): boolean {
  return (
    isCoordinate(bounds.swLat, LAT_LIMIT) &&
    isCoordinate(bounds.neLat, LAT_LIMIT) &&
    isCoordinate(bounds.swLng, LNG_LIMIT) &&
    isCoordinate(bounds.neLng, LNG_LIMIT) &&
    bounds.swLat < bounds.neLat &&
    bounds.swLng < bounds.neLng
  );
}

/**
 * `"swLat,swLng,neLat,neLng"` → `Bounds`. 형식이 어긋나면 **`null`**(라우트가 400 으로 바꾼다).
 * 빈 문자열도 `null` 이다 — "영역 없음" 은 파라미터를 아예 빼는 것으로 표현한다.
 */
export function parseBounds(raw: string): Bounds | null {
  const parts = raw.split(",");
  if (parts.length !== 4) return null;

  const numbers = parts.map((part) => {
    const trimmed = part.trim();
    // Number("") 는 0 이다 — 빈 칸을 0 으로 읽어 엉뚱한 영역을 만들지 않게 먼저 막는다
    return trimmed === "" ? Number.NaN : Number(trimmed);
  });
  const [swLat, swLng, neLat, neLng] = numbers as [number, number, number, number];

  const bounds = { swLat, swLng, neLat, neLng };
  return isValidBounds(bounds) ? bounds : null;
}

/** `Bounds` → 쿼리스트링 값. `parseBounds` 와 짝이다. */
export function formatBounds(bounds: Bounds): string {
  return [bounds.swLat, bounds.swLng, bounds.neLat, bounds.neLng].join(",");
}

const round = (value: number): number => {
  const factor = 10 ** BOUNDS_PRECISION;
  return Math.round(value * factor) / factor;
};

/** 소수 4자리로 끊는다 — 미세한 이동이 같은 쿼리 키가 되게. */
export function roundBounds(bounds: Bounds): Bounds {
  return {
    swLat: round(bounds.swLat),
    swLng: round(bounds.swLng),
    neLat: round(bounds.neLat),
    neLng: round(bounds.neLng),
  };
}

/** 각 변을 `ratio` 만큼 넓힌다(좌표 한계에서 잘린다). */
export function expandBounds(bounds: Bounds, ratio = BOUNDS_FETCH_MARGIN): Bounds {
  const latMargin = (bounds.neLat - bounds.swLat) * ratio;
  const lngMargin = (bounds.neLng - bounds.swLng) * ratio;
  return roundBounds({
    swLat: Math.max(-LAT_LIMIT, bounds.swLat - latMargin),
    swLng: Math.max(-LNG_LIMIT, bounds.swLng - lngMargin),
    neLat: Math.min(LAT_LIMIT, bounds.neLat + latMargin),
    neLng: Math.min(LNG_LIMIT, bounds.neLng + lngMargin),
  });
}

/** `inner` 가 `outer` 안에 완전히 들어가는가(경계 포함) */
export function containsBounds(outer: Bounds, inner: Bounds): boolean {
  return (
    outer.swLat <= inner.swLat &&
    outer.swLng <= inner.swLng &&
    outer.neLat >= inner.neLat &&
    outer.neLng >= inner.neLng
  );
}

/** 점이 영역 안인가 — **경계는 포함**한다(DB 쪽 `gte`/`lte` 와 같은 규칙이어야 한다) */
export function withinBounds(bounds: Bounds, point: LatLng): boolean {
  return (
    point.lat >= bounds.swLat &&
    point.lat <= bounds.neLat &&
    point.lng >= bounds.swLng &&
    point.lng <= bounds.neLng
  );
}

/** 영역의 중심 — 지도 초기 중심에 쓴다 */
export function centerOfBounds(bounds: Bounds): LatLng {
  return {
    lat: (bounds.swLat + bounds.neLat) / 2,
    lng: (bounds.swLng + bounds.neLng) / 2,
  };
}

/**
 * 점들을 모두 담는 영역. 첫 진입(영역 없음)에서 **받아 온 매물이 다 보이도록** 지도를 맞출 때 쓴다.
 * 점이 하나뿐이거나 모두 같은 자리면 사방으로 `pad` 만큼(도 단위) 벌려 0 크기가 되지 않게 한다.
 */
export function boundsOfPoints(points: readonly LatLng[], pad = 0.004): Bounds | null {
  if (points.length === 0) return null;

  let swLat = Number.POSITIVE_INFINITY;
  let swLng = Number.POSITIVE_INFINITY;
  let neLat = Number.NEGATIVE_INFINITY;
  let neLng = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
    swLat = Math.min(swLat, point.lat);
    swLng = Math.min(swLng, point.lng);
    neLat = Math.max(neLat, point.lat);
    neLng = Math.max(neLng, point.lng);
  }
  if (!Number.isFinite(swLat) || !Number.isFinite(swLng)) return null;

  return roundBounds({
    swLat: swLat - pad,
    swLng: swLng - pad,
    neLat: neLat + pad,
    neLng: neLng + pad,
  });
}

/**
 * 지도가 움직였을 때 **서버를 다시 불러야 하는가**.
 *
 * 필터가 그대로이고, 직전 응답이 잘리지 않았고(`truncated === false`), 새 화면이 이미 받아 온
 * 영역 안이면 다시 부르지 않는다 — 그 영역의 매물은 이미 손에 있다.
 */
export function needsRefetch(input: {
  /** 직전에 서버에 물어본 영역. 아직 없으면 null */
  fetchedBounds: Bounds | null;
  /** 직전 응답이 `limit` 에 잘렸는가 */
  truncated: boolean;
  /** 지금 화면이 보고 있는 영역 */
  viewport: Bounds;
  /** 필터가 그 사이 바뀌었는가 */
  filtersChanged: boolean;
}): boolean {
  if (input.filtersChanged) return true;
  if (!input.fetchedBounds) return true;
  if (input.truncated) return true;
  return !containsBounds(input.fetchedBounds, input.viewport);
}
