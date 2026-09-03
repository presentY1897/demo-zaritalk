import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { COMMUTE_PARTIAL_TTL_MS, COMMUTE_TTL_MS } from "@/features/commute/cache";
import { DIRECTIONS_NO_ROUTE, DIRECTIONS_OK, jsonResponse } from "@/features/commute/testing";
import { estimateTransit } from "@/features/commute/transit";
import { createLandlord, createTenantOnlyUser, loginAs } from "@/features/landlord/testing";
import { createListingAt } from "@/features/listing/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { POST } from "./route";

/**
 * `POST /api/commute` (T3.5).
 *
 * **카카오모빌리티는 전부 mock 한다** — 테스트가 네트워크·쿼터·키에 매달리면 안 된다.
 * 대중교통은 원래 모의 제공자(D9)라 그대로 돈다: 값이 좌표만의 함수라 단언할 수 있다.
 * "두 이동수단 모두 실패" 경로는 대중교통이 모의인 동안 **구조적으로 도달할 수 없어**
 * `features/commute/service.test.ts` 가 제공자를 주입해 지킨다.
 */
vi.mock("next/headers", () => import("@/lib/auth/testing"));

const TEST_KEY = "test-rest-key";
const originalFetch = globalThis.fetch;
const originalKey = process.env.KAKAO_REST_API_KEY;

/** 행당해피빌(시드 건물) */
const HAENGDANG = { lat: 37.56152, lng: 127.03648 };
/** 강남역(시드 근무지) */
const GANGNAM = { lat: 37.49794, lng: 127.02762 };
/** 카카오 픽스처가 말하는 자동차 분 — 1679초 → 28분 */
const CAR_MINUTES = 28;
/** 모의 대중교통이 이 쌍에 대해 내는 분(결정적이라 미리 계산할 수 있다) */
const TRANSIT_MINUTES = estimateTransit(HAENGDANG, GANGNAM).minutes;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
  process.env.KAKAO_REST_API_KEY = TEST_KEY;
  fetchMock = vi.fn().mockResolvedValue(jsonResponse(DIRECTIONS_OK));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.KAKAO_REST_API_KEY;
  else process.env.KAKAO_REST_API_KEY = originalKey;
  vi.restoreAllMocks();
});

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/commute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** 매물이 붙은 호실 + 로그인 세입자 + 그 세입자의 근무지 */
async function setup(options: { unitAt?: { lat: number; lng: number }; workplaceAt?: { lat: number; lng: number } } = {}) {
  const landlord = await createLandlord();
  const tenant = await createTenantOnlyUser("01022222222", "박세입");
  const { unit } = await createListingAt({
    ownerProfileId: landlord.profile.id,
    ...(options.unitAt ?? HAENGDANG),
  });
  const workplace = await prisma.workplace.create({
    data: {
      tenantProfileId: tenant.profile.id,
      label: "회사",
      address: "서울 강남구 강남대로 396",
      ...(options.workplaceAt ?? GANGNAM),
    },
  });
  return { landlord, tenant, unit, workplace };
}

/* ------------------------------------------------------------------ */
/* 권한                                                                */
/* ------------------------------------------------------------------ */

test("비로그인이면 401 — 외부 호출도 하지 않는다", async () => {
  const { unit, workplace } = await setup();

  const res = await post({ unitId: unit.id, workplaceId: workplace.id });
  expect(res.status).toBe(401);
  expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("세입자 프로필이 없는 계정(임대인)이면 403", async () => {
  const { landlord, unit, workplace } = await setup();
  await loginAs(landlord.user.id);

  const res = await post({ unitId: unit.id, workplaceId: workplace.id });
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe("FORBIDDEN");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("남의 근무지면 403 · 없는 근무지면 404 — 캐시도 만들지 않는다", async () => {
  const { tenant, unit } = await setup();
  const other = await createTenantOnlyUser("01088888888", "남세입");
  const foreign = await prisma.workplace.create({
    data: {
      tenantProfileId: other.profile.id,
      label: "남의회사",
      address: "서울 마포구 양화로 160",
      lat: 37.5572,
      lng: 126.9245,
    },
  });
  await loginAs(tenant.user.id);

  const forbidden = await post({ unitId: unit.id, workplaceId: foreign.id });
  expect(forbidden.status).toBe(403);
  expect((await forbidden.json()).error.code).toBe("FORBIDDEN");

  const missing = await post({ unitId: unit.id, workplaceId: "cmf0nope" });
  expect(missing.status).toBe(404);

  expect(await prisma.commuteCache.count()).toBe(0);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("본문이 비었거나 id 가 너무 길면 400", async () => {
  const { tenant, unit, workplace } = await setup();
  await loginAs(tenant.user.id);

  expect((await post({})).status).toBe(400);
  expect((await post({ unitId: unit.id })).status).toBe(400);
  expect((await post({ unitId: "", workplaceId: workplace.id })).status).toBe(400);
  expect((await post({ unitId: "a".repeat(65), workplaceId: workplace.id })).status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("매물이 없는 호실·없는 호실은 404 — 아무 호실이나 계산시킬 수 없다", async () => {
  const { landlord, tenant, workplace } = await setup();
  await loginAs(tenant.user.id);

  // 매물이 붙지 않은 빈 호실
  const building = await prisma.building.create({
    data: {
      ownerProfileId: landlord.profile.id,
      name: "매물없는빌",
      address: "서울 성동구 행당로 80",
      lat: 37.5616,
      lng: 127.0365,
      units: { create: [{ label: "201호" }] },
    },
    include: { units: true },
  });

  const bare = await post({ unitId: building.units[0]!.id, workplaceId: workplace.id });
  expect(bare.status).toBe(404);

  const missing = await post({ unitId: "cmf0nope", workplaceId: workplace.id });
  expect(missing.status).toBe(404);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("좌표가 대한민국 범위 밖이면 400 — 외부에 이상값을 보내 쿼터를 태우지 않는다", async () => {
  // 도쿄 좌표로 등록된 건물(시드·수기 데이터가 섞일 수 있다)
  const { tenant, unit, workplace } = await setup({ unitAt: { lat: 35.6812, lng: 139.7671 } });
  await loginAs(tenant.user.id);

  const res = await post({ unitId: unit.id, workplaceId: workplace.id });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await prisma.commuteCache.count()).toBe(0);
});

/* ------------------------------------------------------------------ */
/* 조회 · 캐시                                                          */
/* ------------------------------------------------------------------ */

test("캐시 미스면 두 이동수단을 계산해 upsert 한다 — 대중교통은 모의로 표시된다", async () => {
  const { tenant, unit, workplace } = await setup();
  await loginAs(tenant.user.id);

  const res = await post({ unitId: unit.id, workplaceId: workplace.id });
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body.unitId).toBe(unit.id);
  expect(body.cached).toBe(false);
  expect(body.failures).toEqual([]);
  expect(body.commute).toMatchObject({
    workplaceId: workplace.id,
    workplaceLabel: "회사",
    transitMinutes: TRANSIT_MINUTES,
    drivingMinutes: CAR_MINUTES,
    mockModes: ["transit"],
  });

  // 자동차만 외부를 부른다(대중교통은 모의 제공자다)
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String((fetchMock.mock.calls[0] as [URL])[0])).toContain("apis-navi.kakaomobility.com");

  const row = await prisma.commuteCache.findUnique({
    where: { unitId_workplaceId: { unitId: unit.id, workplaceId: workplace.id } },
  });
  expect(row?.transitMinutes).toBe(TRANSIT_MINUTES);
  expect(row?.drivingMinutes).toBe(CAR_MINUTES);
  expect(row?.transitDetail).toMatchObject({ provider: "mock-transit", mock: true });
  expect(row?.drivingDetail).toMatchObject({ provider: "kakao-mobility", mock: false });
});

test("캐시 히트면 외부를 부르지 않는다", async () => {
  const { tenant, unit, workplace } = await setup();
  await loginAs(tenant.user.id);

  const first = await post({ unitId: unit.id, workplaceId: workplace.id });
  expect((await first.json()).cached).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  const second = await post({ unitId: unit.id, workplaceId: workplace.id });
  const body = await second.json();
  expect(second.status).toBe(200);
  expect(body.cached).toBe(true);
  expect(body.commute.drivingMinutes).toBe(CAR_MINUTES);
  // 두 번째 요청에서 외부 호출이 늘지 않았다
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(await prisma.commuteCache.count()).toBe(1);
});

test("TTL(7일)이 지나면 다시 계산해 같은 행을 갱신한다", async () => {
  const { tenant, unit, workplace } = await setup();
  await loginAs(tenant.user.id);

  await post({ unitId: unit.id, workplaceId: workplace.id });
  expect(fetchMock).toHaveBeenCalledTimes(1);

  const stale = new Date(Date.now() - COMMUTE_TTL_MS - 60_000);
  await prisma.commuteCache.update({
    where: { unitId_workplaceId: { unitId: unit.id, workplaceId: workplace.id } },
    data: { fetchedAt: stale },
  });

  const res = await post({ unitId: unit.id, workplaceId: workplace.id });
  const body = await res.json();
  expect(body.cached).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(2);

  // 행이 늘지 않고 `fetchedAt` 만 밀린다
  expect(await prisma.commuteCache.count()).toBe(1);
  const row = await prisma.commuteCache.findFirst();
  expect(row!.fetchedAt.getTime()).toBeGreaterThan(stale.getTime());
});

test("자동차가 실패하면 대중교통만 저장한다 — 부분 결과", async () => {
  const { tenant, unit, workplace } = await setup();
  await loginAs(tenant.user.id);
  fetchMock.mockResolvedValue(jsonResponse({ code: -401, msg: "wrong appKey" }, 401));

  const res = await post({ unitId: unit.id, workplaceId: workplace.id });
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body.commute.transitMinutes).toBe(TRANSIT_MINUTES);
  expect(body.commute.drivingMinutes).toBeNull();
  expect(body.failures).toEqual([{ mode: "car", reason: "UNAUTHORIZED", status: 401 }]);

  const row = await prisma.commuteCache.findFirst();
  expect(row?.transitMinutes).toBe(TRANSIT_MINUTES);
  expect(row?.drivingMinutes).toBeNull();
  // 실패한 칸에도 사유가 남는다
  expect(row?.drivingDetail).toMatchObject({ failed: true, reason: "UNAUTHORIZED" });
});

test("키가 없어도 화면은 죽지 않는다 — 자동차만 비고 대중교통은 나온다", async () => {
  const { tenant, unit, workplace } = await setup();
  await loginAs(tenant.user.id);
  delete process.env.KAKAO_REST_API_KEY;

  const res = await post({ unitId: unit.id, workplaceId: workplace.id });
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body.commute.transitMinutes).toBe(TRANSIT_MINUTES);
  expect(body.commute.drivingMinutes).toBeNull();
  expect(body.failures).toEqual([{ mode: "car", reason: "NO_KEY", status: null }]);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("부분 결과는 1시간만 캐시한다 — 그 안에는 재시도하지 않고, 지나면 다시 부른다", async () => {
  const { tenant, unit, workplace } = await setup();
  await loginAs(tenant.user.id);
  fetchMock.mockResolvedValue(jsonResponse(DIRECTIONS_NO_ROUTE));

  await post({ unitId: unit.id, workplaceId: workplace.id });
  expect(fetchMock).toHaveBeenCalledTimes(1);

  // 30분 전 행 — 아직 참는다
  await prisma.commuteCache.update({
    where: { unitId_workplaceId: { unitId: unit.id, workplaceId: workplace.id } },
    data: { fetchedAt: new Date(Date.now() - 30 * 60_000) },
  });
  const within = await post({ unitId: unit.id, workplaceId: workplace.id });
  expect((await within.json()).cached).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  // 1시간이 지나면 다시 부른다. 이번엔 자동차도 성공한다
  await prisma.commuteCache.update({
    where: { unitId_workplaceId: { unitId: unit.id, workplaceId: workplace.id } },
    data: { fetchedAt: new Date(Date.now() - COMMUTE_PARTIAL_TTL_MS - 60_000) },
  });
  fetchMock.mockResolvedValue(jsonResponse(DIRECTIONS_OK));

  const after = await post({ unitId: unit.id, workplaceId: workplace.id });
  const body = await after.json();
  expect(body.cached).toBe(false);
  expect(body.commute.drivingMinutes).toBe(CAR_MINUTES);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("모의 대중교통 값은 다시 계산해도 같다 — 캐시를 지웠다 채워도 배지가 흔들리지 않는다", async () => {
  const { tenant, unit, workplace } = await setup();
  await loginAs(tenant.user.id);

  const first = await (await post({ unitId: unit.id, workplaceId: workplace.id })).json();
  await prisma.commuteCache.deleteMany();
  const second = await (await post({ unitId: unit.id, workplaceId: workplace.id })).json();

  expect(second.cached).toBe(false);
  expect(second.commute.transitMinutes).toBe(first.commute.transitMinutes);
});

test("근무지를 지우면 캐시도 함께 사라진다 (스키마 cascade)", async () => {
  const { tenant, unit, workplace } = await setup();
  await loginAs(tenant.user.id);

  await post({ unitId: unit.id, workplaceId: workplace.id });
  expect(await prisma.commuteCache.count()).toBe(1);

  await prisma.workplace.delete({ where: { id: workplace.id } });
  expect(await prisma.commuteCache.count()).toBe(0);
  // 호실은 그대로다
  expect(await prisma.unit.count({ where: { id: unit.id } })).toBe(1);
});
