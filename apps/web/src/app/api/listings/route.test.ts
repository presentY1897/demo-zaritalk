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
import {
  createBrokerageTarget,
  createListingAt,
  createListingRow,
  createRealtor,
} from "@/features/listing/testing";
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

/* ================================================================== */
/* GET /api/listings — 지도 영역 + 필터 (T3.2)                        */
/* ================================================================== */

type SearchBody = {
  listings: {
    id: string;
    dealType: "JEONSE" | "WOLSE";
    deposit: number;
    monthlyRent: number;
    priceLabel: string;
    pinLabel: string;
    building: { name: string; lat: number; lng: number };
    commute: { workplaceLabel: string; transitMinutes: number | null } | null;
  }[];
  count: number;
  truncated: boolean;
  limit: number;
  bounds: { swLat: number } | null;
  commuteWorkplaceId: string | null;
};

function get(query = ""): Promise<Response> {
  return GET(new Request(`http://localhost/api/listings${query}`));
}

async function names(query = ""): Promise<string[]> {
  const res = await get(query);
  expect(res.status).toBe(200);
  const body = (await res.json()) as SearchBody;
  return body.listings.map((listing) => listing.building.name);
}

/** 왕십리(안) · 강남(밖) 두 지점. 아래 bounds 는 왕십리만 담는다 */
const WANGSIMNI = { lat: 37.56152, lng: 127.03648 };
const GANGNAM = { lat: 37.49794, lng: 127.02762 };
const AROUND_WANGSIMNI = "bounds=37.55,127.02,37.575,127.05";

test("비로그인도 매물 목록을 읽는다", async () => {
  const landlord = await createLandlord();
  await createListingAt({ ownerProfileId: landlord.profile.id, ...WANGSIMNI, name: "왕십리집" });

  const res = await get();
  expect(res.status).toBe(200);

  const body = (await res.json()) as SearchBody;
  expect(body.count).toBe(1);
  expect(body.listings[0]!.priceLabel).toBe("월세 1,000만/50만");
  expect(body.listings[0]!.pinLabel).toBe("월 50만");
  // 공개 목록에는 등록자 이름이 실리지 않는다
  expect(JSON.stringify(body)).not.toContain("김임대");
});

test("bounds 안의 매물만 준다 — 밖은 빠진다", async () => {
  const landlord = await createLandlord();
  await createListingAt({ ownerProfileId: landlord.profile.id, ...WANGSIMNI, name: "왕십리집" });
  await createListingAt({ ownerProfileId: landlord.profile.id, ...GANGNAM, name: "강남집" });

  expect(await names()).toHaveLength(2);
  expect(await names(`?${AROUND_WANGSIMNI}`)).toEqual(["왕십리집"]);
  expect(await names("?bounds=37.49,127.02,37.50,127.03")).toEqual(["강남집"]);
});

test("경계에 정확히 걸린 매물은 포함한다(화면 판정과 같은 규칙)", async () => {
  const landlord = await createLandlord();
  await createListingAt({ ownerProfileId: landlord.profile.id, lat: 37.55, lng: 127.02, name: "모서리집" });

  expect(await names(`?${AROUND_WANGSIMNI}`)).toEqual(["모서리집"]);
});

test("OPEN 만 노출한다 — 예약·종료는 빠진다", async () => {
  const landlord = await createLandlord();
  await createListingAt({ ownerProfileId: landlord.profile.id, ...WANGSIMNI, name: "공개집" });
  await createListingAt({
    ownerProfileId: landlord.profile.id,
    ...WANGSIMNI,
    name: "예약집",
    status: "RESERVED",
  });
  await createListingAt({
    ownerProfileId: landlord.profile.id,
    ...WANGSIMNI,
    name: "종료집",
    status: "CLOSED",
  });

  expect(await names(`?${AROUND_WANGSIMNI}`)).toEqual(["공개집"]);
});

test("필터 조합 — 거래유형·보증금·월세", async () => {
  const landlord = await createLandlord();
  await createListingAt({
    ownerProfileId: landlord.profile.id,
    ...WANGSIMNI,
    name: "전세집",
    dealType: "JEONSE",
    deposit: 250_000_000,
    monthlyRent: 0,
  });
  await createListingAt({
    ownerProfileId: landlord.profile.id,
    ...WANGSIMNI,
    name: "싼월세",
    deposit: 5_000_000,
    monthlyRent: 300_000,
  });
  await createListingAt({
    ownerProfileId: landlord.profile.id,
    ...WANGSIMNI,
    name: "비싼월세",
    deposit: 50_000_000,
    monthlyRent: 900_000,
  });

  expect((await names("?dealType=JEONSE")).sort()).toEqual(["전세집"]);
  expect((await names("?dealType=WOLSE")).sort()).toEqual(["비싼월세", "싼월세"].sort());
  expect((await names("?depositMax=10000000")).sort()).toEqual(["싼월세"]);
  expect((await names("?rentMax=500000")).sort()).toEqual(["전세집", "싼월세"].sort());
  // 조합: 월세이면서 월세 50만 이하
  expect(await names("?dealType=WOLSE&rentMax=500000")).toEqual(["싼월세"]);
  // 조합: 보증금 범위 + 월세 상한 (전세집은 보증금 2억 5,000만이라 상한에서 빠진다)
  expect(await names("?depositMin=10000000&depositMax=100000000&rentMax=1000000")).toEqual([
    "비싼월세",
  ]);
});

test("월세 하한을 걸면 전세(월세 0원)는 자동으로 빠진다", async () => {
  const landlord = await createLandlord();
  await createListingAt({
    ownerProfileId: landlord.profile.id,
    ...WANGSIMNI,
    name: "전세집",
    dealType: "JEONSE",
    deposit: 250_000_000,
    monthlyRent: 0,
  });
  await createListingAt({ ownerProfileId: landlord.profile.id, ...WANGSIMNI, name: "월세집" });

  expect(await names("?rentMin=1")).toEqual(["월세집"]);
});

test("잘못된 bounds 는 400", async () => {
  for (const query of [
    "?bounds=37.55,127.02,37.575",            // 개수 부족
    "?bounds=37.55,,37.575,127.05",           // 빈 칸을 0 으로 읽지 않는다
    "?bounds=37.575,127.02,37.55,127.05",     // 남서/북동 뒤집힘
    "?bounds=서울,127.02,37.575,127.05",       // 숫자가 아님
    "?bounds=",                                // 빈 값
  ]) {
    const res = await get(query);
    expect(res.status, query).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  }
});

test("잘못된 필터 값은 400 — 빈 값을 0 으로 읽지 않는다", async () => {
  expect((await get("?depositMax=")).status).toBe(400);
  expect((await get("?depositMax=천만원")).status).toBe(400);
  expect((await get("?depositMax=10000000.5")).status).toBe(400);
  expect((await get("?dealType=MONTHLY")).status).toBe(400);
});

test("최소가 최대보다 크면 400", async () => {
  const res = await get("?depositMin=20000000&depositMax=10000000");
  expect(res.status).toBe(400);
  expect((await res.json()).error.message).toContain("보증금 최소 금액");

  expect((await get("?rentMin=700000&rentMax=500000")).status).toBe(400);
});

test("limit 경계 — 넘치면 잘리고 truncated 를 알린다", async () => {
  const landlord = await createLandlord();
  await createListingAt({ ownerProfileId: landlord.profile.id, ...WANGSIMNI, name: "집1" });
  await createListingAt({ ownerProfileId: landlord.profile.id, ...WANGSIMNI, name: "집2" });

  const one = (await (await get("?limit=1")).json()) as SearchBody;
  expect(one.count).toBe(1);
  expect(one.truncated).toBe(true);
  expect(one.limit).toBe(1);

  const two = (await (await get("?limit=2")).json()) as SearchBody;
  expect(two.count).toBe(2);
  expect(two.truncated).toBe(false);

  expect((await get("?limit=0")).status).toBe(400);
  expect((await get("?limit=201")).status).toBe(400);
});

test("bounds 가 없으면 영역 제한 없이 최신순으로 준다", async () => {
  const landlord = await createLandlord();
  await createListingAt({ ownerProfileId: landlord.profile.id, ...WANGSIMNI, name: "먼저" });
  await createListingAt({ ownerProfileId: landlord.profile.id, ...GANGNAM, name: "나중" });

  const body = (await (await get()).json()) as SearchBody;
  expect(body.bounds).toBeNull();
  expect(body.listings.map((listing) => listing.building.name)).toEqual(["나중", "먼저"]);
});

test("통근 배지(T3.5 자리) — 내 근무지의 캐시만 붙고, 남의 근무지는 조용히 무시한다", async () => {
  const landlord = await createLandlord();
  const created = await createListingAt({
    ownerProfileId: landlord.profile.id,
    ...WANGSIMNI,
    name: "왕십리집",
  });

  const tenant = await createTenantOnlyUser();
  const mine = await prisma.workplace.create({
    data: {
      tenantProfileId: tenant.profile.id,
      label: "회사",
      address: "서울 강남구 강남대로 396",
      lat: 37.49794,
      lng: 127.02762,
    },
  });
  await prisma.commuteCache.create({
    data: { unitId: created.unit.id, workplaceId: mine.id, transitMinutes: 38, drivingMinutes: 21 },
  });

  const other = await createTenantOnlyUser("01088888888", "남세입");
  const theirs = await prisma.workplace.create({
    data: {
      tenantProfileId: other.profile.id,
      label: "남의회사",
      address: "서울 강남구 강남대로 396",
      lat: 37.49794,
      lng: 127.02762,
    },
  });

  // 비로그인은 근무지를 지정해도 무시된다
  const anonymous = (await (await get(`?workplaceId=${mine.id}`)).json()) as SearchBody;
  expect(anonymous.commuteWorkplaceId).toBeNull();
  expect(anonymous.listings[0]!.commute).toBeNull();

  await loginAs(tenant.user.id);

  const withBadge = (await (await get(`?workplaceId=${mine.id}`)).json()) as SearchBody;
  expect(withBadge.commuteWorkplaceId).toBe(mine.id);
  expect(withBadge.listings[0]!.commute).toMatchObject({
    workplaceLabel: "회사",
    transitMinutes: 38,
  });

  // 남의 근무지는 403 이 아니라 조용히 무시한다(존재 여부를 알려 주지 않는다)
  const foreign = (await (await get(`?workplaceId=${theirs.id}`)).json()) as SearchBody;
  expect(foreign.commuteWorkplaceId).toBeNull();
  expect(foreign.listings[0]!.commute).toBeNull();

  // 근무지를 지정하지 않으면 배지도 없다
  const none = (await (await get()).json()) as SearchBody;
  expect(none.listings[0]!.commute).toBeNull();
});
