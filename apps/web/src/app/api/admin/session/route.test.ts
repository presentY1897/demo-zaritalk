/**
 * 어드민 로그인 엔드포인트 테스트 (T6.3).
 *
 * 이 task 의 핵심이 여기 있다 — **어드민 앱의 문이 실제로 잠기는가.**
 * 시크릿·패스코드·`isAdmin` 세 가지가 모두 맞아야 세션이 나온다.
 */
import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  ADMIN_PHONE,
  TEST_ADMIN_PASSCODE,
  TEST_ADMIN_SECRET,
  createAdminUser,
  createPlainUser,
  loginAs,
} from "@/features/admin/testing";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resetTestCookies, setTestCookie } from "@/lib/auth/testing";
import { DELETE, GET, POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
  process.env.ADMIN_API_SECRET = TEST_ADMIN_SECRET;
  process.env.ADMIN_PASSWORD = TEST_ADMIN_PASSCODE;
});

afterEach(() => {
  delete process.env.ADMIN_API_SECRET;
  delete process.env.ADMIN_PASSWORD;
});

function signIn(
  body: Record<string, unknown>,
  headers: Record<string, string> = { "x-admin-secret": TEST_ADMIN_SECRET },
): Promise<Response> {
  return POST(
    new Request("http://localhost/api/admin/session", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

const check = () => GET(new Request("http://localhost/api/admin/session"));

test("서비스 시크릿이 없으면 401, 틀리면 403 — 어드민 서버 밖에서는 로그인 자체가 안 된다", async () => {
  await createAdminUser();

  expect((await signIn({ phone: ADMIN_PHONE, passcode: TEST_ADMIN_PASSCODE }, {})).status).toBe(401);
  expect(
    (await signIn({ phone: ADMIN_PHONE, passcode: TEST_ADMIN_PASSCODE }, { "x-admin-secret": "wrong" }))
      .status,
  ).toBe(403);
  expect(await prisma.session.count()).toBe(0);
});

test("패스코드가 틀리면 403 — 세션은 만들어지지 않는다", async () => {
  await createAdminUser();

  const response = await signIn({ phone: ADMIN_PHONE, passcode: "nope" });
  expect(response.status).toBe(403);
  expect(await prisma.session.count()).toBe(0);
});

test("패스코드가 설정돼 있지 않으면 전부 거부한다(fail closed)", async () => {
  await createAdminUser();
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_API_SECRET;
  delete process.env.CRON_SECRET;

  // 시크릿도 없으니 통로부터 막힌다 — 환경변수를 빠뜨린 배포가 "인증 없음" 으로 열리지 않는다
  expect((await signIn({ phone: ADMIN_PHONE, passcode: "anything" })).status).toBe(403);
  expect(await prisma.session.count()).toBe(0);
});

test("isAdmin 이 아닌 번호는 패스코드가 맞아도 403", async () => {
  const plain = await createPlainUser("01022222222", "박세입");

  const response = await signIn({ phone: plain.phone, passcode: TEST_ADMIN_PASSCODE });
  expect(response.status).toBe(403);
  expect(await prisma.session.count()).toBe(0);
});

test("없는 번호도 같은 403 문구다 — 관리자 번호를 떠보지 못하게", async () => {
  await createAdminUser();

  const unknown = await signIn({ phone: "01044445555", passcode: TEST_ADMIN_PASSCODE });
  const badPass = await signIn({ phone: ADMIN_PHONE, passcode: "nope" });

  expect(unknown.status).toBe(403);
  expect(await unknown.json()).toEqual(await badPass.json());
});

test("성공하면 세션 토큰 + 마스킹된 관리자 정보가 온다", async () => {
  const admin = await createAdminUser();

  const response = await signIn({ phone: "010-0000-0000", passcode: TEST_ADMIN_PASSCODE });
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body.admin).toEqual({ id: admin.id, name: "관리자", phone: "010-****-0000" });
  expect(typeof body.token).toBe("string");
  expect(body.token.length).toBeGreaterThan(40);

  // 발급된 것은 web 의 Session 레코드 그대로다 — 인증 체계가 하나다
  const session = await prisma.session.findUnique({ where: { token: body.token } });
  expect(session?.userId).toBe(admin.id);
});

test("본문이 없거나 형식이 틀리면 400", async () => {
  await createAdminUser();
  expect((await signIn({ phone: ADMIN_PHONE })).status).toBe(400);
  expect((await signIn({})).status).toBe(400);
});

test("GET — 세션이 없으면 401, 비어드민 세션이면 403, 어드민이면 200", async () => {
  expect((await check()).status).toBe(401);

  const plain = await createPlainUser();
  setTestCookie(SESSION_COOKIE, await loginAs(plain.id));
  expect((await check()).status).toBe(403);

  resetTestCookies();
  const admin = await createAdminUser();
  setTestCookie(SESSION_COOKIE, await loginAs(admin.id));
  const response = await check();
  expect(response.status).toBe(200);
  expect((await response.json()).admin).toMatchObject({ name: "관리자", phone: "010-****-0000" });
});

test("DELETE — 그 토큰만 폐기하고, 없어도 204(멱등)", async () => {
  const admin = await createAdminUser();
  const keep = await loginAs(admin.id);
  resetTestCookies();
  const drop = await loginAs(admin.id);
  setTestCookie(SESSION_COOKIE, drop);

  expect((await DELETE()).status).toBe(204);
  expect(await prisma.session.findUnique({ where: { token: drop } })).toBeNull();
  expect(await prisma.session.findUnique({ where: { token: keep } })).not.toBeNull();

  resetTestCookies();
  expect((await DELETE()).status).toBe(204);
});
