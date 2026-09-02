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

/**
 * `GET` 은 **T3.3 이 비로그인 공개로 넓혔다**(`/listings/[id]` 가 검색 유입 착지점이다).
 * T3.1 때 이 자리에 있던 401·403 단언은 아래 "남의 매물도 상세는 읽히지만…" 로 바뀌었다 —
 * 쓰기(`PATCH`·`DELETE`)의 권한은 그대로다.
 */
test("비로그인도 매물 상세를 읽는다 — 등록자 이름은 담기지 않는다", async () => {
  const { listing, unit, building } = await scenario();

  const res = await GET(new Request("http://localhost"), ctx(listing.id));
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body.listing.id).toBe(listing.id);
  expect(body.listing.unitId).toBe(unit.id);
  expect(body.listing.status).toBe("OPEN");
  expect(body.listing.priceLabel).toBe("월세 1,000만/50만");
  expect(body.listing.unit.label).toBe(unit.label);
  expect(body.listing.building.name).toBe(building.name);
  expect(body.listing.listedBy).toEqual({ role: "LANDLORD" });
  // 색인되는 페이지라 개인 이름이 실리면 안 된다
  expect(JSON.stringify(body)).not.toContain("김임대");
});

test("없는 매물이면 404", async () => {
  await scenario();
  const res = await GET(new Request("http://localhost"), ctx("cmf0nope"));
  expect(res.status).toBe(404);
  expect((await res.json()).error.code).toBe("NOT_FOUND");
});

test("종료(CLOSED)·예약(RESERVED) 매물도 상세는 200 — 404 로 감추지 않는다", async () => {
  const { landlord, unit } = await scenario();
  const closed = await createListingRow(unit.id, landlord.profile.id, { status: "CLOSED" });
  const reserved = await createListingRow(unit.id, landlord.profile.id, { status: "RESERVED" });

  const closedBody = await (await GET(new Request("http://localhost"), ctx(closed.id))).json();
  expect(closedBody.listing.status).toBe("CLOSED");

  const reservedBody = await (await GET(new Request("http://localhost"), ctx(reserved.id))).json();
  expect(reservedBody.listing.status).toBe("RESERVED");
});

test("남의 매물도 상세는 읽히지만 수정·삭제는 403", async () => {
  const { listing } = await scenario();
  const other = await createLandlord("01099999999", "남임대");
  await loginAs(other.user.id);

  expect((await GET(new Request("http://localhost"), ctx(listing.id))).status).toBe(200);

  const patched = await patch(listing.id, { deposit: 1 });
  expect(patched.status).toBe(403);
  expect((await patched.json()).error.code).toBe("FORBIDDEN");

  expect((await DELETE(new Request("http://localhost"), ctx(listing.id))).status).toBe(403);
});

test("통근 배지(T3.5 자리) — 내 근무지의 캐시만 붙는다", async () => {
  const { listing, unit } = await scenario();

  const tenant = await createTenantOnlyUser();
  const workplace = await prisma.workplace.create({
    data: {
      tenantProfileId: tenant.profile.id,
      label: "회사",
      address: "서울 강남구 강남대로 396",
      lat: 37.49794,
      lng: 127.02762,
    },
  });
  await prisma.commuteCache.create({
    data: { unitId: unit.id, workplaceId: workplace.id, transitMinutes: 38, drivingMinutes: null },
  });

  const url = `http://localhost/api/listings/${listing.id}?workplaceId=${workplace.id}`;

  // 비로그인은 지정해도 무시된다
  const anonymous = await (await GET(new Request(url), ctx(listing.id))).json();
  expect(anonymous.listing.commute).toBeNull();

  await loginAs(tenant.user.id);
  const mine = await (await GET(new Request(url), ctx(listing.id))).json();
  expect(mine.listing.commute).toMatchObject({ workplaceLabel: "회사", transitMinutes: 38 });

  // 근무지를 지정하지 않으면 배지도 없다
  const none = await (await GET(new Request("http://localhost"), ctx(listing.id))).json();
  expect(none.listing.commute).toBeNull();
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
