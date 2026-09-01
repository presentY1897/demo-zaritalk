import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  createBuildingWithUnits,
  createCharge,
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
const req = (id: string) => new Request(`http://localhost/api/units/${id}`);

function patch(id: string, body: unknown): Promise<Response> {
  return PATCH(
    new Request(`http://localhost/api/units/${id}`, {
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

test("없는 호실 id 는 404", async () => {
  const me = await createLandlord();
  await loginAs(me.user.id);
  expect((await GET(req("nope"), ctx("nope"))).status).toBe(404);
});

test("타인 호실은 403 — 조회·수정·삭제 모두", async () => {
  const me = await createLandlord("01011111111", "김임대");
  const other = await createLandlord("01099999999", "남임대");
  const building = await createBuildingWithUnits(other.profile.id, ["101호"]);
  const unitId = building.units[0]!.id;
  await loginAs(me.user.id);

  expect((await GET(req(unitId), ctx(unitId))).status).toBe(403);
  expect((await patch(unitId, { label: "가로채기" })).status).toBe(403);
  expect((await DELETE(req(unitId), ctx(unitId))).status).toBe(403);
});

test("호실 상세에 현재 계약·과거 이력·수납 요약이 담긴다", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, ["201호"]);
  const unitId = building.units[0]!.id;

  const ended = await createLease(unitId, "ENDED");
  const active = await createLease(unitId, "ACTIVE");
  await createCharge(active.id, "PAID", { month: 6, totalDue: 700_000, paidAmount: 700_000 });
  await createCharge(active.id, "OVERDUE", { month: 8, totalDue: 1_015_000, paidAmount: 0 });
  await loginAs(me.user.id);

  const body = await (await GET(req(unitId), ctx(unitId))).json();
  expect(body.unit.status).toBe("OVERDUE");
  expect(body.unit.currentLease.id).toBe(active.id);
  expect(body.unit.pastLeases.map((lease: { id: string }) => lease.id)).toEqual([ended.id]);
  expect(body.unit.chargeSummary).toMatchObject({
    totalCount: 2,
    unpaidCount: 1,
    overdueCount: 1,
    unpaidAmount: 1_015_000,
    latestMonth: "2026-08",
  });
  expect(body.unit.building.name).toBe("행당해피빌");
});

test("공실 호실은 계약·수납 요약이 없다", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, ["101호"]);
  const unitId = building.units[0]!.id;
  await loginAs(me.user.id);

  const body = await (await GET(req(unitId), ctx(unitId))).json();
  expect(body.unit).toMatchObject({ status: "VACANT", currentLease: null, chargeSummary: null });
});

test("호실을 수정한다", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, ["101호"]);
  const unitId = building.units[0]!.id;
  await loginAs(me.user.id);

  const res = await patch(unitId, { label: "102호", floor: 1, rooms: 2, note: "확장형" });
  expect(res.status).toBe(200);

  const saved = await prisma.unit.findUniqueOrThrow({ where: { id: unitId } });
  expect(saved).toMatchObject({ label: "102호", floor: 1, rooms: 2, note: "확장형" });
});

test("같은 건물의 다른 호실 라벨로 바꾸면 409", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, ["101호", "102호"]);
  const unitId = building.units.find((u) => u.label === "101호")!.id;
  await loginAs(me.user.id);

  const res = await patch(unitId, { label: "102호" });
  expect(res.status).toBe(409);
  expect((await res.json()).error.code).toBe("CONFLICT");
});

test("자기 라벨 그대로 저장하는 것은 409 가 아니다", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, ["101호"]);
  const unitId = building.units[0]!.id;
  await loginAs(me.user.id);

  expect((await patch(unitId, { label: "101호", rooms: 1 })).status).toBe(200);
});

test("계약이 없는 호실은 삭제된다", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, ["101호"]);
  const unitId = building.units[0]!.id;
  await loginAs(me.user.id);

  expect((await DELETE(req(unitId), ctx(unitId))).status).toBe(204);
  expect(await prisma.unit.count()).toBe(0);
});

test("계약이 걸린 호실 삭제는 409", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, ["201호"]);
  const unitId = building.units[0]!.id;
  await createLease(unitId, "ACTIVE");
  await loginAs(me.user.id);

  const res = await DELETE(req(unitId), ctx(unitId));
  expect(res.status).toBe(409);
  expect((await res.json()).error.message).toContain("계약");
  expect(await prisma.unit.count()).toBe(1);
});

test("매물이 걸린 호실 삭제는 409", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, ["101호"]);
  const unitId = building.units[0]!.id;
  await prisma.listing.create({
    data: {
      unitId,
      listedByProfileId: me.profile.id,
      dealType: "WOLSE",
      deposit: 10_000_000,
      monthlyRent: 500_000,
    },
  });
  await loginAs(me.user.id);

  const res = await DELETE(req(unitId), ctx(unitId));
  expect(res.status).toBe(409);
  expect((await res.json()).error.message).toContain("매물");
});
