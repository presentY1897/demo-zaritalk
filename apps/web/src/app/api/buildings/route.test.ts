import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  createBuildingWithUnits,
  createCharge,
  createLandlord,
  createLease,
  createTenantOnlyUser,
  loginAs,
} from "@/features/landlord/testing";
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
    new Request("http://localhost/api/buildings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const validBuilding = {
  name: "행당해피빌",
  address: "서울 성동구 행당로 79",
  lat: 37.56152,
  lng: 127.03648,
};

test("비로그인이면 401", async () => {
  expect((await GET()).status).toBe(401);
  expect((await post(validBuilding)).status).toBe(401);
});

test("임대인 프로필이 없는 계정(세입자)이면 403", async () => {
  const { user } = await createTenantOnlyUser();
  await loginAs(user.id);

  const res = await GET();
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe("FORBIDDEN");
});

test("내 건물만 목록에 나온다 — 남의 건물은 섞이지 않는다", async () => {
  const me = await createLandlord("01011111111", "김임대");
  const other = await createLandlord("01099999999", "남임대");
  await createBuildingWithUnits(me.profile.id, ["101호"], "내건물");
  await createBuildingWithUnits(other.profile.id, ["201호"], "남의건물");
  await loginAs(me.user.id);

  const body = await (await GET()).json();
  expect(body.buildings).toHaveLength(1);
  expect(body.buildings[0].name).toBe("내건물");
});

test("목록 요약에 호실 수와 상태별 수가 담긴다(계약중·대기·연체·공실)", async () => {
  const me = await createLandlord();
  const building = await createBuildingWithUnits(me.profile.id, [
    "101호",
    "201호",
    "202호",
    "301호",
  ]);
  const unit = (label: string) => building.units.find((u) => u.label === label)!;

  await createLease(unit("201호").id, "ACTIVE");
  const overdueLease = await createLease(unit("301호").id, "ACTIVE");
  await createCharge(overdueLease.id, "OVERDUE");
  await createLease(unit("202호").id, "PENDING_TENANT");
  await loginAs(me.user.id);

  const body = await (await GET()).json();
  expect(body.buildings[0].unitCount).toBe(4);
  expect(body.buildings[0].statusCounts).toEqual({
    OCCUPIED: 1,
    PENDING: 1,
    OVERDUE: 1,
    VACANT: 1,
  });
});

test("건물을 등록하면 201 과 요약을 돌려준다", async () => {
  const me = await createLandlord();
  await loginAs(me.user.id);

  const res = await post({ ...validBuilding, note: "엘리베이터 없음" });
  expect(res.status).toBe(201);

  const body = await res.json();
  expect(body.building).toMatchObject({
    name: "행당해피빌",
    address: "서울 성동구 행당로 79",
    note: "엘리베이터 없음",
    unitCount: 0,
  });

  const saved = await prisma.building.findUniqueOrThrow({ where: { id: body.building.id } });
  expect(saved.ownerProfileId).toBe(me.profile.id);
  expect(saved.lat).toBeCloseTo(37.56152);
});

test("좌표가 대한민국 범위를 벗어나면 400", async () => {
  const me = await createLandlord();
  await loginAs(me.user.id);

  const res = await post({ ...validBuilding, lat: 12.3 });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
});

test("이름이 비면 400", async () => {
  const me = await createLandlord();
  await loginAs(me.user.id);

  const res = await post({ ...validBuilding, name: "  " });
  expect(res.status).toBe(400);
});
