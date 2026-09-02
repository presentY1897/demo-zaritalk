/**
 * `GET /api/brokerage-requests/preview` 테스트 (T3.6).
 *
 * 핵심은 **미리보기 = 실제 발송 대상**이라는 것 — 두 경로가 같은 함수를 쓰는지 여기서 확인한다.
 * 그리고 미리보기에는 **연락처가 없어야 한다**(수락 전에 명부를 넘겨주지 않는다).
 */
import { LeaseStatus, prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  createBrokerageScene,
  createRealtorWithDetail,
} from "@/features/brokerage/testing";
import {
  createBuildingWithUnits,
  createLandlord,
  createLease,
  createTenantOnlyUser,
  loginAs,
} from "@/features/landlord/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { POST as createRequest } from "../route";
import { GET } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

function preview(unitId?: string): Promise<Response> {
  const query = unitId === undefined ? "" : `?unitId=${encodeURIComponent(unitId)}`;
  return GET(new Request(`http://localhost/api/brokerage-requests/preview${query}`));
}

test("비로그인이면 401", async () => {
  const scene = await createBrokerageScene();
  expect((await preview(scene.unit.id)).status).toBe(401);
});

test("임대인 프로필이 없으면 403", async () => {
  const scene = await createBrokerageScene();
  const tenant = await createTenantOnlyUser();
  await loginAs(tenant.user.id);
  expect((await preview(scene.unit.id)).status).toBe(403);
});

test("unitId 가 없으면 400", async () => {
  const scene = await createBrokerageScene();
  await loginAs(scene.user.id);
  const res = await preview();
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
});

test("없는 호실이면 404, 남의 호실이면 403", async () => {
  const scene = await createBrokerageScene();
  const other = await createLandlord("01099999999", "남임대");
  const otherBuilding = await createBuildingWithUnits(other.profile.id, ["301호"], "남의빌라");
  await loginAs(scene.user.id);

  expect((await preview("cmf0notexist")).status).toBe(404);
  expect((await preview(otherBuilding.units[0]!.id)).status).toBe(403);
});

test("반경 안 중개인을 거리순으로 준다 — 연락처는 담지 않는다", async () => {
  const scene = await createBrokerageScene();
  await createRealtorWithDetail("01044444444", {
    distanceKm: 2.5,
    radiusKm: 3,
    officeName: "먼사무소",
  });
  await createRealtorWithDetail("01033333333", {
    distanceKm: 1,
    radiusKm: 3,
    officeName: "가까운사무소",
  });
  await createRealtorWithDetail("01055555555", { distanceKm: 30, radiusKm: 3 }); // 반경 밖
  await loginAs(scene.user.id);

  const res = await preview(scene.unit.id);
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body.count).toBe(2);
  expect(body.limit).toBe(20);
  expect(body.blockedReason).toBeNull();
  expect(body.openRequestId).toBeNull();
  expect(body.unit.unitLabel).toBe("101호");
  expect(body.realtors.map((r: { officeName: string }) => r.officeName)).toEqual([
    "가까운사무소",
    "먼사무소",
  ]);

  // 이름·전화번호가 새어 나가지 않는다
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain("01033333333");
  expect(serialized).not.toContain("이중개");
  expect(body.realtors[0]).not.toHaveProperty("phone");
  expect(body.realtors[0]).not.toHaveProperty("name");

  // 아무 것도 쓰지 않는다
  expect(await prisma.brokerageTarget.count()).toBe(0);
  expect(await prisma.brokerageRequest.count()).toBe(0);
});

test("미리보기 인원이 곧 발송 인원이다", async () => {
  const scene = await createBrokerageScene();
  for (let index = 0; index < 5; index += 1) {
    await createRealtorWithDetail(`0102000${String(index).padStart(4, "0")}`, {
      distanceKm: 1 + index * 0.3,
      radiusKm: 3,
    });
  }
  await createRealtorWithDetail("01055555555", { distanceKm: 30, radiusKm: 3 });
  await loginAs(scene.user.id);

  const before = await (await preview(scene.unit.id)).json();
  const created = await createRequest(
    new Request("http://localhost/api/brokerage-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitId: scene.unit.id }),
    }),
  );
  const body = await created.json();

  expect(before.count).toBe(5);
  expect(body.dispatchedCount).toBe(before.count);
  expect(body.request.targetCount).toBe(before.count);

  const targets = await prisma.brokerageTarget.findMany({ orderBy: { distanceKm: "asc" } });
  expect(targets.map((target) => target.realtorProfileId)).toEqual(
    before.realtors.map((realtor: { profileId: string }) => realtor.profileId),
  );
});

test("계약중 호실은 409 가 아니라 200 + blockedReason — 화면이 사유를 그린다", async () => {
  const scene = await createBrokerageScene();
  await createRealtorWithDetail("01033333333", { distanceKm: 1, radiusKm: 3 });
  await createLease(scene.unit.id, LeaseStatus.ACTIVE);
  await loginAs(scene.user.id);

  const res = await preview(scene.unit.id);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.blockedReason).toContain("계약이 있는 호실");
});

test("이미 열린 요청이 있으면 openRequestId 가 온다 (재발송 안내)", async () => {
  const scene = await createBrokerageScene();
  await createRealtorWithDetail("01033333333", { distanceKm: 1, radiusKm: 3 });
  await loginAs(scene.user.id);
  await createRequest(
    new Request("http://localhost/api/brokerage-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitId: scene.unit.id }),
    }),
  );

  const body = await (await preview(scene.unit.id)).json();
  expect(body.openRequestId).not.toBeNull();
});
