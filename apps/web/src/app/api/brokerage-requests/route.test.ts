/**
 * `GET·POST /api/brokerage-requests` 테스트 (T3.6).
 *
 * task 최소 테스트 중 **계약중 호실 거부 · 비로그인 401 · 없는 id 404 · 재발송 시 중복 타겟 없음**
 * 이 여기 있다(반경 매칭 4종은 `features/brokerage/matching.test.ts`).
 */
import { BrokerageRequestStatus, LeaseStatus, prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  addBrokerageRequest,
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
import { GET, POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/brokerage-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

test("비로그인이면 401", async () => {
  const scene = await createBrokerageScene();
  const res = await post({ unitId: scene.unit.id });
  expect(res.status).toBe(401);
  expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  expect((await GET()).status).toBe(401);
});

test("임대인 프로필이 없으면 403", async () => {
  const scene = await createBrokerageScene();
  const tenant = await createTenantOnlyUser();
  await loginAs(tenant.user.id);

  const res = await post({ unitId: scene.unit.id });
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe("FORBIDDEN");
});

test("없는 호실이면 404", async () => {
  const scene = await createBrokerageScene();
  await loginAs(scene.user.id);

  const res = await post({ unitId: "cmf0notexist" });
  expect(res.status).toBe(404);
  expect((await res.json()).error.code).toBe("NOT_FOUND");
});

test("남의 호실이면 403", async () => {
  const scene = await createBrokerageScene();
  const other = await createLandlord("01099999999", "남임대");
  const otherBuilding = await createBuildingWithUnits(other.profile.id, ["301호"], "남의빌라");
  await loginAs(scene.user.id);

  const res = await post({ unitId: otherBuilding.units[0]!.id });
  expect(res.status).toBe(403);
});

test("메시지가 500자를 넘으면 400", async () => {
  const scene = await createBrokerageScene();
  await loginAs(scene.user.id);

  const res = await post({ unitId: scene.unit.id, message: "가".repeat(501) });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
});

test("공실 호실이면 201 — 반경 안 중개인에게 그 자리에서 발송된다", async () => {
  const scene = await createBrokerageScene();
  const realtor = await createRealtorWithDetail("01033333333", { distanceKm: 1, radiusKm: 3 });
  await createRealtorWithDetail("01055555555", { distanceKm: 20, radiusKm: 3 }); // 반경 밖
  await loginAs(scene.user.id);

  const res = await post({ unitId: scene.unit.id, message: "즉시 입주 가능합니다." });
  expect(res.status).toBe(201);

  const body = await res.json();
  expect(body.dispatchedCount).toBe(1);
  expect(body.reused).toBe(false);
  expect(body.request.status).toBe("OPEN");
  expect(body.request.targetCount).toBe(1);
  expect(body.request.counts).toEqual({ SENT: 1, VIEWED: 0, ACCEPTED: 0, DECLINED: 0 });
  expect(body.request.place.unitLabel).toBe("101호");
  expect(body.request.accepted).toEqual([]);

  const target = await prisma.brokerageTarget.findFirstOrThrow();
  expect(target.realtorProfileId).toBe(realtor.profile.id);
});

test("계약중(ACTIVE) 호실이면 409", async () => {
  const scene = await createBrokerageScene();
  await createLease(scene.unit.id, LeaseStatus.ACTIVE);
  await loginAs(scene.user.id);

  const res = await post({ unitId: scene.unit.id });
  expect(res.status).toBe(409);
  expect((await res.json()).error.message).toContain("계약이 있는 호실");
  expect(await prisma.brokerageRequest.count()).toBe(0);
});

test("세입자 연결 대기(PENDING_TENANT) 호실도 409 — 이미 계약이 잡힌 집이다", async () => {
  const scene = await createBrokerageScene();
  await createLease(scene.unit.id, LeaseStatus.PENDING_TENANT);
  await loginAs(scene.user.id);

  expect((await post({ unitId: scene.unit.id })).status).toBe(409);
});

test("종료된 계약만 있으면 공실이라 요청할 수 있다", async () => {
  const scene = await createBrokerageScene();
  await createLease(scene.unit.id, LeaseStatus.ENDED);
  await loginAs(scene.user.id);

  expect((await post({ unitId: scene.unit.id })).status).toBe(201);
});

test("같은 호실에 다시 보내면 새 요청을 만들지 않고 재발송한다 (중복 타겟 없음)", async () => {
  const scene = await createBrokerageScene();
  await createRealtorWithDetail("01033333333", { distanceKm: 1, radiusKm: 3 });
  await loginAs(scene.user.id);

  const first = await post({ unitId: scene.unit.id, message: "첫 요청" });
  expect(first.status).toBe(201);
  const firstBody = await first.json();

  const second = await post({ unitId: scene.unit.id, message: "다시 부탁드립니다." });
  expect(second.status).toBe(200);
  const secondBody = await second.json();

  expect(secondBody.reused).toBe(true);
  expect(secondBody.request.id).toBe(firstBody.request.id);
  // 이미 받은 중개인에게는 다시 가지 않는다
  expect(secondBody.dispatchedCount).toBe(0);
  expect(secondBody.request.message).toBe("다시 부탁드립니다.");
  expect(await prisma.brokerageRequest.count()).toBe(1);
  expect(await prisma.brokerageTarget.count()).toBe(1);
  expect(await prisma.messageLog.count()).toBe(1);
});

test("재발송은 그 사이 새로 반경에 들어온 중개인에게만 간다", async () => {
  const scene = await createBrokerageScene();
  await createRealtorWithDetail("01033333333", { distanceKm: 1, radiusKm: 3 });
  await loginAs(scene.user.id);
  await post({ unitId: scene.unit.id });

  await createRealtorWithDetail("01044444444", { distanceKm: 2, radiusKm: 3 });
  const body = await (await post({ unitId: scene.unit.id })).json();
  expect(body.dispatchedCount).toBe(1);
  expect(body.request.targetCount).toBe(2);
});

test("이미 매칭된 요청이 있으면 새 요청을 만든다", async () => {
  const scene = await createBrokerageScene();
  await addBrokerageRequest(scene, { status: BrokerageRequestStatus.MATCHED });
  await loginAs(scene.user.id);

  const res = await post({ unitId: scene.unit.id });
  expect(res.status).toBe(201);
  expect((await res.json()).reused).toBe(false);
  expect(await prisma.brokerageRequest.count()).toBe(2);
});

test("GET — 내 요청만 최신순으로, 공실 호실 후보와 함께 준다", async () => {
  const scene = await createBrokerageScene("01011111111", ["101호", "102호"]);
  const other = await createLandlord("01099999999", "남임대");
  const otherBuilding = await createBuildingWithUnits(other.profile.id, ["301호"], "남의빌라");
  await addBrokerageRequest({ profile: other.profile, unit: otherBuilding.units[0]! });

  // 102호는 계약중이라 후보에서 빠진다
  await createLease(scene.units[1]!.id, LeaseStatus.ACTIVE);
  await addBrokerageRequest(scene);
  await loginAs(scene.user.id);

  const body = await (await GET()).json();
  expect(body.requests).toHaveLength(1);
  expect(body.requests[0].place.unitLabel).toBe("101호");
  expect(body.units.map((unit: { unitLabel: string }) => unit.unitLabel)).toEqual(["101호"]);
  expect(body.units[0].openRequestId).toBe(body.requests[0].id);
});
