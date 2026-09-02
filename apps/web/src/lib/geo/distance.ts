/**
 * 좌표 거리·반경 매칭 (T5.1) — **DB 를 모르는 순수 모듈.**
 *
 * 이 프로젝트의 "반경 안에서 거리순 N명" 규칙은 두 곳에 있다:
 *
 * | 쓰는 곳 | 원점 | 후보 | 상한 |
 * |---|---|---|---|
 * | [T5.1·T5.2](../../../../../docs/tasks/t5.1-workorder.md) 작업 의뢰 push 추천 | 의뢰 건물 좌표 | `MasterDetail`(업종 일치 + `plan=PRO`) | 10명 |
 * | [T3.6](../../../../../docs/tasks/t3.6-brokerage-request.md) 공실 중개 요청 | 공실 건물 좌표 | `RealtorDetail` | 20명 |
 *
 * **규칙이 같으므로 함수도 하나다.** T3.6 은 이 파일을 그대로 import 해서
 * `rankByDistance(building, realtorDetails, { limit: 20 })` 로 쓰면 된다 —
 * `RealtorDetail`·`MasterDetail` 모두 `{ lat, lng, radiusKm }` 을 가지고 있어
 * `RadiusCandidate` 를 그대로 만족한다(구조적 타입).
 *
 * ## 반경 판정은 **후보의 반경**으로 한다
 *
 * 요청자가 "몇 km 안에서 찾을지" 를 정하는 것이 아니라, 마스터·중개인이 자기 프로필에
 * "나는 여기서 N km 까지 간다" 를 적어 둔다. 그래서 반경은 후보마다 다르고,
 * 판정은 `거리 ≤ 후보.radiusKm` 이다(경계값 **포함**).
 *
 * ## 거리 계산 — 하버사인
 *
 * 지구를 반지름 6371km 구로 보고 대권거리를 구한다. 서울 도심 규모(수 km)에서
 * 오차는 수 m 수준이라 반경 매칭에 충분하고, 외부 API 호출이 없어 테스트가 DB·네트워크 없이 돈다.
 */

/** 위경도 한 점 */
export type GeoPoint = { lat: number; lng: number };

/** 자기 활동반경을 가진 후보(마스터·중개인 프로필) */
export type RadiusCandidate = GeoPoint & { radiusKm: number };

/** 후보 + 원점까지의 거리(km) */
export type RankedCandidate<T> = { candidate: T; distanceKm: number };

/** 지구 평균 반지름(km) */
const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * 두 좌표 사이 대권거리(km). 같은 점이면 0, 순서를 바꿔도 값이 같다.
 *
 * `Math.min(1, …)` 은 부동소수 오차로 `sqrt(h)` 가 1을 아주 살짝 넘어
 * `asin` 이 `NaN` 을 돌려주는 것을 막는다(정확히 지구 반대편일 때).
 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 저장·표시용 반올림(기본 소수 3자리 = 1m). 거리 자체는 반올림하지 않고 다룬다. */
export function roundKm(km: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(km * factor) / factor;
}

/** 원점이 이 후보의 활동반경 안에 있는가. **경계값은 포함**(`거리 ≤ 반경`). */
export function isWithinRadius(origin: GeoPoint, candidate: RadiusCandidate): boolean {
  return haversineKm(origin, candidate) <= candidate.radiusKm;
}

/**
 * 활동반경 안의 후보만 골라 **거리순(가까운 순)** 으로 정렬하고 앞에서 `limit` 명만 남긴다.
 *
 * - 반경 판정은 후보마다 자기 `radiusKm` 으로 한다(경계값 포함).
 * - 거리가 완전히 같으면 입력 순서를 유지한다(`Array.prototype.sort` 는 안정 정렬).
 * - `limit` 을 주지 않으면 반경 안 전부를 돌려준다.
 * - 반환 `distanceKm` 은 `roundKm` 을 태운 값이다 — 그대로 `WorkOrderTarget.distanceKm`·
 *   `BrokerageTarget.distanceKm` 에 저장하고 화면에도 같은 값을 쓴다.
 */
export function rankByDistance<T extends RadiusCandidate>(
  origin: GeoPoint,
  candidates: readonly T[],
  options: { limit?: number } = {},
): RankedCandidate<T>[] {
  const ranked = candidates
    .map((candidate) => ({ candidate, distance: haversineKm(origin, candidate) }))
    .filter((entry) => entry.distance <= entry.candidate.radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .map((entry) => ({ candidate: entry.candidate, distanceKm: roundKm(entry.distance) }));

  return options.limit === undefined ? ranked : ranked.slice(0, options.limit);
}
