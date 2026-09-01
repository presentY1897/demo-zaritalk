import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  createBuildingWithUnits,
  createLandlord,
  createLease,
  loginAs,
} from "@/features/landlord/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { DELETE, GET, PATCH } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (id: string) => new Request(`http://localhost/api/buildings/${id}`);

function patch(id: string, body: unknown): Promise<Response> {
  return PATCH(
    new Request(`http://localhost/api/buildings/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx(id),
  );
}

test("비로그인이면 401", async () => {
  expect((await GET(req("x"), ctx("x"))).status).toBe(401);
});

test("없는 건물 id 는 404", async () => {
  const me = await createLandlord();
  await loginAs(me.user.id);

  const res = await GET(req("nope"), ctx("nope"));
  expect(res.status).toBe(404);
  expect((await res.json()).error.code).toBe("NOT_FOUND");
});

test("타인 건물은 403 — 조회·수정·삭제 모두", async () => {
  const me = await createLandlord("01011111111", "김임대");
  const other = await createLandlord("01099999999", "남임대");
  const building = await createBuildingWithUnits(other.profile.id, ["101호"], "남의건물");
  await loginAs(me.user.id);

  expect((await GET(req(building.id), ctx(building.id))).status).toBe(403);
  expect((await patch(building.id, { name: "가로채기" })).status).toBe(403);
  expect((await DELETE(req(building.id), ctx(building.id))).status).toBe(403);

  // 실제로 아무것도 바뀌지 않았다
  const saved = await prisma.building.findUniqueOrThrow({ where: { id: building.id } });
  expect(saved.name).toBe("남의건물");
});

test("건물 상세는 호실 그리드를 라벨 순으로 담는다", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, ["202호", "101호", "201호"]);
  await createLease(building.units.find((u) => u.label === "201호")!.id, "ACTIVE");
  await loginAs(me.user.id);

  const body = await (await GET(req(building.id), ctx(building.id))).json();
  expect(body.building.units.map((unit: { label: string }) => unit.label)).toEqual([
    "101호",
    "201호",
    "202호",
  ]);
  expect(body.building.units[1]).toMatchObject({ status: "OCCUPIED" });
  expect(body.building.units[1].currentLease.tenantName).toBe("박세입");
  expect(body.building.units[0]).toMatchObject({ status: "VACANT", currentLease: null });
});

test("건물을 수정한다 — 보낸 필드만 바뀐다", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, []);
  await loginAs(me.user.id);

  const res = await patch(building.id, { name: "행당해피빌 2차", note: "리모델링" });
  expect(res.status).toBe(200);

  const saved = await prisma.building.findUniqueOrThrow({ where: { id: building.id } });
  expect(saved.name).toBe("행당해피빌 2차");
  expect(saved.note).toBe("리모델링");
  expect(saved.address).toBe("서울 성동구 행당로 79");
});

test("빈 본문으로 수정하면 400", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, []);
  await loginAs(me.user.id);

  expect((await patch(building.id, {})).status).toBe(400);
});

test("계약이 없는 건물은 삭제된다 — 호실도 함께 지워진다", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, ["101호", "102호"]);
  await loginAs(me.user.id);

  const res = await DELETE(req(building.id), ctx(building.id));
  expect(res.status).toBe(204);
  expect(await prisma.building.count()).toBe(0);
  expect(await prisma.unit.count()).toBe(0);
});

test("계약이 걸린 호실이 하나라도 있으면 건물 삭제는 409", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, ["101호", "201호"]);
  await createLease(building.units.find((u) => u.label === "201호")!.id, "ACTIVE");
  await loginAs(me.user.id);

  const res = await DELETE(req(building.id), ctx(building.id));
  expect(res.status).toBe(409);
  expect((await res.json()).error.code).toBe("CONFLICT");
  expect(await prisma.building.count()).toBe(1);
});

test("종료된 계약 이력만 있어도 건물 삭제는 409 (이력 보존)", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, ["101호"]);
  await createLease(building.units[0]!.id, "ENDED");
  await loginAs(me.user.id);

  expect((await DELETE(req(building.id), ctx(building.id))).status).toBe(409);
});
