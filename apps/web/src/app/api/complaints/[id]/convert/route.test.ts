/**
 * `POST /api/complaints/[id]/convert` 테스트 (T5.1) — 민원 → 작업 의뢰 전환.
 *
 * task 최소 테스트 두 가지가 여기 있다: **이미 전환된 민원 409** · **전환 시 양쪽 상태 동기화**.
 */
import { ComplaintStatus, prisma, WorkOrderStatus } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  addComplaint,
  createComplaintScene,
  createOutsiders,
} from "@/features/complaint/testing";
import { loginAs } from "@/features/landlord/testing";
import { createMaster, createProMaster } from "@/features/workorder/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const convert = (id: string, body: unknown = { category: "REPAIR" }) =>
  POST(
    new Request(`http://localhost/api/complaints/${id}/convert`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

test("비로그인이면 401", async () => {
  expect((await convert("cmf0")).status).toBe(401);
});

test("없는 민원은 404", async () => {
  const scene = await createComplaintScene();
  await loginAs(scene.landlord.user.id);
  expect((await convert("cmf0notexist")).status).toBe(404);
});

test("제3자는 403 — 의뢰가 생기지 않는다", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);
  const outsiders = await createOutsiders();

  await loginAs(outsiders.otherLandlord.user.id);
  expect((await convert(complaint.id)).status).toBe(403);
  expect(await prisma.workOrder.count()).toBe(0);
});

test("세입자는 전환할 수 없다 — 403", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);

  await loginAs(scene.tenant.user.id);
  expect((await convert(complaint.id)).status).toBe(403);
  expect(await prisma.workOrder.count()).toBe(0);
});

test("전환하면 의뢰가 생기고 민원은 IN_PROGRESS 가 된다 (양쪽 상태 동기화)", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);
  await loginAs(scene.landlord.user.id);

  const response = await convert(complaint.id);
  expect(response.status).toBe(201);

  const body = await response.json();
  expect(body.workOrder.source).toBe("COMPLAINT");
  expect(body.workOrder.complaintId).toBe(complaint.id);
  expect(body.workOrder.complaintTitle).toBe("온수가 나오지 않습니다");
  expect(body.workOrder.status).toBe("REQUESTED");
  expect(body.complaintStatus).toBe("IN_PROGRESS");

  const saved = await prisma.workOrder.findUniqueOrThrow({ where: { id: body.workOrder.id } });
  expect(saved.status).toBe(WorkOrderStatus.REQUESTED);
  expect(saved.unitId).toBe(scene.landlord.unit.id);
  expect(saved.buildingId).toBe(scene.landlord.building.id);
  // 작업 내용을 비워 보내면 민원 본문이 그대로 옮겨진다
  expect(saved.description).toBe("어제 저녁부터 온수가 전혀 나오지 않습니다.");

  const after = await prisma.complaint.findUniqueOrThrow({ where: { id: complaint.id } });
  expect(after.status).toBe(ComplaintStatus.IN_PROGRESS);
});

test("이미 전환된 민원은 409 — 의뢰가 둘 생기지 않는다", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);
  await loginAs(scene.landlord.user.id);

  expect((await convert(complaint.id)).status).toBe(201);
  expect((await convert(complaint.id)).status).toBe(409);
  expect(await prisma.workOrder.count()).toBe(1);
});

test("전환 시에도 PRO 마스터에게 추천이 나간다 (직접 생성과 같은 규칙)", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);
  const pro = await createProMaster("01044444444", { distanceKm: 2, radiusKm: 5 });
  await createMaster("01066666666", { distanceKm: 2, radiusKm: 5 }); // FREE — 받지 않는다
  await loginAs(scene.landlord.user.id);

  const body = await (await convert(complaint.id)).json();
  expect(body.dispatchedCount).toBe(1);
  expect(body.workOrder.targetCount).toBe(1);

  const targets = await prisma.workOrderTarget.findMany();
  expect(targets).toHaveLength(1);
  expect(targets[0]!.masterProfileId).toBe(pro.profile.id);
});

test("작업 내용을 직접 적어 보내면 그 값이 저장된다", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);
  await loginAs(scene.landlord.user.id);

  const body = await (
    await convert(complaint.id, {
      category: "REPAIR",
      description: "보일러 온수 배관 누수 의심. 방문 점검 요청합니다.",
      desiredDate: "2026-09-10",
    })
  ).json();

  expect(body.workOrder.description).toBe("보일러 온수 배관 누수 의심. 방문 점검 요청합니다.");
  expect(body.workOrder.desiredDate).toBe("2026-09-10");
});

test("이미 진행중인 민원도 전환된다 — 상태는 그대로 IN_PROGRESS", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene, { status: ComplaintStatus.IN_PROGRESS });
  await loginAs(scene.landlord.user.id);

  expect((await convert(complaint.id)).status).toBe(201);
  const after = await prisma.complaint.findUniqueOrThrow({ where: { id: complaint.id } });
  expect(after.status).toBe(ComplaintStatus.IN_PROGRESS);
});

test("해결로 닫혔던 민원을 전환하면 다시 진행중으로 열린다", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene, { status: ComplaintStatus.RESOLVED });
  await loginAs(scene.landlord.user.id);

  expect((await convert(complaint.id)).status).toBe(201);
  const after = await prisma.complaint.findUniqueOrThrow({ where: { id: complaint.id } });
  expect(after.status).toBe(ComplaintStatus.IN_PROGRESS);
});

test("업종을 보내지 않으면 400 — 민원 상태도 그대로다", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);
  await loginAs(scene.landlord.user.id);

  expect((await convert(complaint.id, {})).status).toBe(400);
  const after = await prisma.complaint.findUniqueOrThrow({ where: { id: complaint.id } });
  expect(after.status).toBe(ComplaintStatus.OPEN);
  expect(await prisma.workOrder.count()).toBe(0);
});

test("전환된 의뢰는 임대인 목록에서 '민원 전환' 으로 구분된다", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);
  await loginAs(scene.landlord.user.id);
  await convert(complaint.id);

  const { listLandlordWorkOrders } = await import("@/features/workorder/queries");
  const orders = await listLandlordWorkOrders(scene.landlord.profile.id);
  expect(orders).toHaveLength(1);
  expect(orders[0]!.source).toBe("COMPLAINT");
  expect(orders[0]!.complaintId).toBe(complaint.id);
});
