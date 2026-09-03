/**
 * 대중교통 **모의 제공자** (T3.5 · [D9](../../../../../docs/DECISIONS.md) 확정).
 *
 * ## 왜 모의인가
 *
 * 카카오모빌리티 REST 에는 **대중교통 경로 API 가 없다**(자동차·도보·자전거만). 실연동하려면
 * ODsay 키가 필요한데 데모 시점에 발급받지 못했다. 그렇다고 대중교통 칸을 비워 두면
 * "통근시간 조회" 라는 기능 자체가 반쪽이 되므로, **거리 기반의 그럴듯한 값**을 만들어 넣되
 * 화면에 **모의임을 밝힌다**(`mock: true` → `ListingCommuteDto.mockModes`).
 *
 * ## 반드시 결정적이어야 한다
 *
 * 값은 `CommuteCache` 에 **저장**된다. 랜덤이면
 *
 * - 같은 (매물, 근무지)인데 캐시를 지웠다 다시 채울 때 값이 달라지고,
 * - TTL 만료 재계산에서 배지 숫자가 이유 없이 흔들리며,
 * - 테스트가 값을 단언할 수 없다.
 *
 * 그래서 **좌표만의 함수**다 — 시각·난수·환경을 읽지 않는다. 같은 (출발, 도착) 쌍은 언제 몇 번
 * 불러도 같은 분을 낸다(`transit.test.ts` 가 못 박는다).
 *
 * ## 산식
 *
 * ```
 * km   = haversineKm(출발, 도착)                       // 직선거리
 * 1km 이하  → 도보:  분 = km / 4.5km/h × 60
 * 1km 초과  → 대중교통: 분 = (8 + (km × 1.35) / 27km/h × 60) × (1 ± 8%)
 * ```
 *
 * | 상수 | 값 | 근거 |
 * |---|---|---|
 * | `TRANSIT_ACCESS_MINUTES` | 8분 | 양쪽 도보 접근 + 승강장 대기·환승. 문 앞에서 바로 타지 않는다 |
 * | `TRANSIT_SPEED_KMH` | 27km/h | 서울 지하철 표정속도(≈32)와 시내버스(≈19)를 섞은 값 |
 * | `TRANSIT_DETOUR` | 1.35 | 노선은 직선으로 놓이지 않는다 — 직선거리 대비 실제 경로 배율 |
 * | `TRANSIT_JITTER` | ±8% | 같은 거리라도 노선·환승 수에 따라 다르다. **좌표 해시**라 결정적이다 |
 * | `WALK_KM` · `WALK_SPEED_KMH` | 1km · 4.5km/h | 1km 안쪽에 "대중교통 20분" 이 뜨면 값이 거짓말이 된다 |
 *
 * 행당해피빌 → 강남역(직선 7.1km)을 넣으면 30분 안팎이 나온다 — 실제 대중교통 40분대와 같은
 * 자릿수다(같은 구간을 카카오모빌리티는 자동차 28분·도로 8.4km 로 준다).
 * **실측이 아니다.** 매물끼리 비교하는 상대값으로만 쓰라는 뜻에서 화면이 「모의」를 붙인다.
 *
 * ## ODsay 로 바꿀 때
 *
 * 이 파일을 지우지 말고 `odsay.ts` 를 새로 만들어 `providers.ts` 의 `transit` 자리만 바꾼다
 * (키가 없는 환경에서 이 모의 제공자로 되돌릴 수 있어야 한다). 자세한 절차는
 * [T3.5 문서](../../../../../docs/tasks/t3.5-commute.md)의 "ODsay 로 교체할 때" 절.
 */
import { haversineKm } from "@/lib/geo/distance";
import type { CommutePoint, CommuteProvider, CommuteResult } from "./provider";

/** 양쪽 도보 접근 + 대기·환승에 얹는 고정 시간(분) */
export const TRANSIT_ACCESS_MINUTES = 8;
/** 지하철·버스를 섞은 표정속도(km/h) */
export const TRANSIT_SPEED_KMH = 27;
/** 직선거리 → 실제 노선 거리 배율 */
export const TRANSIT_DETOUR = 1.35;
/** 좌표 해시로 결정되는 흔들림 폭(±8%) */
export const TRANSIT_JITTER = 0.08;
/** 이 거리 안쪽은 대중교통 대신 도보로 본다(km) */
export const WALK_KM = 1;
/** 도보 속도(km/h) */
export const WALK_SPEED_KMH = 4.5;

/**
 * FNV-1a 32bit — **결정적** 해시. `Math.random()` 을 쓰지 않기 위한 것이고
 * 암호학적 용도가 아니다(값이 예측 가능해도 상관없다. 오히려 그래야 한다).
 */
function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    // FNV prime 16777619 곱셈을 32bit 로 유지한다
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * 좌표 쌍 → `-1 ~ 1` 사이의 결정적 값.
 *
 * 좌표를 **소수 6자리(≈11cm)로 끊어** 키를 만든다 — 부동소수 끝자리가 달라도 같은 지점이면
 * 같은 흔들림이 나오게 하기 위해서다.
 */
export function coordSignal(origin: CommutePoint, destination: CommutePoint): number {
  const key = `${origin.lat.toFixed(6)},${origin.lng.toFixed(6)}>${destination.lat.toFixed(6)},${destination.lng.toFixed(6)}`;
  // 0…2000 → -1…1 (0.001 단위)
  return (hash32(key) % 2001) / 1000 - 1;
}

export type MockTransitEstimate = {
  minutes: number;
  routeKm: number;
  straightKm: number;
  kind: "WALK" | "TRANSIT";
};

/** 산식 본체 — 순수 함수다. 같은 입력이면 언제나 같은 출력 */
export function estimateTransit(
  origin: CommutePoint,
  destination: CommutePoint,
): MockTransitEstimate {
  const straightKm = haversineKm(origin, destination);

  if (straightKm <= WALK_KM) {
    // 도보도 직선으로 걷지 않는다 — 골목을 도는 만큼만 얹는다
    const routeKm = straightKm * 1.2;
    return {
      minutes: Math.max(1, Math.round((routeKm / WALK_SPEED_KMH) * 60)),
      routeKm,
      straightKm,
      kind: "WALK",
    };
  }

  const routeKm = straightKm * TRANSIT_DETOUR;
  const base = TRANSIT_ACCESS_MINUTES + (routeKm / TRANSIT_SPEED_KMH) * 60;
  const minutes = Math.max(1, Math.round(base * (1 + coordSignal(origin, destination) * TRANSIT_JITTER)));
  return { minutes, routeKm, straightKm, kind: "TRANSIT" };
}

/** 대중교통 — **모의**. 좌표만 보므로 실패하지 않는다(좌표 이상값은 라우트가 먼저 막는다) */
export const mockTransitProvider: CommuteProvider = {
  mode: "transit",
  mock: true,
  name: "mock-transit",

  async route(origin: CommutePoint, destination: CommutePoint): Promise<CommuteResult> {
    if (
      !Number.isFinite(origin.lat) ||
      !Number.isFinite(origin.lng) ||
      !Number.isFinite(destination.lat) ||
      !Number.isFinite(destination.lng)
    ) {
      return { ok: false, failure: { reason: "NO_ROUTE", status: null, detail: "좌표가 올바르지 않습니다." } };
    }

    const estimate = estimateTransit(origin, destination);
    return {
      ok: true,
      data: {
        minutes: estimate.minutes,
        distanceM: Math.round(estimate.routeKm * 1000),
        mock: true,
        detail: {
          provider: "mock-transit",
          mock: true,
          kind: estimate.kind,
          straightKm: Math.round(estimate.straightKm * 1000) / 1000,
          routeKm: Math.round(estimate.routeKm * 1000) / 1000,
          accessMinutes: estimate.kind === "TRANSIT" ? TRANSIT_ACCESS_MINUTES : 0,
          speedKmh: estimate.kind === "TRANSIT" ? TRANSIT_SPEED_KMH : WALK_SPEED_KMH,
          note: "ODsay 미연동 — 좌표 기반 결정적 추정값입니다(D9).",
        },
      },
    };
  },
};
