/**
 * `PATCH /api/work-orders/[id]` 테스트 (T5.1 + T5.3 민원 연동) — 완료·취소.
 *
 * task T5.3 최소 테스트 중 **④완료 시 민원 RESOLVED 연동** 이 파일 아래쪽에 있다.
 */
import { ComplaintStatus, prisma, WorkOrderStatus } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { addComplaint, createComplaintScene } from "@/features/complaint/testing";
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

// ── T5.3 · 완료하면 연결된 민원도 닫는다 ────────────────────────────────────

/**
 * 민원 → 의뢰 전환분과 같은 모양의 무대 — 임대인·세입자·계약·민원·의뢰(`complaintId` 연결).
 * `createComplaintScene` 은 T2.6 픽스처를 그대로 쓴다.
 */
async function complaintLinkedOrder(complaintStatus: ComplaintStatus) {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene, { status: complaintStatus });
  const order = await addWorkOrder(
    { profile: scene.landlord.profile, building: scene.landlord.building, unit: scene.landlord.unit },
    { complaintId: complaint.id },
  );
  return { scene, complaint, order };
}

test("**완료하면 연결된 민원도 RESOLVED 로 닫힌다**", async () => {
  const { scene, complaint, order } = await complaintLinkedOrder(ComplaintStatus.IN_PROGRESS);
  await loginAs(scene.landlord.user.id);

  const response = await patch(order.id, { status: "DONE" });
  expect(response.status).toBe(200);
  expect((await response.json()).complaintStatus).toBe("RESOLVED");

  const after = await prisma.complaint.findUniqueOrThrow({ where: { id: complaint.id } });
  expect(after.status).toBe(ComplaintStatus.RESOLVED);
});

test("접수(OPEN) 상태의 민원도 완료로 함께 닫힌다", async () => {
  const { scene, complaint, order } = await complaintLinkedOrder(ComplaintStatus.OPEN);
  await loginAs(scene.landlord.user.id);

  expect((await patch(order.id, { status: "DONE" })).status).toBe(200);
  const after = await prisma.complaint.findUniqueOrThrow({ where: { id: complaint.id } });
  expect(after.status).toBe(ComplaintStatus.RESOLVED);
});

test("**취소는 민원을 닫지 않는다** — 작업을 안 한 것이지 해결한 것이 아니다", async () => {
  const { scene, complaint, order } = await complaintLinkedOrder(ComplaintStatus.IN_PROGRESS);
  await loginAs(scene.landlord.user.id);

  const response = await patch(order.id, { status: "CANCELLED" });
  expect(response.status).toBe(200);
  expect((await response.json()).complaintStatus).toBe("IN_PROGRESS");

  const after = await prisma.complaint.findUniqueOrThrow({ where: { id: complaint.id } });
  expect(after.status).toBe(ComplaintStatus.IN_PROGRESS);
});

test("**반려된 민원은 완료가 뒤집지 않는다**(전이표가 막는다) — 의뢰는 그래도 완료된다", async () => {
  const { scene, complaint, order } = await complaintLinkedOrder(ComplaintStatus.REJECTED);
  await loginAs(scene.landlord.user.id);

  const response = await patch(order.id, { status: "DONE" });
  expect(response.status).toBe(200);
  expect((await response.json()).complaintStatus).toBe("REJECTED");

  const afterComplaint = await prisma.complaint.findUniqueOrThrow({ where: { id: complaint.id } });
  expect(afterComplaint.status).toBe(ComplaintStatus.REJECTED);
  const afterOrder = await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } });
  expect(afterOrder.status).toBe(WorkOrderStatus.DONE);
});

test("이미 해결된 민원이면 그대로 두고 완료만 한다", async () => {
  const { scene, complaint, order } = await complaintLinkedOrder(ComplaintStatus.RESOLVED);
  await loginAs(scene.landlord.user.id);

  const response = await patch(order.id, { status: "DONE" });
  expect((await response.json()).complaintStatus).toBe("RESOLVED");
  const after = await prisma.complaint.findUniqueOrThrow({ where: { id: complaint.id } });
  expect(after.status).toBe(ComplaintStatus.RESOLVED);
});

test("민원과 연결되지 않은 의뢰는 complaintStatus 가 null", async () => {
  const scene = await createWorkOrderScene();
  const order = await addWorkOrder(scene);
  await loginAs(scene.user.id);

  const body = await (await patch(order.id, { status: "DONE" })).json();
  expect(body.complaintStatus).toBeNull();
});

test("의뢰 전이가 409 로 막히면 민원도 그대로다", async () => {
  const { scene, complaint, order } = await complaintLinkedOrder(ComplaintStatus.IN_PROGRESS);
  await prisma.workOrder.update({
    where: { id: order.id },
    data: { status: WorkOrderStatus.CANCELLED },
  });
  await loginAs(scene.landlord.user.id);

  expect((await patch(order.id, { status: "DONE" })).status).toBe(409);
  const after = await prisma.complaint.findUniqueOrThrow({ where: { id: complaint.id } });
  expect(after.status).toBe(ComplaintStatus.IN_PROGRESS);
});
