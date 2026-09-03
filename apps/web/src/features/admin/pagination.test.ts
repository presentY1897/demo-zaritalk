/**
 * 어드민 페이지네이션 규약 단위 테스트 (T6.3). DB 없이 돈다.
 *
 * 최소 테스트가 요구한 "전 화면 서버 페이지네이션" 중 **경계 계산**이 여기 있다
 * (실제 쿼리의 중복·누락은 각 라우트 테스트가 DB 로 확인한다).
 */
import { describe, expect, test } from "vitest";
import {
  buildPageMeta,
  DEFAULT_ADMIN_PAGE_SIZE,
  MAX_ADMIN_PAGE_SIZE,
  pageQueryShape,
  toSkipTake,
} from "./pagination";
import { z } from "zod";

const schema = z.object(pageQueryShape);

describe("쿼리 파싱", () => {
  test("비어 있으면 1페이지 · 기본 크기", () => {
    expect(schema.parse({})).toEqual({ page: 1, pageSize: DEFAULT_ADMIN_PAGE_SIZE });
  });

  test("문자열 숫자를 받는다(쿼리스트링은 언제나 문자열이다)", () => {
    expect(schema.parse({ page: "3", pageSize: "50" })).toEqual({ page: 3, pageSize: 50 });
  });

  test.each([
    ["0 페이지", { page: "0" }],
    ["음수 페이지", { page: "-1" }],
    ["소수 페이지", { page: "1.5" }],
    ["숫자가 아님", { page: "abc" }],
    ["0 크기", { pageSize: "0" }],
    ["상한 초과", { pageSize: String(MAX_ADMIN_PAGE_SIZE + 1) }],
  ])("%s 는 거절한다 → 라우트가 400", (_label, input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });

  test("상한 정확히는 통과한다", () => {
    expect(schema.parse({ pageSize: String(MAX_ADMIN_PAGE_SIZE) }).pageSize).toBe(
      MAX_ADMIN_PAGE_SIZE,
    );
  });
});

describe("skip/take", () => {
  test.each([
    [1, 20, 0],
    [2, 20, 20],
    [3, 7, 14],
  ])("page=%i pageSize=%i → skip %i", (page, pageSize, skip) => {
    expect(toSkipTake({ page, pageSize })).toEqual({ skip, take: pageSize });
  });
});

describe("페이지 메타", () => {
  test("딱 나누어떨어지면 마지막 페이지에 다음이 없다", () => {
    expect(buildPageMeta({ page: 2, pageSize: 10 }, 20)).toEqual({
      page: 2,
      pageSize: 10,
      total: 20,
      totalPages: 2,
      hasPrev: true,
      hasNext: false,
    });
  });

  test("나머지가 있으면 페이지가 하나 더 생긴다", () => {
    expect(buildPageMeta({ page: 1, pageSize: 10 }, 21).totalPages).toBe(3);
  });

  test("결과가 없으면 totalPages 는 0 이고 다음도 없다", () => {
    expect(buildPageMeta({ page: 1, pageSize: 10 }, 0)).toMatchObject({
      totalPages: 0,
      hasPrev: false,
      hasNext: false,
    });
  });

  test("범위를 넘는 페이지도 total 을 그대로 알려 준다(에러가 아니다)", () => {
    expect(buildPageMeta({ page: 99, pageSize: 10 }, 5)).toMatchObject({
      page: 99,
      total: 5,
      totalPages: 1,
      hasPrev: true,
      hasNext: false,
    });
  });
});
