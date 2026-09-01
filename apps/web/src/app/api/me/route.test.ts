import { assertTestDatabase, prisma, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resetTestCookies, setTestCookie } from "@/lib/auth/testing";
import { POST as demoLoginRoute } from "../auth/demo-login/route";
import { POST as logoutRoute } from "../auth/logout/route";
import { GET } from "./route";

// Route Handler 안의 cookies() 를 인메모리 쿠키 저장소로 바꿔 끼운다(@/lib/auth/testing 참고)
vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

/** demo-login 으로 로그인 상태를 만든다(통합 시나리오 = E2E 픽스처와 같은 경로). */
async function loginAsTenant() {
  const user = await prisma.user.create({
    data: {
      phone: "01022222222",
      name: "박세입",
      profiles: { create: { type: "TENANT" } },
    },
    include: { profiles: true },
  });
  const res = await demoLoginRoute(
    new Request("http://localhost/api/auth/demo-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "tenant" }),
    }),
  );
  expect(res.status).toBe(200);
  return user;
}

test("비로그인이면 401", async () => {
  const res = await GET();
  expect(res.status).toBe(401);
  expect((await res.json()).error.code).toBe("UNAUTHORIZED");
});

test("세션 쿠키가 DB 에 없으면 401", async () => {
  setTestCookie(SESSION_COOKIE, "존재하지-않는-토큰");
  const res = await GET();
  expect(res.status).toBe(401);
});

test("만료된 세션이면 401", async () => {
  const user = await prisma.user.create({ data: { phone: "01088887777", name: "만료" } });
  await prisma.session.create({
    data: { token: "expired-token", userId: user.id, expiresAt: new Date(Date.now() - 1000) },
  });
  setTestCookie(SESSION_COOKIE, "expired-token");

  expect((await GET()).status).toBe(401);
});

test("로그인 상태면 User + 프로필 목록 + 활성 프로필을 준다", async () => {
  const user = await loginAsTenant();

  const res = await GET();
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body.user).toEqual({
    id: user.id,
    name: "박세입",
    phone: "01022222222",
    isAdmin: false,
  });
  expect(body.profiles).toHaveLength(1);
  expect(body.profiles[0]).toMatchObject({
    id: user.profiles[0]!.id,
    type: "TENANT",
    realtorDetail: null,
    masterDetail: null,
  });
  expect(body.activeProfile.id).toBe(user.profiles[0]!.id);
});

test("로그아웃하면 세션이 사라지고 다시 401", async () => {
  await loginAsTenant();
  expect((await GET()).status).toBe(200);

  const res = await logoutRoute();
  expect(res.status).toBe(204);
  expect(await prisma.session.count()).toBe(0);

  expect((await GET()).status).toBe(401);
});
