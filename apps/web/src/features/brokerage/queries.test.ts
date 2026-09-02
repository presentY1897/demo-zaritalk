/**
 * 서버 조회 테스트 (T3.6·T3.7) — 라우트가 없는 화면(`/realtor/listings`)과
 * 화면 전용 판정(공실 후보·타인 타겟 차단)을 여기서 검증한다.
 */
import { BrokerageTargetStatus, LeaseStatus } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test } from "vitest";
import { createListingRow } from "@/features/listing/testing";
import { createLease } from "@/features/landlord/testing";
import type { RealtorSession } from "./ownership";
import {
  getRealtorInboxItem,
  listBrokerageUnitOptions,
  listRealtorListings,
} from "./queries";
import {
  addBrokerageRequest,
  addBrokerageTarget,
  createBrokerageScene,
  createRealtorWithDetail,
} from "./testing";

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
});

/** 라우트 가드를 통과한 뒤의 세션 모양 — 조회 함수는 이 형태만 본다 */
function sessionOf(realtor: Awaited<ReturnType<typeof createRealtorWithDetail>>): RealtorSession {
  return {
    user: { id: realtor.user.id } as RealtorSession["user"],
    profile: realtor.profile,
    detail: realtor.detail,
  };
}

test("요청 시트 후보는 공실 호실뿐이다", async () => {
  const scene = await createBrokerageScene("01011111111", ["101호", "102호", "103호"]);
  await createLease(scene.units[1]!.id, LeaseStatus.ACTIVE);
  await createLease(scene.units[2]!.id, LeaseStatus.PENDING_TENANT);

  const options = await listBrokerageUnitOptions(scene.profile.id);
  expect(options.map((option) => option.unitLabel)).toEqual(["101호"]);
  expect(options[0]?.buildingName).toBe("행당해피빌");
  expect(options[0]?.openRequestId).toBeNull();
});

test("`/realtor/listings` — 내가 올린 매물과 수락 후 대기 중인 호실을 나눠 준다", async () => {
  const scene = await createBrokerageScene("01011111111", ["101호", "102호"]);
  const realtor = await createRealtorWithDetail("01033333333", { distanceKm: 1, radiusKm: 3 });
  const session = sessionOf(realtor);

  // 101호: 수락 + 내가 매물을 올렸다
  const first = await addBrokerageRequest(scene, { unitId: scene.units[0]!.id });
  await addBrokerageTarget(first.id, realtor.profile.id, {
    status: BrokerageTargetStatus.ACCEPTED,
  });
  await createListingRow(scene.units[0]!.id, realtor.profile.id);

  // 102호: 수락했지만 아직 안 올렸다
  const second = await addBrokerageRequest(scene, { unitId: scene.units[1]!.id });
  await addBrokerageTarget(second.id, realtor.profile.id, {
    status: BrokerageTargetStatus.ACCEPTED,
  });

  const result = await listRealtorListings(session);
  expect(result.listings.map((listing) => listing.place.unitLabel)).toEqual(["101호"]);
  expect(result.listings[0]?.status).toBe("OPEN");
  expect(result.pending.map((item) => item.place.unitLabel)).toEqual(["102호"]);
});

test("임대인이 올린 매물은 내 매물 목록에 들어오지 않는다", async () => {
  const scene = await createBrokerageScene();
  const realtor = await createRealtorWithDetail("01033333333", { distanceKm: 1, radiusKm: 3 });
  const request = await addBrokerageRequest(scene);
  await addBrokerageTarget(request.id, realtor.profile.id, {
    status: BrokerageTargetStatus.ACCEPTED,
  });
  await createListingRow(scene.unit.id, scene.profile.id);

  const result = await listRealtorListings(sessionOf(realtor));
  expect(result.listings).toEqual([]);
  // 살아 있는 매물이 이미 있으니 등록 대기에도 들어가지 않는다
  expect(result.pending).toEqual([]);
});

test("아직 수락하지 않은 요청은 등록 대기가 아니다", async () => {
  const scene = await createBrokerageScene();
  const realtor = await createRealtorWithDetail("01033333333", { distanceKm: 1, radiusKm: 3 });
  const request = await addBrokerageRequest(scene);
  await addBrokerageTarget(request.id, realtor.profile.id, {
    status: BrokerageTargetStatus.VIEWED,
  });

  const result = await listRealtorListings(sessionOf(realtor));
  expect(result.pending).toEqual([]);
});

test("남의 타겟은 상세로 읽을 수 없다 (화면은 404)", async () => {
  const scene = await createBrokerageScene();
  const mine = await createRealtorWithDetail("01033333333", { distanceKm: 1, radiusKm: 3 });
  const other = await createRealtorWithDetail("01044444444", {
    distanceKm: 1,
    radiusKm: 3,
    name: "남중개",
  });
  const request = await addBrokerageRequest(scene);
  const otherTarget = await addBrokerageTarget(request.id, other.profile.id);

  expect(await getRealtorInboxItem(sessionOf(mine), otherTarget.id)).toBeNull();
  expect(await getRealtorInboxItem(sessionOf(mine), "cmf0notexist")).toBeNull();
});
