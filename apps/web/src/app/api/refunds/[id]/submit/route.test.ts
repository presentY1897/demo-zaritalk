/**
 * `POST /api/refunds/[id]/submit` 테스트 (T2.4) — 제출·보완 재제출.
 *
 * 최소 테스트 요구 중 **"제출 시 필수 서류 검증"** 이 여기 있다.
 */
import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { loginAs } from "@/features/landlord/testing";
import {
  createApplication,
  createOtherRefundScene,
  createRefundScene,
  docMeta,
  requiredDocs,
} from "@/features/refund/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const submit = (id: string) =>
  POST(new Request(`http://localhost/api/refunds/${id}/submit`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });

test("비로그인 401 · 없는 id 404 · 남의 신청 403", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene, { documents: requiredDocs() });

  expect((await submit(app.id)).status).toBe(401);

  const other = await createOtherRefundScene();
  await loginAs(other.tenant.user.id);
  expect((await submit(app.id)).status).toBe(403);
  expect((await submit("nope")).status).toBe(404);
});

test("**필수 서류가 없으면 400** — 무엇이 없는지 details 로 알려 준다", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene, { documents: [] });
  await loginAs(scene.tenant.user.id);

  const response = await submit(app.id);
  expect(response.status).toBe(400);

  const body = await response.json();
  expect(body.error.code).toBe("VALIDATION_ERROR");
  expect(body.error.details.missingSlots).toEqual(["LEASE_CONTRACT", "RESIDENT_REGISTRATION"]);

  const row = await prisma.refundApplication.findUnique({ where: { id: app.id } });
  expect(row?.status).toBe("DRAFT"); // 상태가 바뀌지 않았다
});

test("**필수 서류가 하나만 있어도 400**", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene, { documents: [docMeta("LEASE_CONTRACT")] });
  await loginAs(scene.tenant.user.id);

  const body = await (await submit(app.id)).json();
  expect(body.error.details.missingSlots).toEqual(["RESIDENT_REGISTRATION"]);
});

test("선택 서류만 있으면 400 — 필수를 대신하지 못한다", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene, { documents: [docMeta("PAYMENT_PROOF")] });
  await loginAs(scene.tenant.user.id);

  expect((await submit(app.id)).status).toBe(400);
});

test("필수 서류가 다 있으면 제출된다 — SUBMITTED + submittedAt 기록", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene, { documents: requiredDocs() });
  await loginAs(scene.tenant.user.id);

  const response = await submit(app.id);
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body.application.status).toBe("SUBMITTED");
  expect(body.application.submittedAt).not.toBeNull();
  expect(body.application.canEdit).toBe(false);
  expect(body.application.canUpload).toBe(false);

  const row = await prisma.refundApplication.findUnique({ where: { id: app.id } });
  expect(row?.status).toBe("SUBMITTED");
  expect(row?.submittedAt).not.toBeNull();
});

test("두 번 제출하면 409 (이미 처리된 신청)", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene, { documents: requiredDocs() });
  await loginAs(scene.tenant.user.id);

  expect((await submit(app.id)).status).toBe(200);
  expect((await submit(app.id)).status).toBe(409);
});

test("심사중·승인·반려·완료 상태에서는 제출할 수 없다 (409)", async () => {
  const scene = await createRefundScene();
  await loginAs(scene.tenant.user.id);

  for (const status of ["SUBMITTED", "REVIEWING", "APPROVED", "REJECTED", "COMPLETED"] as const) {
    const app = await createApplication(scene, { status, documents: requiredDocs() });
    expect((await submit(app.id)).status, `${status} 에서는 제출 불가`).toBe(409);
  }
});

test("보완 재제출 — **보완요청 이후 올린 서류가 있어야** 통과하고, REVIEWING 으로 돌아간다", async () => {
  const scene = await createRefundScene();
  const requestedAt = new Date("2026-01-10T00:00:00.000Z");

  // 보완요청을 받았지만 그 뒤로 아무것도 올리지 않은 상태
  const stale = await createApplication(scene, {
    status: "NEED_MORE_DOCS",
    documents: requiredDocs().map((doc) => ({ ...doc, uploadedAt: "2026-01-01T00:00:00.000Z" })),
    submittedAt: new Date("2026-01-05T00:00:00.000Z"),
    decidedAt: requestedAt,
  });
  await loginAs(scene.tenant.user.id);

  const rejected = await submit(stale.id);
  expect(rejected.status).toBe(400);
  expect((await rejected.json()).error.message).toContain("보완 요청 이후");

  // 보완요청 뒤에 한 장 더 올린 상태
  const supplemented = await createApplication(scene, {
    status: "NEED_MORE_DOCS",
    documents: [
      ...requiredDocs().map((doc) => ({ ...doc, uploadedAt: "2026-01-01T00:00:00.000Z" })),
      docMeta("RESIDENT_REGISTRATION", {
        uploadedAt: "2026-01-11T00:00:00.000Z",
        stage: "SUPPLEMENT",
      }),
    ],
    submittedAt: new Date("2026-01-05T00:00:00.000Z"),
    decidedAt: requestedAt,
  });

  const response = await submit(supplemented.id);
  expect(response.status).toBe(200);
  expect((await response.json()).application.status).toBe("REVIEWING");
});

test("보완 재제출은 최초 제출 시각(submittedAt)을 덮어쓰지 않는다", async () => {
  const scene = await createRefundScene();
  const firstSubmit = new Date("2026-01-05T00:00:00.000Z");
  const app = await createApplication(scene, {
    status: "NEED_MORE_DOCS",
    documents: [
      ...requiredDocs(),
      docMeta("LEASE_CONTRACT", { uploadedAt: new Date().toISOString(), stage: "SUPPLEMENT" }),
    ],
    submittedAt: firstSubmit,
    decidedAt: new Date("2026-01-10T00:00:00.000Z"),
  });
  await loginAs(scene.tenant.user.id);

  expect((await submit(app.id)).status).toBe(200);
  const row = await prisma.refundApplication.findUnique({ where: { id: app.id } });
  expect(row?.submittedAt?.toISOString()).toBe(firstSubmit.toISOString());
});
