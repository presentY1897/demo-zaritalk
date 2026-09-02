import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  createBuildingWithUnits,
  createLandlord,
  createLease,
  loginAs,
} from "@/features/landlord/testing";
import { createBrokerageTarget, createListingRow, createRealtor } from "@/features/listing/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { DELETE, GET, PATCH } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function patch(id: string, body: unknown): Promise<Response> {
  return PATCH(
    new Request(`http://localhost/api/listings/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx(id),
  );
}

async function scenario(unitLabels = ["101호"]) {
  const landlord = await createLandlord();
  const building = await createBuildingWithUnits(landlord.profile.id, unitLabels);
  const unit = building.units[0]!;
  const listing = await createListingRow(unit.id, landlord.profile.id);
  return { landlord, building, unit, listing };
}

test("비로그인이면 401, 없는 매물이면 404", async () => {
  const { landlord, listing } = await scenario();
  expect((await GET(new Request("http://localhost"), ctx(listing.id))).status).toBe(401);

  await loginAs(landlord.user.id);
  expect((await GET(new Request("http://localhost"), ctx("cmf0nope"))).status).toBe(404);
});

test("남의 매물이면 403", async () => {
  const { listing } = await scenario();
  const other = await createLandlord("01099999999", "남임대");
  await loginAs(other.user.id);

  const res = await GET(new Request("http://localhost"), ctx(listing.id));
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe("FORBIDDEN");
});

test("소유 임대인은 매물 상세를 읽는다", async () => {
  const { landlord, listing, unit } = await scenario();
  await loginAs(landlord.user.id);

  const body = await (await GET(new Request("http://localhost"), ctx(listing.id))).json();
  expect(body.listing.id).toBe(listing.id);
  expect(body.listing.unitId).toBe(unit.id);
  expect(body.listing.status).toBe("OPEN");
});

test("조건을 수정한다 — 설명은 빈 문자열로 지운다", async () => {
  const { landlord, listing } = await scenario();
  await loginAs(landlord.user.id);

  await patch(listing.id, { description: "채광 좋음" });
  const cleared = await patch(listing.id, { description: "" });
  expect(cleared.status).toBe(200);
  expect((await cleared.json()).listing.description).toBeNull();
});

test("빈 본문은 400", async () => {
  const { landlord, listing } = await scenario();
  await loginAs(landlord.user.id);

  const res = await patch(listing.id, {});
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
});

test("거래유형만 전세로 바꾸면 저장된 월세와 어긋나 400", async () => {
  const { landlord, listing } = await scenario();
  await loginAs(landlord.user.id);

  const res = await patch(listing.id, { dealType: "JEONSE" });
  expect(res.status).toBe(400);
  expect((await res.json()).error.message).toContain("전세는 월세가 0원");

  expect((await patch(listing.id, { dealType: "JEONSE", monthlyRent: 0 })).status).toBe(200);
});

test("상태 전이 — OPEN → RESERVED → CLOSED 는 되고, CLOSED 는 되돌릴 수 없다(409)", async () => {
  const { landlord, listing } = await scenario();
  await loginAs(landlord.user.id);

  expect((await patch(listing.id, { status: "RESERVED" })).status).toBe(200);
  expect((await patch(listing.id, { status: "CLOSED" })).status).toBe(200);

  const back = await patch(listing.id, { status: "OPEN" });
  expect(back.status).toBe(409);
  expect((await back.json()).error.message).toContain("되돌릴 수 없습니다");
});

test("종료한 매물은 조건 수정도 409", async () => {
  const { landlord, unit } = await scenario();
  const closed = await createListingRow(unit.id, landlord.profile.id, { status: "CLOSED" });
  await loginAs(landlord.user.id);

  const res = await patch(closed.id, { deposit: 20_000_000 });
  expect(res.status).toBe(409);
});

test("RESERVED → OPEN 은 그 사이 계약이 잡혔으면 409", async () => {
  const { landlord, unit } = await scenario();
  const reserved = await createListingRow(unit.id, landlord.profile.id, { status: "RESERVED" });
  await createLease(unit.id, "ACTIVE");
  await loginAs(landlord.user.id);

  const res = await patch(reserved.id, { status: "OPEN" });
  expect(res.status).toBe(409);
  expect((await res.json()).error.message).toContain("계약이 있는 호실");

  // 종료는 언제든 된다
  expect((await patch(reserved.id, { status: "CLOSED" })).status).toBe(200);
});

test("수락 중개인은 수정·상태 변경은 되지만 삭제는 403", async () => {
  const { landlord, unit, listing } = await scenario();
  const realtor = await createRealtor();
  await createBrokerageTarget(unit.id, landlord.profile.id, realtor.profile.id, "ACCEPTED");
  await loginAs(realtor.user.id);

  expect((await patch(listing.id, { deposit: 12_000_000 })).status).toBe(200);
  expect((await patch(listing.id, { status: "RESERVED" })).status).toBe(200);

  const res = await DELETE(new Request("http://localhost"), ctx(listing.id));
  expect(res.status).toBe(403);
  expect((await res.json()).error.message).toContain("임대인만");
});

test("임대인은 매물을 삭제한다 — 204", async () => {
  const { landlord, listing } = await scenario();
  await loginAs(landlord.user.id);

  const res = await DELETE(new Request("http://localhost"), ctx(listing.id));
  expect(res.status).toBe(204);
  expect(await prisma.listing.count()).toBe(0);
});
