/**
 * `GET /api/realtor/inbox` 테스트 (T3.7).
 *
 * 거리는 **발송 시점에 굳은 값**이고, 임대인 연락처는 **수락 뒤에만** 온다 —
 * 두 가지가 이 라우트의 계약이라 여기서 못 박는다.
 */
import { BrokerageTargetStatus, LeaseStatus } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { dispatchBrokerageTargets } from "@/features/brokerage/matching";
import {
  addBrokerageRequest,
  addBrokerageTarget,
  createBrokerageScene,
  createRealtorWithDetail,
  createRealtorWithoutDetail,
} from "@/features/brokerage/testing";
import { createLandlord, createLease, loginAs } from "@/features/landlord/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { GET } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

test("비로그인이면 401", async () => {
  expect((await GET()).status).toBe(401);
});

test("중개인 프로필이 없으면 403", async () => {
  const landlord = await createLandlord();
  await loginAs(landlord.user.id);
  expect((await GET()).status).toBe(403);
});

test("활동지역을 등록하지 않은 중개인도 403", async () => {
  const bare = await createRealtorWithoutDetail();
  await loginAs(bare.user.id);
  const res = await GET();
  expect(res.status).toBe(403);
  expect((await res.json()).error.message).toContain("활동반경");
});

test("나에게 온 요청만, 발송 시점 거리와 함께 준다", async () => {
  const scene = await createBrokerageScene();
  const mine = await createRealtorWithDetail("01033333333", { distanceKm: 1, radiusKm: 3 });
  await createRealtorWithDetail("01044444444", { distanceKm: 2, radiusKm: 3, name: "남중개" });
  const request = await addBrokerageRequest(scene, { message: "즉시 입주 가능합니다." });
  await dispatchBrokerageTargets(request.id);

  await loginAs(mine.user.id);
  const res = await GET();
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body.requests).toHaveLength(1);
  const item = body.requests[0];
  expect(item.place.unitLabel).toBe("101호");
  expect(item.message).toBe("즉시 입주 가능합니다.");
  expect(item.status).toBe("SENT");
  expect(item.distanceKm).toBeGreaterThan(0.99);
  expect(item.distanceKm).toBeLessThan(1.01);
  expect(item.landlord.name).toBe("김임대");
  // 수락 전에는 연락처가 없다
  expect(item.landlord.phone).toBeNull();
  expect(item.canCreateListing).toBe(false);
  expect(item.listingBlockedReason).toContain("수락");

  expect(body.realtor.officeName).toBe("왕십리공인중개사");
  expect(body.realtor.radiusKm).toBe(3);
});

test("남의 중개인에게 간 요청은 보이지 않는다", async () => {
  const scene = await createBrokerageScene();
  await createRealtorWithDetail("01044444444", { distanceKm: 1, radiusKm: 3, name: "남중개" });
  const request = await addBrokerageRequest(scene);
  await dispatchBrokerageTargets(request.id);

  // 반경 밖이라 요청을 받지 못한 중개인
  const outsider = await createRealtorWithDetail("01033333333", { distanceKm: 30, radiusKm: 3 });
  await loginAs(outsider.user.id);

  expect((await (await GET()).json()).requests).toEqual([]);
});

test("수락한 요청은 임대인 연락처와 매물 등록 가능 여부가 함께 온다", async () => {
  const scene = await createBrokerageScene();
  const realtor = await createRealtorWithDetail("01033333333", { distanceKm: 1, radiusKm: 3 });
  const request = await addBrokerageRequest(scene);
  await addBrokerageTarget(request.id, realtor.profile.id, {
    status: BrokerageTargetStatus.ACCEPTED,
  });

  await loginAs(realtor.user.id);
  const item = (await (await GET()).json()).requests[0];
  expect(item.landlord.phone).toBe(scene.user.phone);
  expect(item.canCreateListing).toBe(true);
  expect(item.listingBlockedReason).toBeNull();
});

test("수락했어도 계약이 잡힌 호실이면 매물을 올릴 수 없다 (T3.1 문구를 그대로 쓴다)", async () => {
  const scene = await createBrokerageScene();
  const realtor = await createRealtorWithDetail("01033333333", { distanceKm: 1, radiusKm: 3 });
  const request = await addBrokerageRequest(scene);
  await addBrokerageTarget(request.id, realtor.profile.id, {
    status: BrokerageTargetStatus.ACCEPTED,
  });
  await createLease(scene.unit.id, LeaseStatus.ACTIVE);

  await loginAs(realtor.user.id);
  const item = (await (await GET()).json()).requests[0];
  expect(item.canCreateListing).toBe(false);
  expect(item.listingBlockedReason).toContain("계약이 있는 호실");
});

test("최신 요청이 위로 온다", async () => {
  const scene = await createBrokerageScene("01011111111", ["101호", "102호"]);
  const realtor = await createRealtorWithDetail("01033333333", { distanceKm: 1, radiusKm: 3 });

  const older = await addBrokerageRequest(scene, { unitId: scene.units[0]!.id });
  await addBrokerageTarget(older.id, realtor.profile.id);
  const newer = await addBrokerageRequest(scene, { unitId: scene.units[1]!.id });
  await addBrokerageTarget(newer.id, realtor.profile.id);

  await loginAs(realtor.user.id);
  const body = await (await GET()).json();
  expect(body.requests.map((item: { requestId: string }) => item.requestId)).toEqual([
    newer.id,
    older.id,
  ]);
});
