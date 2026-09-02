/**
 * 지도 영역 규약 단위 테스트 (T3.2) — **DB 없이 돈다**(순수 함수).
 *
 * 여기서 못 박는 것은 셋이다.
 * 1. `bounds` 문자열의 **형식과 거절 조건**(라우트가 400 을 내는 근거)
 * 2. 영역 안/밖 판정이 **경계를 포함**한다는 것 — DB 의 `gte`/`lte` 와 같은 규칙이어야
 *    "지도에는 보이는데 목록에 없다" 가 생기지 않는다
 * 3. **재조회 억제** 규칙 — 이미 받아 온 영역 안이면 서버를 다시 부르지 않는다
 */
import { describe, expect, test } from "vitest";
import {
  BOUNDS_PRECISION,
  boundsOfPoints,
  centerOfBounds,
  containsBounds,
  expandBounds,
  formatBounds,
  isValidBounds,
  needsRefetch,
  parseBounds,
  roundBounds,
  withinBounds,
  type Bounds,
} from "./bounds";

/** 왕십리 언저리 — 시드 건물(행당해피빌 37.56152,127.03648)을 품는 영역 */
const SEOUL: Bounds = { swLat: 37.55, swLng: 127.02, neLat: 37.575, neLng: 127.05 };

describe("parseBounds — 형식", () => {
  test("`swLat,swLng,neLat,neLng` 를 읽는다", () => {
    expect(parseBounds("37.55,127.02,37.575,127.05")).toEqual(SEOUL);
  });

  test("공백은 무시한다", () => {
    expect(parseBounds(" 37.55 , 127.02 , 37.575 , 127.05 ")).toEqual(SEOUL);
  });

  test("음수 좌표도 좌표다(해외 영역이라도 형식은 유효하다)", () => {
    expect(parseBounds("-34.1,-58.5,-34.0,-58.4")).toEqual({
      swLat: -34.1,
      swLng: -58.5,
      neLat: -34,
      neLng: -58.4,
    });
  });

  test("개수가 4개가 아니면 null", () => {
    expect(parseBounds("37.55,127.02,37.575")).toBeNull();
    expect(parseBounds("37.55,127.02,37.575,127.05,1")).toBeNull();
    expect(parseBounds("")).toBeNull();
  });

  test("빈 칸을 0 으로 읽지 않는다", () => {
    expect(parseBounds("37.55,,37.575,127.05")).toBeNull();
  });

  test("숫자가 아니면 null", () => {
    expect(parseBounds("서울,127.02,37.575,127.05")).toBeNull();
    expect(parseBounds("NaN,127.02,37.575,127.05")).toBeNull();
  });

  test("좌표 범위를 벗어나면 null", () => {
    expect(parseBounds("37.55,127.02,91,127.05")).toBeNull();
    expect(parseBounds("37.55,-181,37.575,127.05")).toBeNull();
  });

  test("남서/북동이 뒤집혔거나 같으면 null", () => {
    expect(parseBounds("37.575,127.02,37.55,127.05")).toBeNull();
    expect(parseBounds("37.55,127.05,37.575,127.02")).toBeNull();
    expect(parseBounds("37.55,127.02,37.55,127.05")).toBeNull();
  });

  test("formatBounds 와 왕복한다", () => {
    expect(parseBounds(formatBounds(SEOUL))).toEqual(SEOUL);
  });

  test("isValidBounds 는 같은 규칙을 본다", () => {
    expect(isValidBounds(SEOUL)).toBe(true);
    expect(isValidBounds({ ...SEOUL, neLat: 37.5 })).toBe(false);
  });
});

describe("roundBounds — 미세한 이동을 같은 키로", () => {
  test(`소수 ${BOUNDS_PRECISION}자리로 끊는다`, () => {
    expect(roundBounds({ swLat: 37.550004, swLng: 127.020001, neLat: 37.575, neLng: 127.05 })).toEqual(
      SEOUL,
    );
  });

  test("손가락 떨림 수준의 두 영역이 같은 문자열이 된다", () => {
    const a = roundBounds({ ...SEOUL, swLat: SEOUL.swLat + 0.000004 });
    const b = roundBounds({ ...SEOUL, swLat: SEOUL.swLat - 0.000004 });
    expect(formatBounds(a)).toBe(formatBounds(b));
  });
});

describe("withinBounds — 경계 포함", () => {
  test("안쪽 점은 true", () => {
    expect(withinBounds(SEOUL, { lat: 37.56152, lng: 127.03648 })).toBe(true);
  });

  test("네 모서리는 전부 포함한다(DB 의 gte/lte 와 같은 규칙)", () => {
    expect(withinBounds(SEOUL, { lat: SEOUL.swLat, lng: SEOUL.swLng })).toBe(true);
    expect(withinBounds(SEOUL, { lat: SEOUL.neLat, lng: SEOUL.neLng })).toBe(true);
    expect(withinBounds(SEOUL, { lat: SEOUL.swLat, lng: SEOUL.neLng })).toBe(true);
    expect(withinBounds(SEOUL, { lat: SEOUL.neLat, lng: SEOUL.swLng })).toBe(true);
  });

  test("한 축만 벗어나도 false", () => {
    expect(withinBounds(SEOUL, { lat: 37.6, lng: 127.03 })).toBe(false);
    expect(withinBounds(SEOUL, { lat: 37.56, lng: 127.09 })).toBe(false);
  });
});

describe("expandBounds / containsBounds", () => {
  test("넓힌 영역은 원래 영역을 포함한다", () => {
    const wide = expandBounds(SEOUL, 0.25);
    expect(containsBounds(wide, SEOUL)).toBe(true);
    expect(containsBounds(SEOUL, wide)).toBe(false);
  });

  test("각 변을 비율만큼 넓힌다", () => {
    const wide = expandBounds({ swLat: 0, swLng: 0, neLat: 10, neLng: 20 }, 0.1);
    expect(wide).toEqual({ swLat: -1, swLng: -2, neLat: 11, neLng: 22 });
  });

  test("좌표 한계를 넘지 않는다", () => {
    const wide = expandBounds({ swLat: -89, swLng: -179, neLat: 89, neLng: 179 }, 1);
    expect(wide.swLat).toBeGreaterThanOrEqual(-90);
    expect(wide.neLng).toBeLessThanOrEqual(180);
  });

  test("자기 자신은 포함한다(경계 일치)", () => {
    expect(containsBounds(SEOUL, SEOUL)).toBe(true);
  });
});

describe("boundsOfPoints / centerOfBounds", () => {
  test("점이 없으면 null", () => {
    expect(boundsOfPoints([])).toBeNull();
  });

  test("모든 점을 담는다", () => {
    const bounds = boundsOfPoints([
      { lat: 37.5, lng: 127.0 },
      { lat: 37.6, lng: 127.1 },
    ]);
    expect(bounds).not.toBeNull();
    expect(withinBounds(bounds!, { lat: 37.5, lng: 127.0 })).toBe(true);
    expect(withinBounds(bounds!, { lat: 37.6, lng: 127.1 })).toBe(true);
  });

  test("점이 하나뿐이어도 0 크기가 되지 않는다", () => {
    const bounds = boundsOfPoints([{ lat: 37.5, lng: 127.0 }]);
    expect(isValidBounds(bounds!)).toBe(true);
  });

  test("중심을 낸다", () => {
    expect(centerOfBounds({ swLat: 37, swLng: 127, neLat: 38, neLng: 128 })).toEqual({
      lat: 37.5,
      lng: 127.5,
    });
  });
});

describe("needsRefetch — 지도를 움직여도 서버를 다시 부르지 않는 조건", () => {
  const fetched = expandBounds(SEOUL, 0.25);

  test("아직 받아 온 영역이 없으면 부른다", () => {
    expect(
      needsRefetch({ fetchedBounds: null, truncated: false, viewport: SEOUL, filtersChanged: false }),
    ).toBe(true);
  });

  test("받아 온 영역 안이면 부르지 않는다", () => {
    expect(
      needsRefetch({
        fetchedBounds: fetched,
        truncated: false,
        viewport: SEOUL,
        filtersChanged: false,
      }),
    ).toBe(false);
  });

  test("영역을 벗어나면 부른다", () => {
    expect(
      needsRefetch({
        fetchedBounds: fetched,
        truncated: false,
        viewport: { swLat: 37.9, swLng: 127.4, neLat: 37.95, neLng: 127.45 },
        filtersChanged: false,
      }),
    ).toBe(true);
  });

  test("직전 응답이 잘렸으면(더 있는 영역) 안쪽이라도 다시 부른다", () => {
    expect(
      needsRefetch({
        fetchedBounds: fetched,
        truncated: true,
        viewport: SEOUL,
        filtersChanged: false,
      }),
    ).toBe(true);
  });

  test("필터가 바뀌면 무조건 부른다", () => {
    expect(
      needsRefetch({
        fetchedBounds: fetched,
        truncated: false,
        viewport: SEOUL,
        filtersChanged: true,
      }),
    ).toBe(true);
  });
});
