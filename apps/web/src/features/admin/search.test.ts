/**
 * 검색어 이스케이프 단위 테스트 (T6.3). DB 없이 돈다.
 * "검색어 이스케이프" 는 최소 테스트 요구사항이다 — 실제 쿼리 결과는 `users` 라우트 테스트가 본다.
 */
import { describe, expect, test } from "vitest";
import { escapeLike, parseSearchTerm } from "./search";

describe("escapeLike", () => {
  test("LIKE 와일드카드를 글자로 만든다", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
  });

  test("백슬래시를 먼저 이스케이프한다(이중 이스케이프 방지)", () => {
    expect(escapeLike("a\\b")).toBe("a\\\\b");
    expect(escapeLike("\\%")).toBe("\\\\\\%");
  });

  test("평범한 한글·숫자는 건드리지 않는다", () => {
    expect(escapeLike("김임대 010")).toBe("김임대 010");
  });
});

describe("parseSearchTerm", () => {
  test("비었거나 공백뿐이면 null — 필터를 걸지 않는다", () => {
    expect(parseSearchTerm(undefined)).toBeNull();
    expect(parseSearchTerm("   ")).toBeNull();
  });

  test("이름과 숫자를 함께 뽑는다", () => {
    expect(parseSearchTerm(" 010-1111 ")).toEqual({
      raw: "010-1111",
      name: "010-1111",
      digits: "0101111",
    });
  });

  test("숫자가 없으면 digits 는 비어 있다", () => {
    expect(parseSearchTerm("김임대")?.digits).toBe("");
  });

  test("와일드카드는 두 갈래 모두에서 이스케이프된다", () => {
    expect(parseSearchTerm("%")).toEqual({ raw: "%", name: "\\%", digits: "" });
  });
});
