/**
 * `POST /api/complaints/[id]/messages` 테스트 (T2.6).
 *
 * **task 문서의 최소 테스트가 여기 있다** — 스레드 권한: 해당 계약의 세입자·임대인만, 제3자 403.
 * 판정 규칙 자체는 `features/complaint/ownership.test.ts`(DB 없음)가 표로 못 박고,
 * 여기서는 그 판정이 401·403·404 로 옮겨지는지와 작성자 기록을 본다.
 */
import { ComplaintStatus, prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { addComplaint, createComplaintScene, createOutsiders } from "@/features/complaint/testing";
import { loginAs } from "@/features/landlord/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const send = (id: string, body: unknown) =>
  POST(
    new Request(`http://localhost/api/complaints/${id}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

test("비로그인이면 401", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);
  expect((await send(complaint.id, { body: "안녕하세요" })).status).toBe(401);
});

test("없는 민원 id 는 404", async () => {
  const scene = await createComplaintScene();
  await loginAs(scene.tenant.user.id);
  expect((await send("nope", { body: "안녕하세요" })).status).toBe(404);
});

test("계약의 세입자는 스레드에 쓸 수 있다 — 작성자가 내 세입자 프로필로 기록된다", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);
  await loginAs(scene.tenant.user.id);

  const response = await send(complaint.id, { body: "오늘도 온수가 안 나옵니다." });
  expect(response.status).toBe(201);

  const body = await response.json();
  expect(body.message).toMatchObject({
    kind: "REPLY",
    authorRole: "TENANT",
    authorProfileId: scene.tenant.profile.id,
    authorName: "박세입",
    body: "오늘도 온수가 안 나옵니다.",
  });
  // 접수 본문(OPENING) + 방금 쓴 답장
  expect(body.complaint.messages).toHaveLength(2);
  expect(body.complaint.messageCount).toBe(2);

  const saved = await prisma.complaintMessage.findFirstOrThrow({
    where: { complaintId: complaint.id },
  });
  expect(saved.authorProfileId).toBe(scene.tenant.profile.id);
});

test("계약의 임대인도 스레드에 쓸 수 있다 — 작성자가 임대인 프로필로 기록된다", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);
  await loginAs(scene.landlord.user.id);

  const body = await (await send(complaint.id, { body: "내일 기사가 방문합니다." })).json();
  expect(body.message).toMatchObject({
    authorRole: "LANDLORD",
    authorProfileId: scene.landlord.profile.id,
    authorName: "김임대",
  });
});

test("**제3자는 403** — 다른 세입자도, 다른 건물의 임대인도 못 쓴다", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);
  const { otherLandlord, otherTenant } = await createOutsiders();

  await loginAs(otherTenant.user.id);
  const tenantResponse = await send(complaint.id, { body: "끼어들기" });
  expect(tenantResponse.status).toBe(403);
  expect((await tenantResponse.json()).error.code).toBe("FORBIDDEN");

  resetTestCookies();
  await loginAs(otherLandlord.user.id);
  expect((await send(complaint.id, { body: "끼어들기" })).status).toBe(403);

  // 제3자의 글은 한 줄도 남지 않는다
  expect(await prisma.complaintMessage.count()).toBe(0);
});

test("빈 메시지·1,000자 초과는 400", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);
  await loginAs(scene.tenant.user.id);

  expect((await send(complaint.id, { body: "   " })).status).toBe(400);
  expect((await send(complaint.id, { body: "가".repeat(1001) })).status).toBe(400);
});

test("종결된 민원(해결)에도 메시지는 남길 수 있다", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene, { status: ComplaintStatus.RESOLVED });
  await loginAs(scene.tenant.user.id);

  expect((await send(complaint.id, { body: "또 같은 문제가 생겼습니다." })).status).toBe(201);
});

test("메시지는 오래된 순으로 쌓이고 마지막 활동 시각이 따라간다", async () => {
  const scene = await createComplaintScene();
  const complaint = await addComplaint(scene);

  await loginAs(scene.tenant.user.id);
  await send(complaint.id, { body: "첫 번째" });
  resetTestCookies();
  await loginAs(scene.landlord.user.id);
  const body = await (await send(complaint.id, { body: "두 번째" })).json();

  expect(body.complaint.messages.map((message: { body: string }) => message.body)).toEqual([
    "어제 저녁부터 온수가 전혀 나오지 않습니다.",
    "첫 번째",
    "두 번째",
  ]);
  expect(body.complaint.lastMessageAt >= body.complaint.createdAt).toBe(true);
});
