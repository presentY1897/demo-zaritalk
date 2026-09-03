import { expect, test } from "vitest";
import {
  COMMUTE_PARTIAL_TTL_MS,
  COMMUTE_TTL_MS,
  isCommuteFresh,
  readMockModes,
  toCommuteDto,
  type CommuteCacheShape,
} from "./cache";

/**
 * 캐시 정책(T3.5) — TTL 판정과 DTO 변환은 **순수 함수**라 DB 없이 본다.
 * 실제 upsert·조회는 `app/api/commute/route.test.ts` 가 DB 로 확인한다.
 */

const NOW = new Date("2026-09-03T00:00:00.000Z");

function row(overrides: Partial<CommuteCacheShape> = {}): CommuteCacheShape {
  return {
    transitMinutes: 34,
    transitDetail: { provider: "mock-transit", mock: true },
    drivingMinutes: 28,
    drivingDetail: { provider: "kakao-mobility", mock: false },
    fetchedAt: NOW,
    ...overrides,
  };
}

const ago = (ms: number) => new Date(NOW.getTime() - ms);

test("두 값이 다 있는 행은 7일까지 그대로 쓴다", () => {
  expect(isCommuteFresh(row({ fetchedAt: ago(0) }), NOW)).toBe(true);
  expect(isCommuteFresh(row({ fetchedAt: ago(COMMUTE_TTL_MS - 1000) }), NOW)).toBe(true);
  // 경계는 **만료**다 — 딱 7일이면 다시 계산한다
  expect(isCommuteFresh(row({ fetchedAt: ago(COMMUTE_TTL_MS) }), NOW)).toBe(false);
  expect(isCommuteFresh(row({ fetchedAt: ago(COMMUTE_TTL_MS + 1000) }), NOW)).toBe(false);
});

test("한쪽이 빈 행(부분 결과)은 1시간만 쓴다 — 일시적 실패를 7일 끌고 가지 않게", () => {
  const partial = row({ drivingMinutes: null, drivingDetail: { failed: true, mock: false } });

  expect(isCommuteFresh({ ...partial, fetchedAt: ago(30 * 60 * 1000) }, NOW)).toBe(true);
  expect(isCommuteFresh({ ...partial, fetchedAt: ago(COMMUTE_PARTIAL_TTL_MS) }, NOW)).toBe(false);
  // 완전한 행이라면 아직 신선했을 시간이다 — 부분 결과라서 만료된다
  expect(isCommuteFresh({ ...partial, fetchedAt: ago(2 * 60 * 60 * 1000) }, NOW)).toBe(false);
  expect(isCommuteFresh(row({ fetchedAt: ago(2 * 60 * 60 * 1000) }), NOW)).toBe(true);
});

test("대중교통도 자동차도 비었으면 부분 결과 취급이다", () => {
  const empty = row({ transitMinutes: null, drivingMinutes: null });
  expect(isCommuteFresh({ ...empty, fetchedAt: ago(30 * 60 * 1000) }, NOW)).toBe(true);
  expect(isCommuteFresh({ ...empty, fetchedAt: ago(2 * 60 * 60 * 1000) }, NOW)).toBe(false);
});

test("모의 표시는 `*Detail.mock` 에서 온다 — 값이 없는 칸은 세지 않는다", () => {
  expect(readMockModes(row())).toEqual(["transit"]);

  // 자동차까지 모의로 바뀌면(제공자를 갈아 끼우면) 둘 다 잡힌다
  expect(readMockModes(row({ drivingDetail: { mock: true } }))).toEqual(["transit", "car"]);

  // ODsay 를 붙여 대중교통이 실연동이 되면 빈 배열이다
  expect(readMockModes(row({ transitDetail: { provider: "odsay", mock: false } }))).toEqual([]);

  // 조회에 실패해 값이 없으면 "모의" 라고 말할 것도 없다
  expect(readMockModes(row({ transitMinutes: null }))).toEqual([]);

  // T3.2·T3.3 이 넣어 둔 옛 행처럼 detail 이 비어 있어도 터지지 않는다
  expect(readMockModes(row({ transitDetail: null, drivingDetail: undefined }))).toEqual([]);
});

test("캐시 행 → 화면 DTO 는 배지·시트가 읽는 모양 그대로다", () => {
  const dto = toCommuteDto({ ...row(), workplaceId: "wp1" }, "회사");

  expect(dto).toEqual({
    workplaceId: "wp1",
    workplaceLabel: "회사",
    transitMinutes: 34,
    drivingMinutes: 28,
    fetchedAt: NOW.toISOString(),
    mockModes: ["transit"],
  });
});
