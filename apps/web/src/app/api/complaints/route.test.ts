/**
 * `GET·POST /api/complaints` 테스트 (T2.6) — 목록·접수.
 */
import { ComplaintStatus, LeaseStatus, prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  addComplaint,
  createComplaintScene,
  createOtherScene,
  createOutsiders,
} from "@/features/complaint/testing";
import { loginAs } from "@/features/landlord/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { GET, POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const list = (query = "") => GET(new Request(`http://localhost/api/complaints${query}`));
const create = (body: unknown) =>
  POST(
    new Request("http://localhost/api/complaints", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

// ── GET ────────────────────────────────────────────────────────────────────

test("비로그인이면 401", async () => {
  expect((await list()).status).toBe(401);
});

test("세입자는 내가 접수한 민원만 본다 (남의 민원은 목록에 없다)", async () => {
  const scene = await createComplaintScene();
  const mine = await addComplaint(scene);

  const other = await createOtherScene();
  await addComplaint(other, { title: "남의 민원" });

  await loginAs(scene.tenant.user.id);
  const response = await list("?role=tenant");
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body.complaints).toHaveLength(1);
  expect(body.complaints[0].id).toBe(mine.id);
  expect(body.complaints[0].messageCount).toBe(1); // 접수 본문 1개
  expect(body.leases).toHaveLength(1); // 접수 폼의 계약 선택지
});

test("임대인은 내 건물의 민원만 본다 — 미확인(OPEN)이 위로", async () => {
  const scene = await createComplaintScene();
  const resolved = await addComplaint(scene, {
    title: "해결된 민원",
    status: ComplaintStatus.RESOLVED,
  });
  const open = await addComplaint(scene, { title: "새 민원" });

  const other = await createOtherScene();
  await addComplaint(other, { title: "남의 건물 민원" });

  await loginAs(scene.landlord.user.id);
  const body = await (await list("?role=landlord")).json();
  expect(body.complaints.map((complaint: { id: string }) => complaint.id)).toEqual([
    open.id,
    resolved.id,
  ]);
});

test("role 을 생략하면 내 프로필로 정한다 (세입자 계정 → 내 민원)", async () => {
  const scene = await createComplaintScene();
  await addComplaint(scene);
  await loginAs(scene.tenant.user.id);

  const body = await (await list()).json();
  expect(body.complaints).toHaveLength(1);
});

test("없는 유형의 시점을 찍으면 403 — 세입자 계정 + role=landlord", async () => {
  const scene = await createComplaintScene();
  await loginAs(scene.tenant.user.id);
  expect((await list("?role=landlord")).status).toBe(403);
});

test("모르는 role 값은 400", async () => {
  const scene = await createComplaintScene();
  await loginAs(scene.tenant.user.id);
  expect((await list("?role=master")).status).toBe(400);
});

// ── POST ───────────────────────────────────────────────────────────────────

test("접수는 세입자만 — 임대인 계정은 403", async () => {
  const scene = await createComplaintScene();
  await loginAs(scene.landlord.user.id);
  const response = await create({ leaseId: scene.lease.id, title: "누수", body: "물이 샙니다." });
  expect(response.status).toBe(403);
});

test("세입자가 접수하면 201 + OPEN 으로 저장된다 (임대인 홈 배지가 세는 상태)", async () => {
  const scene = await createComplaintScene();
  await loginAs(scene.tenant.user.id);

  const response = await create({
    leaseId: scene.lease.id,
    title: "온수가 나오지 않습니다",
    body: "어제 저녁부터 온수가 전혀 나오지 않습니다.",
  });
  expect(response.status).toBe(201);

  const body = await response.json();
  expect(body.complaint).toMatchObject({
    leaseId: scene.lease.id,
    title: "온수가 나오지 않습니다",
    status: "OPEN",
    tenantName: "박세입",
    landlordName: "김임대",
    photos: [],
    workOrderId: null,
  });
  // 접수 본문이 스레드의 첫 말풍선이 된다(ComplaintMessage 행을 따로 만들지 않는다)
  expect(body.complaint.messages).toHaveLength(1);
  expect(body.complaint.messages[0]).toMatchObject({
    kind: "OPENING",
    authorRole: "TENANT",
    authorProfileId: scene.tenant.profile.id,
  });

  const saved = await prisma.complaint.findUniqueOrThrow({ where: { id: body.complaint.id } });
  expect(saved.status).toBe(ComplaintStatus.OPEN);
  expect(saved.tenantProfileId).toBe(scene.tenant.profile.id);
  expect(await prisma.complaintMessage.count()).toBe(0);
});

test("남의 계약에는 접수할 수 없다 — 403", async () => {
  const scene = await createComplaintScene();
  const { otherTenant } = await createOutsiders();
  await loginAs(otherTenant.user.id);

  const response = await create({ leaseId: scene.lease.id, title: "누수", body: "물이 샙니다." });
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe("FORBIDDEN");
  expect(await prisma.complaint.count()).toBe(0);
});

test("계약이 아예 없는 세입자는 접수 화면이 비고, API 도 403", async () => {
  const scene = await createComplaintScene();
  const { otherTenant } = await createOutsiders();
  await loginAs(otherTenant.user.id);

  // 목록 화면은 빈 상태 + 계약 선택지 0 (화면에서 「민원 접수」 버튼이 비활성이 된다)
  const body = await (await list("?role=tenant")).json();
  expect(body.complaints).toEqual([]);
  expect(body.leases).toEqual([]);

  expect((await create({ leaseId: scene.lease.id, title: "누수", body: "물이 샙니다." })).status).toBe(403);
});

test("없는 계약 id 는 404", async () => {
  const scene = await createComplaintScene();
  await loginAs(scene.tenant.user.id);
  expect((await create({ leaseId: "nope", title: "누수", body: "물이 샙니다." })).status).toBe(404);
});

test("진행 중이 아닌 계약(종료)에는 접수할 수 없다 — 409", async () => {
  const scene = await createComplaintScene({ leaseStatus: LeaseStatus.ENDED });
  await loginAs(scene.tenant.user.id);

  const response = await create({ leaseId: scene.lease.id, title: "누수", body: "물이 샙니다." });
  expect(response.status).toBe(409);
});

test("제목·내용이 짧으면 400", async () => {
  const scene = await createComplaintScene();
  await loginAs(scene.tenant.user.id);
  expect((await create({ leaseId: scene.lease.id, title: "누", body: "물" })).status).toBe(400);
});

test("사진 URL을 보내면 그대로 저장된다 — T2.4 업로드가 붙었을 때의 자리", async () => {
  const scene = await createComplaintScene();
  await loginAs(scene.tenant.user.id);

  const photos = ["https://blob.example.com/leak-1.jpg"];
  const body = await (
    await create({
      leaseId: scene.lease.id,
      title: "천장에서 물이 샙니다",
      body: "사진 첨부합니다.",
      photos,
    })
  ).json();
  expect(body.complaint.photos).toEqual(photos);
});

test("사진 URL 형식이 아니면 400", async () => {
  const scene = await createComplaintScene();
  await loginAs(scene.tenant.user.id);
  expect(
    (
      await create({
        leaseId: scene.lease.id,
        title: "천장 누수",
        body: "사진 첨부합니다.",
        photos: ["not-a-url"],
      })
    ).status,
  ).toBe(400);
});
