/**
 * `GET /api/admin/events` 테스트 (T6.3) — 이름·기간 필터, KST 시간대 카운트.
 */
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  createAdminUser,
  createEvent,
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
});

function list(query = ""): Promise<Response> {
  return GET(new Request(`http://localhost/api/admin/events${query}`));
}

async function loginAdmin() {
  const admin = await createAdminUser();
  setTestCookie(SESSION_COOKIE, await loginAs(admin.id));
  return admin;
}

const RANGE = "?from=2026-09-01&to=2026-09-03";

test("비로그인 401 · 비어드민 403", async () => {
  expect((await list()).status).toBe(401);
  const plain = await createPlainUser();
  setTestCookie(SESSION_COOKIE, await loginAs(plain.id));
  expect((await list()).status).toBe(403);
});

test("기간은 KST 달력 기준이고 끝 날짜를 포함한다", async () => {
  await loginAdmin();
  // 2026-08-31T15:00Z = 2026-09-01 00:00 KST → 포함
  await createEvent({ name: "page_view", createdAt: new Date("2026-08-31T15:00:00Z") });
  // 2026-08-31T14:59Z = 2026-08-31 23:59 KST → 제외
  await createEvent({ name: "page_view", createdAt: new Date("2026-08-31T14:59:00Z") });
  // 2026-09-03T14:59Z = 2026-09-03 23:59 KST → 포함(끝 날짜 포함)
  await createEvent({ name: "page_view", createdAt: new Date("2026-09-03T14:59:00Z") });
  // 2026-09-03T15:00Z = 2026-09-04 00:00 KST → 제외
  await createEvent({ name: "page_view", createdAt: new Date("2026-09-03T15:00:00Z") });

  const body = await (await list(RANGE)).json();
  expect(body.page.total).toBe(2);
  expect(body.range).toEqual({ from: "2026-09-01", to: "2026-09-03" });
});

test("시간대 카운트는 24칸이 항상 있고 KST 시로 담긴다", async () => {
  await loginAdmin();
  await createEvent({ name: "page_view", createdAt: new Date("2026-09-01T00:30:00Z") }); // KST 09시
  await createEvent({ name: "page_view", createdAt: new Date("2026-09-01T01:00:00Z") }); // KST 10시
  await createEvent({ name: "page_view", createdAt: new Date("2026-09-02T00:10:00Z") }); // KST 09시

  const body = await (await list(RANGE)).json();
  expect(body.hourly).toHaveLength(24);
  expect(body.hourly[9]).toEqual({ hour: 9, count: 2 });
  expect(body.hourly[10]).toEqual({ hour: 10, count: 1 });
  expect(body.hourly[0]).toEqual({ hour: 0, count: 0 });
  expect(body.sampled).toBe(3);
  expect(body.sampleTruncated).toBe(false);
});

test("이름 필터 — 선택지 목록은 이름 필터를 빼고 만든다", async () => {
  await loginAdmin();
  await createEvent({ name: "page_view", createdAt: new Date("2026-09-01T01:00:00Z") });
  await createEvent({ name: "page_view", createdAt: new Date("2026-09-01T02:00:00Z") });
  await createEvent({ name: "signup_start", createdAt: new Date("2026-09-01T03:00:00Z") });

  const body = await (await list(`${RANGE}&name=signup_start`)).json();
  expect(body.page.total).toBe(1);
  expect(body.events[0].name).toBe("signup_start");
  // 필터를 걸어도 드롭다운 선택지는 사라지지 않는다
  expect(body.names).toEqual([
    { name: "page_view", count: 2 },
    { name: "signup_start", count: 1 },
  ]);
  // 시간대 차트는 필터를 적용한 것만 센다
  expect(body.sampled).toBe(1);

  const both = await (await list(`${RANGE}&name=page_view,signup_start`)).json();
  expect(both.page.total).toBe(3);
});

test("로그인 이벤트에는 회원 이름이 붙고, anonId 는 앞 8자리만 온다", async () => {
  const admin = await loginAdmin();
  await createEvent({
    name: "signup_complete",
    createdAt: new Date("2026-09-01T01:00:00Z"),
    anonId: "0123456789abcdef0123456789abcdef",
    userId: admin.id,
    props: { variant: "A" },
  });

  const body = await (await list(RANGE)).json();
  expect(body.events[0]).toMatchObject({
    name: "signup_complete",
    anonId: "01234567…",
    userId: admin.id,
    userName: "관리자",
    props: '{"variant":"A"}',
  });
  expect(JSON.stringify(body)).not.toContain("0123456789abcdef0123456789abcdef");
});

test("기간을 생략하면 최근 7일이 기본이다", async () => {
  await loginAdmin();
  await createEvent({ name: "page_view", createdAt: new Date() });
  await createEvent({ name: "page_view", createdAt: new Date("2020-01-01T00:00:00Z") });

  const body = await (await list()).json();
  expect(body.page.total).toBe(1);
  expect(body.range.from < body.range.to).toBe(true);
});

test("형식이 틀린 날짜는 400 이 아니라 기본 구간으로 떨어진다", async () => {
  await loginAdmin();
  const response = await list("?from=어제&to=2026-13-40");
  expect(response.status).toBe(200);
});

test("페이지네이션 경계 — 이어 붙이면 전체와 같다", async () => {
  await loginAdmin();
  for (let i = 0; i < 5; i += 1) {
    await createEvent({
      name: "page_view",
      createdAt: new Date(`2026-09-01T0${i}:00:00Z`),
    });
  }

  const all = await (await list(`${RANGE}&pageSize=100`)).json();
  expect(all.page.total).toBe(5);

  const collected: string[] = [];
  for (let page = 1; page <= 3; page += 1) {
    const body = await (await list(`${RANGE}&page=${page}&pageSize=2`)).json();
    collected.push(...body.events.map((event: { id: string }) => event.id));
  }
  expect(new Set(collected).size).toBe(5);
  expect(collected).toEqual(all.events.map((event: { id: string }) => event.id));
});
