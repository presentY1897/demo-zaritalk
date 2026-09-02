import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { createLandlord, loginAs } from "@/features/landlord/testing";
import { createTenant } from "@/features/tenant/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { DELETE, PATCH } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function patch(id: string, body: unknown): Promise<Response> {
  return PATCH(
    new Request(`http://localhost/api/workplaces/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx(id),
  );
}

async function createWorkplaceFor(tenantProfileId: string, label = "회사") {
  return prisma.workplace.create({
    data: {
      tenantProfileId,
      label,
      address: "서울 강남구 강남대로 396",
      lat: 37.49794,
      lng: 127.02762,
    },
  });
}

test("비로그인이면 401", async () => {
  const me = await createTenant();
  const workplace = await createWorkplaceFor(me.profile.id);
  expect((await patch(workplace.id, { label: "본가" })).status).toBe(401);
  expect((await DELETE(new Request("http://localhost"), ctx(workplace.id))).status).toBe(401);
});

test("세입자 프로필이 없으면 403", async () => {
  const me = await createTenant();
  const workplace = await createWorkplaceFor(me.profile.id);
  const landlord = await createLandlord();
  await loginAs(landlord.user.id);

  expect((await patch(workplace.id, { label: "본가" })).status).toBe(403);
});

test("없는 근무지는 404", async () => {
  const me = await createTenant();
  await loginAs(me.user.id);
  expect((await patch("cmf0nope", { label: "본가" })).status).toBe(404);
});

test("남의 근무지는 403 — 수정도 삭제도 막는다", async () => {
  const owner = await createTenant("01022222222", "박세입");
  const workplace = await createWorkplaceFor(owner.profile.id);
  const other = await createTenant("01088888888", "남세입");
  await loginAs(other.user.id);

  const res = await patch(workplace.id, { label: "가로채기" });
  expect(res.status).toBe(403);
  expect((await res.json()).error.message).toContain("내 근무지만");

  expect((await DELETE(new Request("http://localhost"), ctx(workplace.id))).status).toBe(403);
  expect(await prisma.workplace.count()).toBe(1);
});

test("이름만 바꾼다 — 200", async () => {
  const me = await createTenant();
  const workplace = await createWorkplaceFor(me.profile.id);
  await loginAs(me.user.id);

  const res = await patch(workplace.id, { label: "본가" });
  expect(res.status).toBe(200);
  expect((await res.json()).workplace.label).toBe("본가");
});

test("주소만 보내면 400 — 좌표를 함께 보내야 한다", async () => {
  const me = await createTenant();
  const workplace = await createWorkplaceFor(me.profile.id);
  await loginAs(me.user.id);

  const res = await patch(workplace.id, { address: "서울 성동구 왕십리로 300" });
  expect(res.status).toBe(400);

  const okRes = await patch(workplace.id, {
    address: "서울 성동구 왕십리로 300",
    lat: 37.56133,
    lng: 127.03782,
  });
  expect(okRes.status).toBe(200);
  expect((await okRes.json()).workplace.lng).toBeCloseTo(127.03782, 5);
});

test("범위 밖 좌표로는 수정할 수 없다 — 400", async () => {
  const me = await createTenant();
  const workplace = await createWorkplaceFor(me.profile.id);
  await loginAs(me.user.id);

  expect(
    (await patch(workplace.id, { address: "도쿄", lat: 35.6812, lng: 139.7671 })).status,
  ).toBe(400);
});

test("이름을 내 다른 근무지와 겹치게 바꾸면 409", async () => {
  const me = await createTenant();
  const first = await createWorkplaceFor(me.profile.id, "회사");
  await createWorkplaceFor(me.profile.id, "본가");
  await loginAs(me.user.id);

  expect((await patch(first.id, { label: "본가" })).status).toBe(409);
  // 자기 이름 그대로는 허용
  expect((await patch(first.id, { label: "회사" })).status).toBe(200);
});

test("빈 본문은 400", async () => {
  const me = await createTenant();
  const workplace = await createWorkplaceFor(me.profile.id);
  await loginAs(me.user.id);
  expect((await patch(workplace.id, {})).status).toBe(400);
});

test("내 근무지를 삭제한다 — 204", async () => {
  const me = await createTenant();
  const workplace = await createWorkplaceFor(me.profile.id);
  await loginAs(me.user.id);

  const res = await DELETE(new Request("http://localhost"), ctx(workplace.id));
  expect(res.status).toBe(204);
  expect(await prisma.workplace.count()).toBe(0);
});
