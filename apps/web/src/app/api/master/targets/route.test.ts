/**
 * `GET /api/master/targets` 테스트 (T5.2) — push 추천함.
 *
 * task 최소 테스트: **FREE 마스터는 추천 탭이 빈 목록**(+ 업그레이드 안내).
 */
import { MasterPlan, prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { createLandlord, loginAs } from "@/features/landlord/testing";
import { dispatchWorkOrderTargets } from "@/features/workorder/matching";
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

const targets = () => GET();

test("비로그인이면 401", async () => {
  expect((await targets()).status).toBe(401);
});

test("마스터 프로필이 없으면 403", async () => {
  const landlord = await createLandlord();
  await loginAs(landlord.user.id);
  expect((await targets()).status).toBe(403);
});

test("PRO 마스터는 나에게 발송된 추천을 본다", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const pro = await createProMaster("01044444444", { distanceKm: 2, radiusKm: 5 });
  await dispatchWorkOrderTargets(order.id);

  await loginAs(pro.user.id);
  const response = await targets();
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body.upgradeRequired).toBe(false);
  expect(body.workOrders).toHaveLength(1);
  expect(body.workOrders[0].id).toBe(order.id);
  expect(body.workOrders[0].recommended).toBe(true);
  expect(body.workOrders[0].sentAt).not.toBeNull();
  expect(body.master.plan).toBe("PRO");
});

test("FREE 마스터는 빈 목록 + 업그레이드 안내 (403 이 아니다)", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const free = await createMaster("01066666666", { distanceKm: 2, radiusKm: 5 });
  await dispatchWorkOrderTargets(order.id); // FREE 라 애초에 타겟이 생기지 않는다

  await loginAs(free.user.id);
  const response = await targets();
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body.workOrders).toEqual([]);
  expect(body.upgradeRequired).toBe(true);
  expect(await prisma.workOrderTarget.count()).toBe(0);
});

test("유료가 끊긴 마스터는 과거 추천도 보이지 않는다", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const pro = await createProMaster("01044444444", { distanceKm: 2, radiusKm: 5 });
  await dispatchWorkOrderTargets(order.id);
  expect(await prisma.workOrderTarget.count()).toBe(1);

  // 결제가 끊겨 무료로 내려간다 — 타겟 행은 남지만 보이지 않는다
  await prisma.masterDetail.update({
    where: { profileId: pro.profile.id },
    data: { plan: MasterPlan.FREE, planUntil: null },
  });

  await loginAs(pro.user.id);
  const body = await (await targets()).json();
  expect(body.workOrders).toEqual([]);
  expect(body.upgradeRequired).toBe(true);
  expect(await prisma.workOrderTarget.count()).toBe(1);
});

test("만료된 PRO 도 무료와 같이 취급한다", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const pro = await createProMaster("01044444444", { distanceKm: 2, radiusKm: 5 });
  await dispatchWorkOrderTargets(order.id);
  await prisma.masterDetail.update({
    where: { profileId: pro.profile.id },
    data: { planUntil: new Date("2020-01-01T00:00:00.000Z") },
  });

  await loginAs(pro.user.id);
  const body = await (await targets()).json();
  expect(body.workOrders).toEqual([]);
  expect(body.upgradeRequired).toBe(true);
});

test("다른 마스터에게 간 추천은 보이지 않는다", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  await createProMaster("01044444444", { distanceKm: 1, radiusKm: 5 });
  const mine = await createProMaster("01055555555", { distanceKm: 8, radiusKm: 5 }); // 반경 밖
  await dispatchWorkOrderTargets(order.id);

  await loginAs(mine.user.id);
  const body = await (await targets()).json();
  expect(body.workOrders).toEqual([]);
  expect(body.upgradeRequired).toBe(false); // PRO 는 맞다 — 다만 나에게 온 추천이 없을 뿐
});

test("추천이 여러 건이면 최신 발송순", async () => {
  const scene = await createWorkOrderScene();
  const pro = await createProMaster("01044444444", { distanceKm: 2, radiusKm: 5 });

  const first = await addWorkOrder(scene, { description: "먼저 들어온 의뢰입니다." });
  await dispatchWorkOrderTargets(first.id);
  const second = await addWorkOrder(scene, { description: "나중에 들어온 의뢰입니다." });
  await dispatchWorkOrderTargets(second.id);
  // sentAt 이 같은 밀리초에 찍히면 순서가 흔들리므로 명시적으로 벌린다
  await prisma.workOrderTarget.updateMany({
    where: { workOrderId: first.id },
    data: { sentAt: new Date("2026-09-01T00:00:00.000Z") },
  });
  await prisma.workOrderTarget.updateMany({
    where: { workOrderId: second.id },
    data: { sentAt: new Date("2026-09-02T00:00:00.000Z") },
  });

  await loginAs(pro.user.id);
  const body = await (await targets()).json();
  expect(body.workOrders.map((order: { id: string }) => order.id)).toEqual([second.id, first.id]);
});
