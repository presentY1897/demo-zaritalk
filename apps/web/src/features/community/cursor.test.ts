/**
 * 커서 규약 단위 테스트 (T4.1) — **DB 없음**.
 * 경계에서 중복·누락이 없다는 보장은 "정렬 키가 유니크한 조합" 과 "커서에 정렬 키를 싣는다" 두 가지에서
 * 나온다. 여기서는 그 두 가지를 못 박고, 실제 페이지 경계는 `api/posts/route.test.ts` 가 확인한다.
 */
import { expect, test } from "vitest";
import { cursorWhere, decodeCursor, encodeCursor, orderByFor } from "./cursor";

const row = { id: "post_2", likeCount: 3, createdAt: new Date("2026-09-01T00:00:00.000Z") };

test("커서는 왕복해도 같은 값이다", () => {
  const cursor = decodeCursor(encodeCursor("latest", row), "latest");
  expect(cursor).toEqual({
    sort: "latest",
    id: "post_2",
    likeCount: 3,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
  });
});

test("커서는 불투명하다 — 값이 그대로 URL 에 보이지 않는다", () => {
  const encoded = encodeCursor("popular", row);
  expect(encoded).not.toContain("post_2");
  expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
});

test("다른 탭에서 만든 커서는 거절한다 (조용한 중복·누락을 막는다)", () => {
  expect(decodeCursor(encodeCursor("latest", row), "popular")).toBeNull();
  expect(decodeCursor(encodeCursor("popular", row), "latest")).toBeNull();
});

test("깨진 커서는 null — 첫 페이지로 되돌리지 않는다(무한 스크롤이 맴돈다)", () => {
  expect(decodeCursor("!!!not-base64!!!", "latest")).toBeNull();
  expect(decodeCursor(Buffer.from("latest|3", "utf8").toString("base64url"), "latest")).toBeNull();
  expect(
    decodeCursor(Buffer.from("latest|x|y|post_1", "utf8").toString("base64url"), "latest"),
  ).toBeNull();
  expect(
    decodeCursor(Buffer.from("latest|3|1|", "utf8").toString("base64url"), "latest"),
  ).toBeNull();
});

test("정렬은 언제나 유니크한 id 로 끝난다 — 동점이 있어도 순서가 뒤집히지 않는다", () => {
  expect(orderByFor("latest")).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  expect(orderByFor("popular")).toEqual([
    { likeCount: "desc" },
    { createdAt: "desc" },
    { id: "desc" },
  ]);
});

test("인기 탭 keyset 조건은 좋아요 동점을 createdAt·id 로 이어 받는다", () => {
  const cursor = decodeCursor(encodeCursor("popular", row), "popular")!;
  expect(cursorWhere(cursor)).toEqual({
    OR: [
      { likeCount: { lt: 3 } },
      { likeCount: 3, createdAt: { lt: cursor.createdAt } },
      { likeCount: 3, createdAt: cursor.createdAt, id: { lt: "post_2" } },
    ],
  });
});

test("최신 탭 keyset 조건은 createdAt 동점을 id 로 이어 받는다", () => {
  const cursor = decodeCursor(encodeCursor("latest", row), "latest")!;
  expect(cursorWhere(cursor)).toEqual({
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: "post_2" } },
    ],
  });
});
