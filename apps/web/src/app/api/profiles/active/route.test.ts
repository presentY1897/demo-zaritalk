import { assertTestDatabase, prisma, resetDb } from "@zari/db/testing";
import type { ProfileType } from "@zari/db";
import { beforeEach, expect, test, vi } from "vitest";
import { ACTIVE_PROFILE_COOKIE, SESSION_COOKIE } from "@/lib/auth/session";
import { getTestCookie, resetTestCookies, setTestCookie } from "@/lib/auth/testing";
import { POST } from "./route";

// Route Handler 안의 cookies() 를 인메모리 쿠키 저장소로 바꿔 끼운다(T0.3 패턴)
vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

let seq = 0;

/** 프로필 유형 목록대로 사용자를 만들고 세션 쿠키까지 심는다(= 로그인 상태). */
async function createLoggedInUser(types: ProfileType[]) {
  seq += 1;
  const user = await prisma.user.create({
    data: {
      phone: `0105555${String(1000 + seq)}`,
      name: `테스트${seq}`,
      profiles: { create: types.map((type) => ({ type })) },
    },
    include: { profiles: { orderBy: { createdAt: "asc" } } },
  });
  const token = `session-${user.id}`;
  await prisma.session.create({
    data: { token, userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) },
  });
  setTestCookie(SESSION_COOKIE, token);
  return user;
}

function request(body: unknown): Request {
  return new Request("http://localhost/api/profiles/active", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("비로그인이면 401", async () => {
  const res = await POST(request({ profileId: "cmf0" }));
  expect(res.status).toBe(401);
  expect((await res.json()).error.code).toBe("UNAUTHORIZED");
});

test("profileId 가 없으면 400", async () => {
  await createLoggedInUser(["LANDLORD"]);

  const res = await POST(request({}));
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
});

test("존재하지 않는 프로필 id 면 404", async () => {
  await createLoggedInUser(["LANDLORD"]);

  const res = await POST(request({ profileId: "없는-프로필-id" }));
  expect(res.status).toBe(404);
  expect((await res.json()).error.code).toBe("NOT_FOUND");
});

/** task 문서가 요구하는 최소 테스트 — 남의 프로필로는 전환할 수 없다. */
test("타인 프로필 id 면 403 (쿠키도 그대로)", async () => {
  const other = await createLoggedInUser(["TENANT"]);
  const otherProfileId = other.profiles[0]!.id;

  const me = await createLoggedInUser(["LANDLORD"]);
  const myProfileId = me.profiles[0]!.id;

  const res = await POST(request({ profileId: otherProfileId }));
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe("FORBIDDEN");
  // 실패했으면 활성 프로필 쿠키가 남의 id 로 바뀌어 있으면 안 된다
  expect(getTestCookie(ACTIVE_PROFILE_COOKIE)?.value).not.toBe(otherProfileId);
  expect(await prisma.profile.findUnique({ where: { id: myProfileId } })).not.toBeNull();
});

test("내 프로필이면 200 + 활성 프로필 쿠키 갱신", async () => {
  const user = await createLoggedInUser(["LANDLORD", "TENANT"]);
  const [landlord, tenant] = user.profiles;
  setTestCookie(ACTIVE_PROFILE_COOKIE, landlord!.id);

  const res = await POST(request({ profileId: tenant!.id }));
  expect(res.status).toBe(200);

  // 응답은 GET /api/me 와 같은 모양 — 클라이언트가 캐시를 그대로 채운다
  const body = await res.json();
  expect(body.activeProfile.id).toBe(tenant!.id);
  expect(body.activeProfile.type).toBe("TENANT");
  expect(body.profiles).toHaveLength(2);
  expect(body.user.id).toBe(user.id);

  const cookie = getTestCookie(ACTIVE_PROFILE_COOKIE);
  expect(cookie?.value).toBe(tenant!.id);
  // 활성 프로필은 인증 수단이 아니라 클라이언트도 읽어야 하는 값이다
  expect(cookie?.httpOnly).toBe(false);
  expect(cookie?.path).toBe("/");
});

test("이미 활성인 프로필로 전환해도 200 (멱등)", async () => {
  const user = await createLoggedInUser(["REALTOR"]);
  const realtor = user.profiles[0]!;
  setTestCookie(ACTIVE_PROFILE_COOKIE, realtor.id);

  const res = await POST(request({ profileId: realtor.id }));
  expect(res.status).toBe(200);
  expect((await res.json()).activeProfile.id).toBe(realtor.id);
  expect(getTestCookie(ACTIVE_PROFILE_COOKIE)?.value).toBe(realtor.id);
});
