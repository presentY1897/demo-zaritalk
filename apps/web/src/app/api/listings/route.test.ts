import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  createBuildingWithUnits,
  createLandlord,
  createLease,
  createTenantOnlyUser,
  loginAs,
} from "@/features/landlord/testing";
import { createBrokerageTarget, createListingRow, createRealtor } from "@/features/listing/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/listings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const wolse = (unitId: string) => ({
  unitId,
  dealType: "WOLSE" as const,
  deposit: 10_000_000,
  monthlyRent: 500_000,
});

async function vacantUnit() {
  const landlord = await createLandlord();
  const building = await createBuildingWithUnits(landlord.profile.id, ["101호"]);
  const unit = building.units[0]!;
  return { landlord, building, unit };
}

test("비로그인이면 401", async () => {
  const { unit } = await vacantUnit();
  const res = await post(wolse(unit.id));
  expect(res.status).toBe(401);
  expect((await res.json()).error.code).toBe("UNAUTHORIZED");
});

test("없는 호실이면 404", async () => {
  const { landlord } = await vacantUnit();
  await loginAs(landlord.user.id);

  const res = await post(wolse("cmf0notexist"));
  expect(res.status).toBe(404);
});

test("임대인·중개인 프로필이 없는 계정(세입자)이면 403", async () => {
  const { unit } = await vacantUnit();
  const { user } = await createTenantOnlyUser();
  await loginAs(user.id);

  const res = await post(wolse(unit.id));
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe("FORBIDDEN");
});

test("남의 호실이면 403", async () => {
  const { unit } = await vacantUnit();
  const other = await createLandlord("01099999999", "남임대");
  await loginAs(other.user.id);

  const res = await post(wolse(unit.id));
  expect(res.status).toBe(403);
});

test("소유 임대인은 공실 호실에 매물을 등록한다 — 상태는 항상 OPEN", async () => {
  const { landlord, unit } = await vacantUnit();
  await loginAs(landlord.user.id);

  const res = await post({ ...wolse(unit.id), description: "역세권", availableFrom: "2026-10-01" });
  expect(res.status).toBe(201);

  const body = await res.json();
  expect(body.listing.status).toBe("OPEN");
  expect(body.listing.dealType).toBe("WOLSE");
  expect(body.listing.availableFrom).toBe("2026-10-01");
  expect(body.listing.listedBy.role).toBe("LANDLORD");
  expect(body.listing.listedBy.name).toBe("김임대");
});

test("중개를 수락한 중개인도 등록할 수 있다 — listedBy 는 REALTOR", async () => {
  const { landlord, unit } = await vacantUnit();
  const realtor = await createRealtor();
  await createBrokerageTarget(unit.id, landlord.profile.id, realtor.profile.id, "ACCEPTED");
  await loginAs(realtor.user.id);

  const res = await post(wolse(unit.id));
  expect(res.status).toBe(201);
  expect((await res.json()).listing.listedBy.role).toBe("REALTOR");
});

test("수락하지 않은(SENT) 중개인은 403", async () => {
  const { landlord, unit } = await vacantUnit();
  const realtor = await createRealtor();
  await createBrokerageTarget(unit.id, landlord.profile.id, realtor.profile.id, "SENT");
  await loginAs(realtor.user.id);

  expect((await post(wolse(unit.id))).status).toBe(403);
});

test("다른 호실의 중개를 수락한 중개인은 이 호실에 올릴 수 없다 — 403", async () => {
  const landlord = await createLandlord();
  const building = await createBuildingWithUnits(landlord.profile.id, ["101호", "102호"]);
  const [target, other] = building.units;
  const realtor = await createRealtor();
  await createBrokerageTarget(other!.id, landlord.profile.id, realtor.profile.id, "ACCEPTED");
  await loginAs(realtor.user.id);

  expect((await post(wolse(target!.id))).status).toBe(403);
});

test("계약중(ACTIVE) 호실이면 409", async () => {
  const { landlord, unit } = await vacantUnit();
  await createLease(unit.id, "ACTIVE");
  await loginAs(landlord.user.id);

  const res = await post(wolse(unit.id));
  expect(res.status).toBe(409);
  expect((await res.json()).error.message).toContain("계약이 있는 호실");
  expect(await prisma.listing.count()).toBe(0);
});

test("세입자 연결 대기(PENDING_TENANT) 호실도 409 — 이미 계약이 잡힌 집이다", async () => {
  const { landlord, unit } = await vacantUnit();
  await createLease(unit.id, "PENDING_TENANT");
  await loginAs(landlord.user.id);

  expect((await post(wolse(unit.id))).status).toBe(409);
});

test("종료(ENDED) 계약만 있으면 공실이라 등록된다", async () => {
  const { landlord, unit } = await vacantUnit();
  await createLease(unit.id, "ENDED");
  await loginAs(landlord.user.id);

  expect((await post(wolse(unit.id))).status).toBe(201);
});

test("이미 살아 있는 매물이 있으면 409, 종료(CLOSED)된 것만 있으면 다시 등록된다", async () => {
  const { landlord, unit } = await vacantUnit();
  await loginAs(landlord.user.id);

  const live = await createListingRow(unit.id, landlord.profile.id, { status: "OPEN" });
  const conflict = await post(wolse(unit.id));
  expect(conflict.status).toBe(409);
  expect((await conflict.json()).error.message).toContain("이미 등록된 매물");

  await prisma.listing.update({ where: { id: live.id }, data: { status: "CLOSED" } });
  expect((await post(wolse(unit.id))).status).toBe(201);
});

test("전세인데 월세가 0이 아니면 400, 월세인데 0이면 400", async () => {
  const { landlord, unit } = await vacantUnit();
  await loginAs(landlord.user.id);

  const jeonse = await post({
    unitId: unit.id,
    dealType: "JEONSE",
    deposit: 300_000_000,
    monthlyRent: 100_000,
  });
  expect(jeonse.status).toBe(400);
  expect((await jeonse.json()).error.code).toBe("VALIDATION_ERROR");

  const wolseZero = await post({
    unitId: unit.id,
    dealType: "WOLSE",
    deposit: 10_000_000,
    monthlyRent: 0,
  });
  expect(wolseZero.status).toBe(400);
});

test("사진은 http(s) URL 만, 최대 5장", async () => {
  const { landlord, unit } = await vacantUnit();
  await loginAs(landlord.user.id);

  const bad = await post({ ...wolse(unit.id), photos: ["javascript:alert(1)"] });
  expect(bad.status).toBe(400);

  const tooMany = await post({
    ...wolse(unit.id),
    photos: Array.from({ length: 6 }, (_, i) => `https://cdn.example.com/${i}.jpg`),
  });
  expect(tooMany.status).toBe(400);

  const okRes = await post({
    ...wolse(unit.id),
    photos: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"],
  });
  expect(okRes.status).toBe(201);
  expect((await okRes.json()).listing.photos).toEqual([
    "https://cdn.example.com/a.jpg",
    "https://cdn.example.com/b.jpg",
  ]);
});
