/**
 * push 추천 발송 테스트 (T5.1) — **대상 선정 규칙이 이 프로젝트에서 제일 중요한 판정이다.**
 *
 * D4 하이브리드의 핵심: 조건(업종·반경·유료)을 **전부** 만족하는 마스터에게만 추천이 가고,
 * 나머지 마스터는 전체 피드(pull)로 같은 의뢰에 닿는다.
 */
import { MasterCategory, MasterPlan, MessageKind, prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test } from "vitest";
import { haversineKm } from "@/lib/geo/distance";
import {
  dispatchWorkOrderTargets,
  selectWorkOrderTargets,
  WORK_ORDER_TARGET_LIMIT,
} from "./matching";
import {
  addWorkOrder,
  BUILDING_POINT,
  createMaster,
  createProMaster,
  createWorkOrderScene,
  masterPointNorthOf,
} from "./testing";

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
});

const targetsOf = (workOrderId: string) =>
  prisma.workOrderTarget.findMany({ where: { workOrderId }, orderBy: { distanceKm: "asc" } });

test("PRO · 업종 일치 · 반경 안이면 타겟과 발송 로그가 생긴다", async () => {
  const scene = await createWorkOrderScene();
  const pro = await createProMaster("01044444444", { distanceKm: 2, radiusKm: 5 });
  const workOrder = await addWorkOrder(scene);

  expect(await dispatchWorkOrderTargets(workOrder.id)).toBe(1);

  const targets = await targetsOf(workOrder.id);
  expect(targets).toHaveLength(1);
  expect(targets[0]!.masterProfileId).toBe(pro.profile.id);
  expect(targets[0]!.status).toBe("SENT");
  // 저장된 거리는 하버사인 결과 그대로다(소수 3자리)
  expect(targets[0]!.distanceKm).toBeCloseTo(haversineKm(BUILDING_POINT, masterPointNorthOf(2)), 2);

  const logs = await prisma.messageLog.findMany({ where: { kind: MessageKind.WORK_ORDER_REQUEST } });
  expect(logs).toHaveLength(1);
  expect(logs[0]!.toPhone).toBe("01044444444");
  expect(logs[0]!.title).toContain("수리/설비");
});

test("FREE 마스터에게는 타겟이 생기지 않는다 (조건이 같아도)", async () => {
  const scene = await createWorkOrderScene();
  await createMaster("01066666666", { distanceKm: 2, radiusKm: 5 }); // plan 기본값 FREE
  const workOrder = await addWorkOrder(scene);

  expect(await dispatchWorkOrderTargets(workOrder.id)).toBe(0);
  expect(await targetsOf(workOrder.id)).toHaveLength(0);
  expect(await prisma.messageLog.count()).toBe(0);
});

test("업종이 다르면 PRO 라도 제외한다", async () => {
  const scene = await createWorkOrderScene();
  await createProMaster("01044444444", { categories: [MasterCategory.CLEANING] });
  const workOrder = await addWorkOrder(scene, { category: MasterCategory.REPAIR });

  expect(await dispatchWorkOrderTargets(workOrder.id)).toBe(0);
});

test("활동반경 밖이면 PRO·업종이 맞아도 제외한다", async () => {
  const scene = await createWorkOrderScene();
  await createProMaster("01044444444", { distanceKm: 8, radiusKm: 5 });
  const workOrder = await addWorkOrder(scene);

  expect(await dispatchWorkOrderTargets(workOrder.id)).toBe(0);
});

test("반경은 마스터마다 다르다 — 같은 거리라도 넓게 잡은 쪽만 받는다", async () => {
  const scene = await createWorkOrderScene();
  const wide = await createProMaster("01044444444", { distanceKm: 8, radiusKm: 10 });
  await createProMaster("01055555555", { distanceKm: 8, radiusKm: 5 });
  const workOrder = await addWorkOrder(scene);

  expect(await dispatchWorkOrderTargets(workOrder.id)).toBe(1);
  const targets = await targetsOf(workOrder.id);
  expect(targets[0]!.masterProfileId).toBe(wide.profile.id);
});

test("유료가 만료된 PRO 는 제외한다", async () => {
  const scene = await createWorkOrderScene();
  await createProMaster("01044444444", { planUntil: new Date("2026-01-01T00:00:00.000Z") });
  const workOrder = await addWorkOrder(scene);

  expect(await dispatchWorkOrderTargets(workOrder.id, { now: new Date("2026-09-02") })).toBe(0);
});

test("유료 만료일이 남아 있으면 대상이다", async () => {
  const scene = await createWorkOrderScene();
  await createProMaster("01044444444", { planUntil: new Date("2026-12-31T00:00:00.000Z") });
  const workOrder = await addWorkOrder(scene);

  expect(await dispatchWorkOrderTargets(workOrder.id, { now: new Date("2026-09-02") })).toBe(1);
});

test("거리순 최대 10명까지만 — 잘리는 것은 먼 쪽이다", async () => {
  const scene = await createWorkOrderScene();
  // 1km 씩 벌려 12명(전부 반경 20km 라 전원 조건 통과)
  for (let index = 1; index <= 12; index += 1) {
    await createProMaster(`0104400${String(index).padStart(2, "0")}`, {
      distanceKm: index,
      radiusKm: 20,
      companyName: `마스터${index}`,
    });
  }
  const workOrder = await addWorkOrder(scene);

  expect(await dispatchWorkOrderTargets(workOrder.id)).toBe(WORK_ORDER_TARGET_LIMIT);

  const targets = await targetsOf(workOrder.id);
  expect(targets).toHaveLength(10);
  // 가장 먼 대상도 10km 언저리 — 11·12km 짜리는 잘렸다
  expect(targets.at(-1)!.distanceKm).toBeLessThan(10.5);
  expect(await prisma.messageLog.count({ where: { kind: MessageKind.WORK_ORDER_REQUEST } })).toBe(10);
});

test("같은 의뢰로 다시 발송해도 타겟·로그가 중복되지 않는다", async () => {
  const scene = await createWorkOrderScene();
  await createProMaster("01044444444");
  const workOrder = await addWorkOrder(scene);

  expect(await dispatchWorkOrderTargets(workOrder.id)).toBe(1);
  expect(await dispatchWorkOrderTargets(workOrder.id)).toBe(0); // 두 번째는 새로 보낼 곳이 없다

  expect(await targetsOf(workOrder.id)).toHaveLength(1);
  expect(await prisma.messageLog.count({ where: { kind: MessageKind.WORK_ORDER_REQUEST } })).toBe(1);
});

test("재발송은 새로 조건을 만족하게 된 마스터에게만 간다", async () => {
  const scene = await createWorkOrderScene();
  const first = await createProMaster("01044444444");
  const workOrder = await addWorkOrder(scene);
  expect(await dispatchWorkOrderTargets(workOrder.id)).toBe(1);

  // 무료였던 마스터가 PRO 로 올라온다
  const late = await createMaster("01066666666", { plan: MasterPlan.FREE, distanceKm: 3 });
  await prisma.masterDetail.update({
    where: { profileId: late.profile.id },
    data: { plan: MasterPlan.PRO },
  });

  expect(await dispatchWorkOrderTargets(workOrder.id)).toBe(1);
  const targets = await targetsOf(workOrder.id);
  expect(targets.map((target) => target.masterProfileId).sort()).toEqual(
    [first.profile.id, late.profile.id].sort(),
  );
});

test("건물이 없는 의뢰는 추천을 보내지 않는다 (반경 매칭의 원점이 없다)", async () => {
  const scene = await createWorkOrderScene();
  await createProMaster("01044444444");
  const workOrder = await addWorkOrder(scene, { buildingId: null, unitId: null });

  expect(await dispatchWorkOrderTargets(workOrder.id)).toBe(0);
});

test("selectWorkOrderTargets 는 아무 것도 쓰지 않는다 (발송 전 미리보기용)", async () => {
  await createWorkOrderScene();
  await createProMaster("01044444444");

  const selected = await selectWorkOrderTargets("REPAIR", BUILDING_POINT);
  expect(selected).toHaveLength(1);
  expect(await prisma.workOrderTarget.count()).toBe(0);
  expect(await prisma.messageLog.count()).toBe(0);
});
