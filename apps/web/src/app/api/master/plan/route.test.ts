/**
 * `POST /api/master/plan` 테스트 (T5.2) — 데모용 FREE ↔ PRO 토글.
 */
import { MasterCategory, MasterPlan, prisma, WorkOrderStatus } from "@zari/db";
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
import { POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const setPlan = (body: unknown) =>
  POST(
    new Request("http://localhost/api/master/plan", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

test("비로그인이면 401", async () => {
  expect((await setPlan({ plan: "PRO" })).status).toBe(401);
});

test("마스터 프로필이 없으면 403", async () => {
  const landlord = await createLandlord();
  await loginAs(landlord.user.id);
  expect((await setPlan({ plan: "PRO" })).status).toBe(403);
});

test("모르는 플랜 값은 400", async () => {
  const master = await createMaster("01044444444");
  await loginAs(master.user.id);
  expect((await setPlan({ plan: "PREMIUM" })).status).toBe(400);
});

test("FREE → PRO 로 켜면 30일 만료가 붙는다", async () => {
  const master = await createMaster("01044444444");
  await loginAs(master.user.id);

  const response = await setPlan({ plan: "PRO" });
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body.master.plan).toBe("PRO");
  expect(body.master.planUntil).not.toBeNull();

  const saved = await prisma.masterDetail.findUniqueOrThrow({
    where: { profileId: master.profile.id },
  });
  expect(saved.plan).toBe(MasterPlan.PRO);
  expect(saved.planUntil!.getTime()).toBeGreaterThan(Date.now());
});

test("PRO → FREE 로 끄면 만료일이 지워진다", async () => {
  const master = await createProMaster("01044444444", { planUntil: new Date("2027-01-01") });
  await loginAs(master.user.id);

  const body = await (await setPlan({ plan: "FREE" })).json();
  expect(body.master.plan).toBe("FREE");
  expect(body.master.planUntil).toBeNull();
});

test("PRO 로 켜면 지금 열려 있는 의뢰가 추천함에 즉시 채워진다 (데모 시연 경로)", async () => {
  const scene = await createWorkOrderScene();
  const master = await createMaster("01044444444", { distanceKm: 2, radiusKm: 5 });

  // 무료일 때 들어온 의뢰는 추천이 오지 않는다
  const before = await addWorkOrder(scene, { description: "무료일 때 들어온 의뢰입니다." });
  expect(await dispatchWorkOrderTargets(before.id)).toBe(0);
  expect(await prisma.workOrderTarget.count()).toBe(0);

  await loginAs(master.user.id);
  const body = await (await setPlan({ plan: "PRO" })).json();
  expect(body.backfilledCount).toBe(1);

  const targets = await prisma.workOrderTarget.findMany();
  expect(targets).toHaveLength(1);
  expect(targets[0]!.workOrderId).toBe(before.id);

  // 그 뒤에 들어오는 의뢰도 물론 추천 대상이다
  const after = await addWorkOrder(scene, { description: "PRO 로 바꾼 뒤 들어온 의뢰입니다." });
  expect(await dispatchWorkOrderTargets(after.id)).toBe(1);
});

test("백필은 내 업종·반경에 맞는 REQUESTED 의뢰만 채운다", async () => {
  const scene = await createWorkOrderScene();
  const master = await createMaster("01044444444", {
    categories: [MasterCategory.REPAIR],
    distanceKm: 2,
    radiusKm: 5,
  });

  const match = await addWorkOrder(scene, { description: "조건에 맞는 수리 의뢰입니다." });
  await addWorkOrder(scene, {
    category: MasterCategory.CLEANING,
    description: "업종이 다른 청소 의뢰입니다.",
  });
  await addWorkOrder(scene, {
    status: WorkOrderStatus.DONE,
    description: "이미 끝난 의뢰입니다.",
  });

  await loginAs(master.user.id);
  const body = await (await setPlan({ plan: "PRO" })).json();
  expect(body.backfilledCount).toBe(1);

  const targets = await prisma.workOrderTarget.findMany();
  expect(targets.map((target) => target.workOrderId)).toEqual([match.id]);
});

test("FREE 로 끄면 백필하지 않고 과거 타겟 행도 지우지 않는다", async () => {
  const scene = await createWorkOrderScene();
  const master = await createProMaster("01044444444", { distanceKm: 2, radiusKm: 5 });
  const order = await addWorkOrder(scene);
  await dispatchWorkOrderTargets(order.id);

  await loginAs(master.user.id);
  const body = await (await setPlan({ plan: "FREE" })).json();
  expect(body.backfilledCount).toBe(0);
  expect(await prisma.workOrderTarget.count()).toBe(1);
});

test("토글은 멱등하다 — 같은 플랜을 두 번 보내도 200", async () => {
  const master = await createMaster("01044444444");
  await loginAs(master.user.id);

  expect((await setPlan({ plan: "PRO" })).status).toBe(200);
  expect((await setPlan({ plan: "PRO" })).status).toBe(200);
});

test("남의 플랜은 바꿀 수 없다 — 내 프로필만 바뀐다", async () => {
  const mine = await createMaster("01044444444");
  const other = await createMaster("01055555555");
  await loginAs(mine.user.id);

  await setPlan({ plan: "PRO" });

  const otherDetail = await prisma.masterDetail.findUniqueOrThrow({
    where: { profileId: other.profile.id },
  });
  expect(otherDetail.plan).toBe(MasterPlan.FREE);
});
