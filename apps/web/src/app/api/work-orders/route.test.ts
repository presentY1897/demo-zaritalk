/**
 * `GET·POST /api/work-orders` 테스트 (T5.1) — 목록·생성 + 생성 시 push 추천 발송.
 */
import { MasterCategory, prisma, WorkOrderStatus } from "@zari/db";
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
import { GET, POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const list = () => GET();
const create = (body: unknown) =>
  POST(
    new Request("http://localhost/api/work-orders", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

// ── GET ────────────────────────────────────────────────────────────────────

test("비로그인이면 401", async () => {
  expect((await list()).status).toBe(401);
});

test("임대인 프로필이 없으면 403", async () => {
  const master = await createMaster("01044444444");
  await loginAs(master.user.id);
  expect((await list()).status).toBe(403);
});

test("내 의뢰만 본다 — 남의 의뢰는 목록에 없다", async () => {
  const mine = await createWorkOrderScene();
  const mineOrder = await addWorkOrder(mine);

  const other = await createWorkOrderScene("01099999999", ["301호"]);
  await addWorkOrder(other, { description: "남의 의뢰입니다. 손대지 마세요." });

  await loginAs(mine.user.id);
  const body = await (await list()).json();
  expect(body.workOrders).toHaveLength(1);
  expect(body.workOrders[0].id).toBe(mineOrder.id);
  expect(body.workOrders[0].source).toBe("DIRECT");
  expect(body.workOrders[0].place.buildingName).toBe("행당해피빌");
});

test("진행 중 의뢰가 종결된 의뢰보다 위에 온다", async () => {
  const scene = await createWorkOrderScene();
  const done = await addWorkOrder(scene, {
    status: WorkOrderStatus.DONE,
    description: "완료된 의뢰입니다.",
  });
  const open = await addWorkOrder(scene, { description: "아직 요청 중인 의뢰입니다." });

  await loginAs(scene.user.id);
  const body = await (await list()).json();
  expect(body.workOrders.map((order: { id: string }) => order.id)).toEqual([open.id, done.id]);
});

test("생성 시트의 대상 선택지로 내 건물·호실이 온다", async () => {
  const scene = await createWorkOrderScene("01011111111", ["101호", "201호"]);
  await loginAs(scene.user.id);

  const body = await (await list()).json();
  expect(body.places).toHaveLength(1);
  expect(body.places[0].buildingId).toBe(scene.building.id);
  expect(body.places[0].units.map((unit: { label: string }) => unit.label)).toEqual([
    "101호",
    "201호",
  ]);
});

test("건물이 없는 임대인은 빈 목록·빈 선택지", async () => {
  const landlord = await createLandlord();
  await loginAs(landlord.user.id);

  const body = await (await list()).json();
  expect(body.workOrders).toEqual([]);
  expect(body.places).toEqual([]);
});

// ── POST ───────────────────────────────────────────────────────────────────

test("비로그인 생성은 401", async () => {
  expect((await create({})).status).toBe(401);
});

test("의뢰를 등록하면 REQUESTED 로 저장되고 PRO 마스터에게 추천이 나간다", async () => {
  const scene = await createWorkOrderScene();
  const pro = await createProMaster("01044444444", { distanceKm: 2, radiusKm: 5 });
  await loginAs(scene.user.id);

  const response = await create({
    category: "REPAIR",
    buildingId: scene.building.id,
    unitId: scene.unit.id,
    description: "201호 온수가 미지근합니다. 보일러 점검 부탁드립니다.",
    desiredDate: "2026-09-10",
  });
  expect(response.status).toBe(201);

  const body = await response.json();
  expect(body.workOrder.status).toBe("REQUESTED");
  expect(body.workOrder.category).toBe("REPAIR");
  expect(body.workOrder.desiredDate).toBe("2026-09-10");
  expect(body.workOrder.place.unitLabel).toBe("201호");
  expect(body.workOrder.source).toBe("DIRECT");
  expect(body.workOrder.targetCount).toBe(1);
  expect(body.dispatchedCount).toBe(1);

  const targets = await prisma.workOrderTarget.findMany({ where: { workOrderId: body.workOrder.id } });
  expect(targets).toHaveLength(1);
  expect(targets[0]!.masterProfileId).toBe(pro.profile.id);
});

test("조건에 맞는 PRO 마스터가 없으면 의뢰는 남고 추천만 0이다", async () => {
  const scene = await createWorkOrderScene();
  await createMaster("01066666666"); // FREE
  await loginAs(scene.user.id);

  const body = await (
    await create({
      category: "REPAIR",
      buildingId: scene.building.id,
      description: "옥상 방수 점검 부탁드립니다.",
    })
  ).json();

  expect(body.dispatchedCount).toBe(0);
  expect(body.workOrder.targetCount).toBe(0);
  expect(await prisma.workOrder.count()).toBe(1);
});

test("호실을 생략하면 공용부 의뢰가 된다", async () => {
  const scene = await createWorkOrderScene();
  await loginAs(scene.user.id);

  const body = await (
    await create({
      category: "CLEANING",
      buildingId: scene.building.id,
      description: "계단·복도 공용부 청소 부탁드립니다.",
    })
  ).json();

  expect(body.workOrder.place.unitId).toBeNull();
  expect(body.workOrder.place.unitLabel).toBeNull();
  expect(body.workOrder.desiredDate).toBeNull();
});

test("없는 건물은 404", async () => {
  const scene = await createWorkOrderScene();
  await loginAs(scene.user.id);

  const response = await create({
    category: "REPAIR",
    buildingId: "cmf0notexist",
    description: "없는 건물에 의뢰를 냅니다.",
  });
  expect(response.status).toBe(404);
});

test("남의 건물에는 의뢰를 낼 수 없다 — 403", async () => {
  const mine = await createWorkOrderScene();
  const other = await createWorkOrderScene("01099999999", ["301호"]);
  await loginAs(mine.user.id);

  const response = await create({
    category: "REPAIR",
    buildingId: other.building.id,
    description: "남의 건물에 의뢰를 냅니다.",
  });
  expect(response.status).toBe(403);
  expect(await prisma.workOrder.count()).toBe(0);
});

test("남의 호실은 403", async () => {
  const mine = await createWorkOrderScene();
  const other = await createWorkOrderScene("01099999999", ["301호"]);
  await loginAs(mine.user.id);

  const response = await create({
    category: "REPAIR",
    buildingId: mine.building.id,
    unitId: other.unit.id,
    description: "남의 호실을 대상으로 잡습니다.",
  });
  expect(response.status).toBe(403);
});

test("호실이 그 건물 소속이 아니면 400", async () => {
  const scene = await createWorkOrderScene("01011111111", ["201호"]);
  const second = await prisma.building.create({
    data: {
      ownerProfileId: scene.profile.id,
      name: "두번째빌",
      address: "서울 성동구 두번째로 1",
      lat: 37.5,
      lng: 127.0,
    },
  });
  await loginAs(scene.user.id);

  const response = await create({
    category: "REPAIR",
    buildingId: second.id,
    unitId: scene.unit.id, // 첫 번째 건물의 호실
    description: "건물과 호실이 어긋난 요청입니다.",
  });
  expect(response.status).toBe(400);
});

test("작업 내용이 짧으면 400", async () => {
  const scene = await createWorkOrderScene();
  await loginAs(scene.user.id);

  const response = await create({
    category: "REPAIR",
    buildingId: scene.building.id,
    description: "짧음",
  });
  expect(response.status).toBe(400);
});

test("모르는 업종은 400", async () => {
  const scene = await createWorkOrderScene();
  await loginAs(scene.user.id);

  const response = await create({
    category: "PLUMBING",
    buildingId: scene.building.id,
    description: "업종 값이 스키마에 없습니다.",
  });
  expect(response.status).toBe(400);
});

test("존재하지 않는 날짜(2026-02-31)는 400", async () => {
  const scene = await createWorkOrderScene();
  await loginAs(scene.user.id);

  const response = await create({
    category: "REPAIR",
    buildingId: scene.building.id,
    description: "달력에 없는 날짜를 희망일로 보냅니다.",
    desiredDate: "2026-02-31",
  });
  expect(response.status).toBe(400);
  expect(await prisma.workOrder.count()).toBe(0);
});

test("업종이 다른 PRO 마스터에게는 추천이 가지 않는다", async () => {
  const scene = await createWorkOrderScene();
  await createProMaster("01044444444", { categories: [MasterCategory.CLEANING] });
  await loginAs(scene.user.id);

  const body = await (
    await create({
      category: "REPAIR",
      buildingId: scene.building.id,
      description: "수리 의뢰인데 청소 업체만 있습니다.",
    })
  ).json();
  expect(body.dispatchedCount).toBe(0);
});
