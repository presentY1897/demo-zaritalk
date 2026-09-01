import { assertTestDatabase, prisma, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { DEMO_ACCOUNTS } from "@/lib/auth/demo-accounts";
import { ACTIVE_PROFILE_COOKIE, SESSION_COOKIE } from "@/lib/auth/session";
import { getTestCookie, resetTestCookies } from "@/lib/auth/testing";
import { POST } from "./route";

// Route Handler 안의 cookies() 를 인메모리 쿠키 저장소로 바꿔 끼운다(@/lib/auth/testing 참고)
vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

function demoLogin(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/auth/demo-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** 시드(packages/db/prisma/seed.ts)와 같은 번호·유형으로 데모 계정을 만든다. */
async function seedDemoUser(role: keyof typeof DEMO_ACCOUNTS) {
  const account = DEMO_ACCOUNTS[role];
  return prisma.user.create({
    data: {
      phone: account.phone,
      name: account.name,
      profiles: { create: { type: account.profileType } },
    },
    include: { profiles: true },
  });
}

test("역할 키로 시드 계정 세션을 즉시 발급한다", async () => {
  const user = await seedDemoUser("landlord");

  const res = await demoLogin({ role: "landlord" });
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body.user).toMatchObject({ id: user.id, name: "김임대", phone: "01011111111" });
  expect(body.activeProfile.type).toBe("LANDLORD");

  // DB Session 레코드 + httpOnly 세션 쿠키가 짝을 이룬다
  const cookie = getTestCookie(SESSION_COOKIE);
  expect(cookie).toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.path).toBe("/");

  const session = await prisma.session.findUniqueOrThrow({ where: { token: cookie!.value } });
  expect(session.userId).toBe(user.id);
  expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());

  // 활성 프로필 쿠키는 역할과 같은 유형으로 잡힌다(클라이언트가 읽어야 하므로 httpOnly 아님)
  const profileCookie = getTestCookie(ACTIVE_PROFILE_COOKIE);
  expect(profileCookie?.value).toBe(user.profiles[0]!.id);
  expect(profileCookie?.httpOnly).toBe(false);
});

test("중개인 계정은 RealtorDetail 까지 응답에 담는다", async () => {
  const account = DEMO_ACCOUNTS.realtor;
  await prisma.user.create({
    data: {
      phone: account.phone,
      name: account.name,
      profiles: {
        create: {
          type: account.profileType,
          realtorDetail: {
            create: {
              officeName: "왕십리부동산",
              address: "서울 성동구 왕십리로 300",
              lat: 37.56133,
              lng: 127.03782,
            },
          },
        },
      },
    },
  });

  const body = await (await demoLogin({ role: "realtor" })).json();
  expect(body.activeProfile.realtorDetail.officeName).toBe("왕십리부동산");
  expect(body.activeProfile.masterDetail).toBeNull();
});

test("시드 계정이 없으면 404", async () => {
  const res = await demoLogin({ role: "master" });
  expect(res.status).toBe(404);
  expect((await res.json()).error.code).toBe("NOT_FOUND");
  expect(await prisma.session.count()).toBe(0);
});

test("모르는 역할 키는 400", async () => {
  const res = await demoLogin({ role: "hacker" });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
});
