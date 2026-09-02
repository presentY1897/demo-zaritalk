/**
 * `GET /api/master/feed` 테스트 (T5.2) — pull 피드.
 *
 * task 최소 테스트 세 가지가 여기 있다: **업종 불일치 제외 · 반경 밖 제외 · REQUESTED 만**.
 */
import { MasterCategory, prisma, ProfileType, WorkOrderStatus } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { createLandlord, loginAs } from "@/features/landlord/testing";
import {
  addWorkOrder,
  createMaster,
  createProMaster,
  createWorkOrderScene,
} from "@/features/workorder/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { GET } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const feed = () => GET();

test("비로그인이면 401", async () => {
  expect((await feed()).status).toBe(401);
});

test("마스터 프로필이 없으면 403", async () => {
  const landlord = await createLandlord();
  await loginAs(landlord.user.id);
  expect((await feed()).status).toBe(403);
});

test("업종·활동지역(MasterDetail)이 없으면 403", async () => {
  const user = await prisma.user.create({
    data: {
      phone: "01044444444",
      name: "미등록마스터",
      profiles: { create: { type: ProfileType.MASTER } },
    },
  });
  await loginAs(user.id);
  expect((await feed()).status).toBe(403);
});

test("내 업종 + 반경 안의 REQUESTED 의뢰가 보인다 (무료 마스터도 본다)", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const master = await createMaster("01044444444", {
    categories: [MasterCategory.REPAIR],
    distanceKm: 2,
    radiusKm: 5,
  }); // FREE

  await loginAs(master.user.id);
  const body = await (await feed()).json();

  expect(body.workOrders).toHaveLength(1);
  expect(body.workOrders[0].id).toBe(order.id);
  expect(body.workOrders[0].landlordName).toBe("김임대");
  expect(body.workOrders[0].distanceKm).toBeGreaterThan(1.9);
  expect(body.workOrders[0].distanceKm).toBeLessThan(2.1);
  expect(body.workOrders[0].recommended).toBe(false);
  expect(body.master.plan).toBe("FREE");
});

test("업종이 다른 의뢰는 제외된다", async () => {
  const scene = await createWorkOrderScene();
  await addWorkOrder(scene, { category: MasterCategory.CLEANING });
  const master = await createMaster("01044444444", { categories: [MasterCategory.REPAIR] });

  await loginAs(master.user.id);
  expect((await (await feed()).json()).workOrders).toHaveLength(0);
});

test("활동반경 밖의 의뢰는 제외된다", async () => {
  const scene = await createWorkOrderScene();
  await addWorkOrder(scene);
  const master = await createMaster("01044444444", { distanceKm: 8, radiusKm: 5 });

  await loginAs(master.user.id);
  expect((await (await feed()).json()).workOrders).toHaveLength(0);
});

test("REQUESTED 가 아닌 의뢰는 제외된다 (견적도착·배정·완료·취소)", async () => {
  const scene = await createWorkOrderScene();
  const requested = await addWorkOrder(scene, { description: "요청 중인 의뢰입니다." });
  for (const status of [
    WorkOrderStatus.QUOTED,
    WorkOrderStatus.ASSIGNED,
    WorkOrderStatus.DONE,
    WorkOrderStatus.CANCELLED,
  ]) {
    await addWorkOrder(scene, { status, description: `${status} 상태 의뢰입니다.` });
  }
  const master = await createMaster("01044444444");

  await loginAs(master.user.id);
  const body = await (await feed()).json();
  expect(body.workOrders.map((order: { id: string }) => order.id)).toEqual([requested.id]);
});

test("가까운 의뢰가 위로 온다 (거리순)", async () => {
  const near = await createWorkOrderScene("01011111111", ["201호"]);
  const far = await prisma.building.create({
    data: {
      ownerProfileId: near.profile.id,
      name: "먼동네빌",
      address: "서울 성동구 먼길 1",
      // 건물에서 북쪽으로 약 3km
      lat: 37.56152 + 3 / 111.19,
      lng: 127.03648,
    },
  });
  const nearOrder = await addWorkOrder(near, { description: "가까운 의뢰입니다." });
  const farOrder = await addWorkOrder(
    { profile: near.profile, building: far, unit: null },
    { description: "먼 의뢰입니다." },
  );
  // 마스터를 건물 바로 위(0km)에 둔다 — 3km 떨어진 건물이 뒤로 간다
  const master = await createMaster("01044444444", { distanceKm: 0, radiusKm: 10 });

  await loginAs(master.user.id);
  const body = await (await feed()).json();
  expect(body.workOrders.map((order: { id: string }) => order.id)).toEqual([
    nearOrder.id,
    farOrder.id,
  ]);
});

test("남의 활동지역과 무관하게 내 조건으로만 계산한다", async () => {
  const scene = await createWorkOrderScene();
  await addWorkOrder(scene);
  await createProMaster("01055555555", { distanceKm: 1, radiusKm: 10 }); // 다른 마스터
  const me = await createMaster("01044444444", { distanceKm: 8, radiusKm: 5 });

  await loginAs(me.user.id);
  expect((await (await feed()).json()).workOrders).toHaveLength(0);
});

test("나에게 추천으로 온 의뢰는 피드에서도 추천으로 표시된다", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const pro = await createProMaster("01044444444", { distanceKm: 2, radiusKm: 5 });
  await prisma.workOrderTarget.create({
    data: { workOrderId: order.id, masterProfileId: pro.profile.id, distanceKm: 2 },
  });

  await loginAs(pro.user.id);
  const body = await (await feed()).json();
  expect(body.workOrders[0].recommended).toBe(true);
  expect(body.workOrders[0].sentAt).not.toBeNull();
});

test("업종이 하나도 없으면 빈 피드", async () => {
  const scene = await createWorkOrderScene();
  await addWorkOrder(scene);
  const master = await createMaster("01044444444", { categories: [] });

  await loginAs(master.user.id);
  expect((await (await feed()).json()).workOrders).toHaveLength(0);
});
