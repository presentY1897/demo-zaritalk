import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  createBuildingWithUnits,
  createLandlord,
  createTenantOnlyUser,
  loginAs,
} from "@/features/landlord/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

function post(buildingId: string, body: unknown): Promise<Response> {
  return POST(
    new Request(`http://localhost/api/buildings/${buildingId}/units`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: buildingId }) },
  );
}

test("비로그인이면 401", async () => {
  expect((await post("x", { label: "101호" })).status).toBe(401);
});

test("임대인 프로필이 없으면 403", async () => {
  const { user } = await createTenantOnlyUser();
  await loginAs(user.id);
  expect((await post("x", { label: "101호" })).status).toBe(403);
});

test("없는 건물이면 404", async () => {
  const me = await createLandlord();
  await loginAs(me.user.id);
  expect((await post("nope", { label: "101호" })).status).toBe(404);
});

test("타인 건물에 호실을 추가하면 403", async () => {
  const me = await createLandlord("01011111111", "김임대");
  const other = await createLandlord("01099999999", "남임대");
  const building = await createBuildingWithUnits(other.profile.id, []);
  await loginAs(me.user.id);

  const res = await post(building.id, { label: "101호" });
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe("FORBIDDEN");
  expect(await prisma.unit.count()).toBe(0);
});

test("호실을 추가하면 201 — 계약이 없으니 공실(VACANT)", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, []);
  await loginAs(me.user.id);

  const res = await post(building.id, { label: "301호", floor: 3, areaM2: 23.1, rooms: 1 });
  expect(res.status).toBe(201);

  const body = await res.json();
  expect(body.unit).toMatchObject({
    label: "301호",
    floor: 3,
    rooms: 1,
    status: "VACANT",
    currentLease: null,
    buildingId: building.id,
  });
});

test("같은 건물에 같은 라벨을 또 넣으면 409 (@@unique([buildingId,label]))", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, ["101호"]);
  await loginAs(me.user.id);

  const res = await post(building.id, { label: "101호" });
  expect(res.status).toBe(409);
  expect((await res.json()).error.code).toBe("CONFLICT");
  expect(await prisma.unit.count()).toBe(1);
});

test("다른 건물이면 같은 라벨을 쓸 수 있다", async () => {
  const me = await createLandlord();
  await createBuildingWithUnits(me.profile.id, ["101호"], "A동");
  const b = await createBuildingWithUnits(me.profile.id, [], "B동");
  await loginAs(me.user.id);

  expect((await post(b.id, { label: "101호" })).status).toBe(201);
  expect(await prisma.unit.count()).toBe(2);
});

test("라벨이 비면 400", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, []);
  await loginAs(me.user.id);

  expect((await post(building.id, { label: " " })).status).toBe(400);
});
