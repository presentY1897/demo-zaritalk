/**
 * 마스터 의뢰 상세 접근 판정 테스트 (T5.2) — `/master/orders/[id]` 가 무엇을 보여 주는가.
 *
 * 두 갈래 중 하나면 볼 수 있다: ① 나에게 추천으로 온 의뢰 ② 내 업종·활동반경 안의 의뢰.
 */
import { MasterCategory, prisma, WorkOrderStatus } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test } from "vitest";
import { dispatchWorkOrderTargets } from "@/features/workorder/matching";
import {
  addWorkOrder,
  createMaster,
  createProMaster,
  createWorkOrderScene,
} from "@/features/workorder/testing";
import type { MasterSession } from "./ownership";
import { getMasterWorkOrder } from "./queries";

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
});

/** 가드를 거치지 않고 세션 모양만 만든다(권한 판정은 라우트 테스트가 따로 본다) */
const sessionOf = (master: Awaited<ReturnType<typeof createMaster>>): MasterSession =>
  ({ user: { id: master.user.id } as never, profile: master.profile, detail: master.detail });

test("내 업종·반경 안의 의뢰는 볼 수 있다 (추천이 아니어도)", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const master = await createMaster("01044444444", { distanceKm: 2, radiusKm: 5 });

  const dto = await getMasterWorkOrder(sessionOf(master), order.id);
  expect(dto?.id).toBe(order.id);
  expect(dto?.recommended).toBe(false);
  expect(dto?.distanceKm).toBeGreaterThan(1.9);
});

test("업종이 다르면 볼 수 없다", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene, { category: MasterCategory.CLEANING });
  const master = await createMaster("01044444444", { categories: [MasterCategory.REPAIR] });

  expect(await getMasterWorkOrder(sessionOf(master), order.id)).toBeNull();
});

test("반경 밖이면 볼 수 없다", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const master = await createMaster("01044444444", { distanceKm: 8, radiusKm: 5 });

  expect(await getMasterWorkOrder(sessionOf(master), order.id)).toBeNull();
});

test("추천으로 받은 의뢰는 조건이 나중에 어긋나도 계속 볼 수 있다", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const pro = await createProMaster("01044444444", { distanceKm: 2, radiusKm: 5 });
  await dispatchWorkOrderTargets(order.id);

  // 활동반경을 좁혀 피드에서는 빠지게 만든다
  await prisma.masterDetail.update({
    where: { profileId: pro.profile.id },
    data: { radiusKm: 0.5 },
  });
  const narrowed = await prisma.masterDetail.findUniqueOrThrow({
    where: { profileId: pro.profile.id },
  });

  const dto = await getMasterWorkOrder(
    { ...sessionOf(pro), detail: narrowed },
    order.id,
  );
  expect(dto?.recommended).toBe(true);
  expect(dto?.sentAt).not.toBeNull();
});

test("피드에서 열어 본 의뢰가 완료돼도 404 가 되지 않는다", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene, { status: WorkOrderStatus.DONE });
  const master = await createMaster("01044444444", { distanceKm: 2, radiusKm: 5 });

  const dto = await getMasterWorkOrder(sessionOf(master), order.id);
  expect(dto?.status).toBe("DONE");
});

test("없는 의뢰·건물 없는 의뢰는 null", async () => {
  const scene = await createWorkOrderScene();
  const master = await createMaster("01044444444");
  const placeless = await addWorkOrder(scene, { buildingId: null, unitId: null });

  expect(await getMasterWorkOrder(sessionOf(master), "cmf0notexist")).toBeNull();
  expect(await getMasterWorkOrder(sessionOf(master), placeless.id)).toBeNull();
});
