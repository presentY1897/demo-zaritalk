/**
 * 거리·반경 매칭 단위 테스트 (T5.1) — **DB 없이 돈다**(순수 함수).
 * T3.6(중개 반경 매칭)이 같은 함수를 쓰므로 여기서 규칙을 못 박아 둔다.
 */
import { describe, expect, test } from "vitest";
import { haversineKm, isWithinRadius, rankByDistance, roundKm } from "./distance";

/** 시드 좌표 — 행당해피빌(의뢰 건물) · 성수홈케어(최마스) · 왕십리부동산(이중개) */
const HAENGDANG = { lat: 37.56152, lng: 127.03648 };
const SEONGSU = { lat: 37.54453, lng: 127.05599 };
const WANGSIMNI = { lat: 37.56133, lng: 127.03782 };

describe("haversineKm", () => {
  test("같은 점은 0km", () => {
    expect(haversineKm(HAENGDANG, HAENGDANG)).toBe(0);
  });

  test("순서를 바꿔도 값이 같다", () => {
    expect(haversineKm(HAENGDANG, SEONGSU)).toBeCloseTo(haversineKm(SEONGSU, HAENGDANG), 12);
  });

  test("시드 좌표 거리 — 행당해피빌 ↔ 성수홈케어는 약 2.5km", () => {
    expect(haversineKm(HAENGDANG, SEONGSU)).toBeCloseTo(2.55, 1);
  });

  test("아주 가까운 두 점(왕십리 사무소)은 200m 안쪽", () => {
    expect(haversineKm(HAENGDANG, WANGSIMNI)).toBeLessThan(0.2);
  });

  test("위도 1도 차이는 약 111km", () => {
    expect(haversineKm({ lat: 37, lng: 127 }, { lat: 38, lng: 127 })).toBeCloseTo(111.19, 1);
  });

  test("지구 반대편에서도 NaN 이 아니다 (부동소수 보정)", () => {
    const distance = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(Number.isNaN(distance)).toBe(false);
    expect(distance).toBeCloseTo(Math.PI * 6371, 0);
  });
});

describe("roundKm", () => {
  test("기본은 소수 3자리(1m)", () => {
    expect(roundKm(2.5546789)).toBe(2.555);
  });

  test("자릿수를 지정할 수 있다", () => {
    expect(roundKm(2.5546789, 1)).toBe(2.6);
  });
});

describe("isWithinRadius — 판정은 후보의 반경으로, 경계값 포함", () => {
  /** 위도 1도 ≈ 111.19km 를 이용해 거리를 아는 후보를 만든다 */
  const origin = { lat: 37, lng: 127 };
  const oneDegreeNorth = { lat: 38, lng: 127 };
  const exact = haversineKm(origin, oneDegreeNorth);

  test("반경 안이면 true", () => {
    expect(isWithinRadius(origin, { ...oneDegreeNorth, radiusKm: 200 })).toBe(true);
  });

  test("반경 밖이면 false", () => {
    expect(isWithinRadius(origin, { ...oneDegreeNorth, radiusKm: 100 })).toBe(false);
  });

  test("거리 == 반경(경계값)이면 포함한다", () => {
    expect(isWithinRadius(origin, { ...oneDegreeNorth, radiusKm: exact })).toBe(true);
  });

  test("반경이 거리보다 아주 조금 작으면 제외한다", () => {
    expect(isWithinRadius(origin, { ...oneDegreeNorth, radiusKm: exact - 1e-9 })).toBe(false);
  });

  test("후보마다 반경이 다르다 — 같은 거리라도 판정이 갈린다", () => {
    expect(isWithinRadius(origin, { ...oneDegreeNorth, radiusKm: 120 })).toBe(true);
    expect(isWithinRadius(origin, { ...oneDegreeNorth, radiusKm: 110 })).toBe(false);
  });
});

describe("rankByDistance", () => {
  const origin = { lat: 37.5, lng: 127.0 };
  /** 원점에서 북쪽으로 km 만큼 떨어진 후보(위도 1도 ≈ 111.19km) */
  const northOf = (km: number, radiusKm: number, id: string) => ({
    id,
    lat: 37.5 + km / 111.19,
    lng: 127.0,
    radiusKm,
  });

  test("가까운 순으로 정렬한다", () => {
    const ranked = rankByDistance(origin, [
      northOf(3, 10, "c"),
      northOf(1, 10, "a"),
      northOf(2, 10, "b"),
    ]);
    expect(ranked.map((entry) => entry.candidate.id)).toEqual(["a", "b", "c"]);
    expect(ranked[0]!.distanceKm).toBeCloseTo(1, 2);
  });

  test("자기 반경 밖의 후보는 제외한다", () => {
    const ranked = rankByDistance(origin, [
      northOf(1, 10, "가까움"),
      northOf(20, 10, "반경밖"), // 20km 떨어졌는데 반경은 10km
    ]);
    expect(ranked.map((entry) => entry.candidate.id)).toEqual(["가까움"]);
  });

  test("limit 으로 앞에서 N명만 남긴다 — 잘리는 것은 먼 쪽이다", () => {
    const candidates = Array.from({ length: 25 }, (_, index) =>
      northOf(index + 1, 100, `m${index + 1}`),
    );
    const ranked = rankByDistance(origin, candidates, { limit: 10 });
    expect(ranked).toHaveLength(10);
    expect(ranked.map((entry) => entry.candidate.id)).toEqual([
      "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10",
    ]);
  });

  test("limit 을 생략하면 반경 안 전부를 돌려준다", () => {
    const candidates = Array.from({ length: 25 }, (_, index) =>
      northOf(index + 1, 100, `m${index + 1}`),
    );
    expect(rankByDistance(origin, candidates)).toHaveLength(25);
  });

  test("거리가 같으면 입력 순서를 유지한다(안정 정렬)", () => {
    const ranked = rankByDistance(origin, [
      { id: "먼저", lat: 37.5, lng: 127.01, radiusKm: 10 },
      { id: "나중", lat: 37.5, lng: 127.01, radiusKm: 10 },
    ]);
    expect(ranked.map((entry) => entry.candidate.id)).toEqual(["먼저", "나중"]);
  });

  test("후보가 없으면 빈 배열", () => {
    expect(rankByDistance(origin, [])).toEqual([]);
  });

  test("distanceKm 은 소수 3자리로 반올림돼 그대로 저장된다", () => {
    const ranked = rankByDistance(HAENGDANG, [{ ...SEONGSU, radiusKm: 5 }]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.distanceKm).toBe(roundKm(haversineKm(HAENGDANG, SEONGSU)));
  });
});
