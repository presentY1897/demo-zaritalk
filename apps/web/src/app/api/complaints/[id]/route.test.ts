/**
 * `PATCH /api/complaints/[id]` 테스트 (T2.6) — 상태 변경(임대인 전용) + 전이표.
 */
import { ComplaintStatus, prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { addComplaint, createComplaintScene, createOutsiders } from "@/features/complaint/testing";
import { loginAs } from "@/features/landlord/testing";
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
    new Request(`http://localhost/api/complaints/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

test("비로그인이면 401", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);
  expect((await patch(complaint.id, { status: "IN_PROGRESS" })).status).toBe(401);
});

test("없는 민원 id 는 404", async () => {
  const scene = await createComplaintScene();
  await loginAs(scene.landlord.user.id);
  expect((await patch("nope", { status: "IN_PROGRESS" })).status).toBe(404);
});

test("제3자는 403", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);
  const { otherLandlord } = await createOutsiders();
  await loginAs(otherLandlord.user.id);

  expect((await patch(complaint.id, { status: "IN_PROGRESS" })).status).toBe(403);
});

test("**세입자는 상태를 못 바꾼다 — 403** (스레드는 볼 수 있어도)", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);
  await loginAs(scene.tenant.user.id);

  const response = await patch(complaint.id, { status: "RESOLVED" });
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe("FORBIDDEN");

  const saved = await prisma.complaint.findUniqueOrThrow({ where: { id: complaint.id } });
  expect(saved.status).toBe(ComplaintStatus.OPEN);
});

test("임대인이 접수 → 진행중 → 해결로 옮긴다", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);
  await loginAs(scene.landlord.user.id);

  const inProgress = await patch(complaint.id, { status: "IN_PROGRESS" });
  expect(inProgress.status).toBe(200);
  expect((await inProgress.json()).complaint.status).toBe("IN_PROGRESS");

  const resolved = await patch(complaint.id, { status: "RESOLVED" });
  expect(resolved.status).toBe(200);

  const saved = await prisma.complaint.findUniqueOrThrow({ where: { id: complaint.id } });
  expect(saved.status).toBe(ComplaintStatus.RESOLVED);
});

test("접수에서 바로 해결·반려로도 갈 수 있다", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);
  await loginAs(scene.landlord.user.id);

  expect((await patch(complaint.id, { status: "REJECTED" })).status).toBe(200);
});

test("허용되지 않은 전이는 409 — 해결 → 반려", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene, { status: ComplaintStatus.RESOLVED });
  await loginAs(scene.landlord.user.id);

  const response = await patch(complaint.id, { status: "REJECTED" });
  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe("CONFLICT");

  const saved = await prisma.complaint.findUniqueOrThrow({ where: { id: complaint.id } });
  expect(saved.status).toBe(ComplaintStatus.RESOLVED);
});

test("같은 상태로 다시 바꾸면 409", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene, { status: ComplaintStatus.IN_PROGRESS });
  await loginAs(scene.landlord.user.id);

  expect((await patch(complaint.id, { status: "IN_PROGRESS" })).status).toBe(409);
});

test("종결된 민원은 「진행중」으로 재개할 수 있다", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene, { status: ComplaintStatus.RESOLVED });
  await loginAs(scene.landlord.user.id);

  expect((await patch(complaint.id, { status: "IN_PROGRESS" })).status).toBe(200);
});

test("접수(OPEN)로는 되돌릴 수 없다 — 400 (임대인 홈 배지가 거짓말하지 않게)", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene, { status: ComplaintStatus.IN_PROGRESS });
  await loginAs(scene.landlord.user.id);

  const response = await patch(complaint.id, { status: "OPEN" });
  expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
});

test("모르는 상태 값은 400", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);
  await loginAs(scene.landlord.user.id);
  expect((await patch(complaint.id, { status: "DONE" })).status).toBe(400);
});

test("상태를 바꿔도 스레드 메시지는 그대로다", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);
  await prisma.complaintMessage.create({
    data: { complaintId: complaint.id, authorProfileId: scene.tenant.profile.id, body: "확인 부탁" },
  });
  await loginAs(scene.landlord.user.id);

  const body = await (await patch(complaint.id, { status: "IN_PROGRESS" })).json();
  expect(body.complaint.messages).toHaveLength(2);
  expect(body.complaint.messageCount).toBe(2);
});
