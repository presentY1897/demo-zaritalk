import { expect, test } from "vitest";
import {
  coordSignal,
  estimateTransit,
  mockTransitProvider,
  TRANSIT_ACCESS_MINUTES,
  TRANSIT_JITTER,
  WALK_KM,
} from "./transit";

/**
 * 모의 대중교통(T3.5 · D9).
 *
 * **결정성이 핵심이다** — 값이 `CommuteCache` 에 저장되므로 랜덤이면 캐시·배지·테스트가 흔들린다.
 * DB 도 네트워크도 쓰지 않는 순수 함수라 여기서 전부 확인한다.
 */

/** 행당해피빌(시드 건물) */
const HAENGDANG = { lat: 37.56152, lng: 127.03648 };
/** 강남역(시드 근무지) — 직선 7.1km(카카오가 준 도로 거리는 8.4km) */
const GANGNAM = { lat: 37.49794, lng: 127.02762 };
/** 성수 — 행당에서 직선 2km 남짓 */
const SEONGSU = { lat: 37.54453, lng: 127.05599 };

test("같은 (출발, 도착) 쌍은 언제 몇 번 불러도 같은 값이다", () => {
  const first = estimateTransit(HAENGDANG, GANGNAM);
  for (let i = 0; i < 50; i += 1) {
    expect(estimateTransit(HAENGDANG, GANGNAM).minutes).toBe(first.minutes);
  }
  // 시각·난수를 읽지 않으므로 시간이 흘러도 같다(값 자체가 좌표만의 함수다)
  expect(estimateTransit({ ...HAENGDANG }, { ...GANGNAM }).minutes).toBe(first.minutes);
});

test("좌표 끝자리가 소수 6자리 아래에서만 달라도 같은 값이다 — 부동소수 오차로 배지가 흔들리지 않게", () => {
  const base = estimateTransit(HAENGDANG, GANGNAM).minutes;
  const jittered = estimateTransit(
    { lat: HAENGDANG.lat + 1e-9, lng: HAENGDANG.lng - 1e-9 },
    { lat: GANGNAM.lat + 2e-9, lng: GANGNAM.lng },
  ).minutes;
  expect(jittered).toBe(base);
});

test("방향을 바꾸면 값이 달라질 수 있지만 각 방향은 그 자체로 결정적이다", () => {
  const there = estimateTransit(HAENGDANG, GANGNAM).minutes;
  const back = estimateTransit(GANGNAM, HAENGDANG).minutes;
  expect(estimateTransit(HAENGDANG, GANGNAM).minutes).toBe(there);
  expect(estimateTransit(GANGNAM, HAENGDANG).minutes).toBe(back);
  // 흔들림은 ±8% 뿐이라 두 방향이 크게 벌어지지는 않는다
  expect(Math.abs(there - back)).toBeLessThanOrEqual(Math.ceil(there * 2 * TRANSIT_JITTER) + 1);
});

test("거리 기반이다 — 직선 7.1km 는 30분 안팎, 2km 는 그보다 짧다", () => {
  const far = estimateTransit(HAENGDANG, GANGNAM);
  const near = estimateTransit(HAENGDANG, SEONGSU);

  expect(far.kind).toBe("TRANSIT");
  expect(far.straightKm).toBeGreaterThan(7);
  expect(far.straightKm).toBeLessThan(7.5);
  // 접근·대기 8분 + 7.1km × 1.35 ÷ 27km/h ≈ 29분 (±8%)
  expect(far.minutes).toBeGreaterThan(24);
  expect(far.minutes).toBeLessThan(36);

  expect(near.minutes).toBeLessThan(far.minutes);
  // 아무리 가까워도 도보 접근·대기가 있다
  expect(near.minutes).toBeGreaterThanOrEqual(TRANSIT_ACCESS_MINUTES);
});

test("1km 안쪽은 대중교통이 아니라 도보로 본다 — 「대중교통 20분」 이 거짓말이 되지 않게", () => {
  // 행당에서 북쪽으로 약 0.5km
  const near = { lat: HAENGDANG.lat + 0.0045, lng: HAENGDANG.lng };
  const walk = estimateTransit(HAENGDANG, near);

  expect(walk.kind).toBe("WALK");
  expect(walk.straightKm).toBeLessThanOrEqual(WALK_KM);
  // 0.5km × 1.2 ÷ 4.5km/h ≈ 8분
  expect(walk.minutes).toBeGreaterThanOrEqual(5);
  expect(walk.minutes).toBeLessThanOrEqual(12);
});

test("같은 지점끼리도 0분이 아니라 1분 이상을 준다", () => {
  const same = estimateTransit(HAENGDANG, HAENGDANG);
  expect(same.kind).toBe("WALK");
  expect(same.minutes).toBeGreaterThanOrEqual(1);
});

test("흔들림은 -1~1 사이의 결정적 값이다", () => {
  const signal = coordSignal(HAENGDANG, GANGNAM);
  expect(signal).toBeGreaterThanOrEqual(-1);
  expect(signal).toBeLessThanOrEqual(1);
  expect(coordSignal(HAENGDANG, GANGNAM)).toBe(signal);
  // 다른 쌍은 다른 흔들림을 받는다(같은 거리라도 노선이 다르다는 뜻)
  expect(coordSignal(GANGNAM, HAENGDANG)).not.toBe(signal);
});

test("제공자는 모의임을 스스로 밝힌다 — 화면의 「모의」 표시 근거다", async () => {
  expect(mockTransitProvider.mode).toBe("transit");
  expect(mockTransitProvider.mock).toBe(true);

  const result = await mockTransitProvider.route(HAENGDANG, GANGNAM);
  expect(result.ok).toBe(true);
  if (!result.ok) return;

  expect(result.data.mock).toBe(true);
  expect(result.data.detail.provider).toBe("mock-transit");
  expect(result.data.detail.mock).toBe(true);
  expect(result.data.minutes).toBe(estimateTransit(HAENGDANG, GANGNAM).minutes);
  expect(result.data.distanceM).toBeGreaterThan(0);
});

test("좌표가 숫자가 아니면 실패로 접는다 — 던지지 않는다", async () => {
  const result = await mockTransitProvider.route(HAENGDANG, { lat: Number.NaN, lng: 127 });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.failure.reason).toBe("NO_ROUTE");
});
