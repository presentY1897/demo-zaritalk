import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { createLandlord, loginAs } from "@/features/landlord/testing";
import { createTenant } from "@/features/tenant/testing";
import { WORKPLACE_MAX } from "@/features/workplace/schema";
import { resetTestCookies } from "@/lib/auth/testing";
import { GET, POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/workplaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const gangnam = { label: "회사", address: "서울 강남구 강남대로 396", lat: 37.49794, lng: 127.02762 };

test("비로그인이면 401", async () => {
  expect((await GET()).status).toBe(401);
  expect((await post(gangnam)).status).toBe(401);
});

test("세입자 프로필이 없는 계정(임대인)이면 403", async () => {
  const landlord = await createLandlord();
  await loginAs(landlord.user.id);

  const res = await GET();
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe("FORBIDDEN");
  expect((await post(gangnam)).status).toBe(403);
});

test("내 근무지만 목록에 나온다 — 남의 것은 섞이지 않는다", async () => {
  const me = await createTenant("01022222222", "박세입");
  const other = await createTenant("01088888888", "남세입");
  await prisma.workplace.createMany({
    data: [
      { tenantProfileId: me.profile.id, ...gangnam },
      { tenantProfileId: other.profile.id, label: "남의회사", address: "서울 마포구 양화로 160", lat: 37.5572, lng: 126.9245 },
    ],
  });
  await loginAs(me.user.id);

  const body = await (await GET()).json();
  expect(body.workplaces).toHaveLength(1);
  expect(body.workplaces[0].label).toBe("회사");
  expect(body.workplaces[0].lat).toBeCloseTo(37.49794, 5);
});

test("근무지를 등록한다 — 201, 내 프로필에 붙는다", async () => {
  const me = await createTenant();
  await loginAs(me.user.id);

  const res = await post(gangnam);
  expect(res.status).toBe(201);

  const body = await res.json();
  expect(body.workplace.label).toBe("회사");
  const row = await prisma.workplace.findUnique({ where: { id: body.workplace.id } });
  expect(row?.tenantProfileId).toBe(me.profile.id);
});

test("좌표가 대한민국 범위를 벗어나면 400", async () => {
  const me = await createTenant();
  await loginAs(me.user.id);

  // 도쿄(위 35.68 / 경 139.69) — 위도는 범위 안이지만 경도가 밖이다
  const tokyo = await post({ ...gangnam, lat: 35.6812, lng: 139.7671 });
  expect(tokyo.status).toBe(400);
  expect((await tokyo.json()).error.code).toBe("VALIDATION_ERROR");

  // 위도만 벗어난 경우도 막는다
  expect((await post({ ...gangnam, lat: 12.34 })).status).toBe(400);
  // 숫자가 아니면 400
  expect((await post({ ...gangnam, lat: "37.5" })).status).toBe(400);
  expect(await prisma.workplace.count()).toBe(0);
});

test("라벨이 비면 400", async () => {
  const me = await createTenant();
  await loginAs(me.user.id);
  expect((await post({ ...gangnam, label: "  " })).status).toBe(400);
});

test("같은 이름의 근무지를 또 넣으면 409, 다른 세입자는 같은 이름을 써도 된다", async () => {
  const me = await createTenant();
  await loginAs(me.user.id);
  expect((await post(gangnam)).status).toBe(201);

  const dup = await post(gangnam);
  expect(dup.status).toBe(409);
  expect((await dup.json()).error.message).toContain("이미 있는 근무지");

  const other = await createTenant("01088888888", "남세입");
  await loginAs(other.user.id);
  expect((await post(gangnam)).status).toBe(201);
});

test(`근무지는 ${WORKPLACE_MAX}곳까지 — 넘으면 409`, async () => {
  const me = await createTenant();
  await loginAs(me.user.id);
  for (let i = 0; i < WORKPLACE_MAX; i += 1) {
    expect((await post({ ...gangnam, label: `근무지${i}` })).status).toBe(201);
  }
  const over = await post({ ...gangnam, label: "하나더" });
  expect(over.status).toBe(409);
});
