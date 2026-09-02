/**
 * `PATCH /api/work-orders/[id]` 테스트 (T5.1) — 완료·취소.
 */
import { prisma, WorkOrderStatus } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { loginAs } from "@/features/landlord/testing";
import { addWorkOrder, createMaster, createWorkOrderScene } from "@/features/workorder/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { PATCH } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const patch = (id: string, body: unknown) =>
  PATCH(
    new Request(`http://localhost/api/work-orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

test("비로그인이면 401", async () => {
  expect((await patch("cmf0", { status: "DONE" })).status).toBe(401);
});

test("임대인 프로필이 없으면 403", async () => {
  const master = await createMaster("01044444444");
  await loginAs(master.user.id);
  expect((await patch("cmf0", { status: "DONE" })).status).toBe(403);
});

test("없는 의뢰는 404", async () => {
  const scene = await createWorkOrderScene();
  await loginAs(scene.user.id);
  expect((await patch("cmf0notexist", { status: "DONE" })).status).toBe(404);
});

test("남의 의뢰는 403 — 상태도 그대로 남는다", async () => {
  const mine = await createWorkOrderScene();
  const other = await createWorkOrderScene("01099999999", ["301호"]);
  const order = await addWorkOrder(other);

  await loginAs(mine.user.id);
  expect((await patch(order.id, { status: "CANCELLED" })).status).toBe(403);

  const after = await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } });
  expect(after.status).toBe(WorkOrderStatus.REQUESTED);
});

test("요청 → 완료", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  await loginAs(scene.user.id);

  const response = await patch(order.id, { status: "DONE" });
  expect(response.status).toBe(200);
  expect((await response.json()).workOrder.status).toBe("DONE");

  const after = await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } });
  expect(after.status).toBe(WorkOrderStatus.DONE);
});

test("요청 → 취소", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  await loginAs(scene.user.id);

  expect((await patch(order.id, { status: "CANCELLED" })).status).toBe(200);
});

test("종결된 의뢰는 다시 바꿀 수 없다 — 409", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene, { status: WorkOrderStatus.DONE });
  await loginAs(scene.user.id);

  expect((await patch(order.id, { status: "CANCELLED" })).status).toBe(409);
});

test("같은 상태로의 전이도 409", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene, { status: WorkOrderStatus.CANCELLED });
  await loginAs(scene.user.id);

  expect((await patch(order.id, { status: "CANCELLED" })).status).toBe(409);
});

test("QUOTED·ASSIGNED 는 임대인이 고를 수 없다 — 400 (견적이 옮기는 값, T5.3)", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  await loginAs(scene.user.id);

  expect((await patch(order.id, { status: "QUOTED" })).status).toBe(400);
  expect((await patch(order.id, { status: "ASSIGNED" })).status).toBe(400);
  expect((await patch(order.id, { status: "REQUESTED" })).status).toBe(400);
});

test("배정된 의뢰도 완료로 닫을 수 있다", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene, { status: WorkOrderStatus.ASSIGNED });
  await loginAs(scene.user.id);

  expect((await patch(order.id, { status: "DONE" })).status).toBe(200);
});

test("상태를 바꿔도 추천 타겟은 그대로 남는다", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  const master = await createMaster("01044444444");
  await prisma.workOrderTarget.create({
    data: { workOrderId: order.id, masterProfileId: master.profile.id, distanceKm: 2 },
  });

  await loginAs(scene.user.id);
  await patch(order.id, { status: "DONE" });

  expect(await prisma.workOrderTarget.count({ where: { workOrderId: order.id } })).toBe(1);
});
