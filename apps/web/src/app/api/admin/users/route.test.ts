/**
 * `GET /api/admin/users` 테스트 (T6.3).
 *
 * 최소 테스트 요구 두 가지가 여기 있다 — **비어드민 403** 과 **서버 페이지네이션·필터**.
 * 추가로 검색어 이스케이프와 페이지 경계(중복·누락 없음)를 못 박는다.
 */
import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  TEST_ADMIN_SECRET,
  createAdminUser,
  createPlainUser,
  loginAs,
} from "@/features/admin/testing";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resetTestCookies, setTestCookie } from "@/lib/auth/testing";
import { GET } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
  process.env.ADMIN_API_SECRET = TEST_ADMIN_SECRET;
});

afterEach(() => {
  delete process.env.ADMIN_API_SECRET;
});

function list(query = "", init?: RequestInit): Promise<Response> {
  return GET(new Request(`http://localhost/api/admin/users${query}`, init));
}

async function loginAdmin() {
  const admin = await createAdminUser();
  setTestCookie(SESSION_COOKIE, await loginAs(admin.id));
  return admin;
}

test("세션도 시크릿도 없으면 401, 비어드민 세션이면 403", async () => {
  expect((await list()).status).toBe(401);

  const plain = await createPlainUser();
  setTestCookie(SESSION_COOKIE, await loginAs(plain.id));
  expect((await list()).status).toBe(403);
});

test("서비스 시크릿으로도 열린다(기존 어드민 화면과 같은 통로)", async () => {
  await createAdminUser();
  const response = await list("", { headers: { "x-admin-secret": TEST_ADMIN_SECRET } });
  expect(response.status).toBe(200);
});

test("전화번호는 마스킹돼서 온다 — 원문이 응답에 실리지 않는다", async () => {
  await loginAdmin();
  await createPlainUser("01011112222", "김임대");

  const body = await (await list("?q=김임대")).json();
  expect(body.users[0].phone).toBe("010-****-2222");
  expect(JSON.stringify(body)).not.toContain("01011112222");
});

test("이름·전화번호 어느 쪽으로도 찾힌다(하이픈 허용)", async () => {
  await loginAdmin();
  await createPlainUser("01011112222", "김임대");
  await createPlainUser("01033334444", "박세입");

  expect((await (await list("?q=김임")).json()).page.total).toBe(1);
  expect((await (await list("?q=3333")).json()).page.total).toBe(1);
  expect((await (await list("?q=010-3333-4444")).json()).page.total).toBe(1);
  expect((await (await list("?q=010")).json()).page.total).toBe(3); // 관리자 포함
});

test("검색어의 LIKE 와일드카드는 글자로 취급한다", async () => {
  await loginAdmin();
  await createPlainUser("01011112222", "김임대");
  await createPlainUser("01033334444", "박세입");

  // 이스케이프하지 않으면 `%` 는 전부 매칭한다
  expect((await (await list("?q=%25")).json()).page.total).toBe(0);
  expect((await (await list("?q=_")).json()).page.total).toBe(0);

  // `_` 는 "아무 글자 하나" 가 아니라 밑줄 그 자체여야 한다
  const literal = await prisma.user.create({ data: { phone: "01055556666", name: "이_수" } });
  await prisma.user.create({ data: { phone: "01077778888", name: "이가수" } });
  const found = await (await list("?q=%EC%9D%B4_%EC%88%98")).json();
  expect(found.users.map((u: { id: string }) => u.id)).toEqual([literal.id]);
});

test("페이지네이션 — 페이지를 이어 붙이면 전체와 정확히 같다(중복·누락 없음)", async () => {
  await loginAdmin();
  for (let i = 0; i < 6; i += 1) {
    await createPlainUser(`0101111${String(i).padStart(4, "0")}`, `회원${i}`);
  }

  const all = await (await list("?pageSize=100")).json();
  expect(all.page.total).toBe(7); // 관리자 1 + 회원 6

  const collected: string[] = [];
  for (let page = 1; page <= 4; page += 1) {
    const body = await (await list(`?page=${page}&pageSize=2`)).json();
    expect(body.page).toMatchObject({ page, pageSize: 2, total: 7, totalPages: 4 });
    collected.push(...body.users.map((u: { id: string }) => u.id));
  }

  expect(collected).toHaveLength(7);
  expect(new Set(collected).size).toBe(7);
  expect(collected).toEqual(all.users.map((u: { id: string }) => u.id));
});

test("범위를 넘는 페이지는 404 가 아니라 빈 목록 + 정확한 total", async () => {
  await loginAdmin();

  const body = await (await list("?page=9&pageSize=10")).json();
  expect(body.users).toEqual([]);
  expect(body.page).toMatchObject({ page: 9, total: 1, totalPages: 1, hasNext: false });
});

test.each([
  ["page=0", "?page=0"],
  ["page=abc", "?page=abc"],
  ["pageSize=0", "?pageSize=0"],
  ["pageSize=101", "?pageSize=101"],
])("%s 는 400 — 어디를 보여 줄지가 틀린 것이라 조용히 넘기지 않는다", async (_label, query) => {
  await loginAdmin();
  const response = await list(query);
  expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
});

test("행에 프로필 유형과 관계 건수가 함께 온다", async () => {
  const admin = await loginAdmin();
  await prisma.user.update({
    where: { id: admin.id },
    data: { profiles: { create: { type: "LANDLORD" } } },
  });

  const body = await (await list("?q=관리자")).json();
  expect(body.users[0]).toMatchObject({
    name: "관리자",
    isAdmin: true,
    profileTypes: ["LANDLORD"],
    tenantLeaseCount: 0,
    buildingCount: 0,
    refundCount: 0,
  });
});
