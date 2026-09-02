/**
 * `POST /api/refunds/[id]/review` 테스트 (T2.5) — 어드민 심사 액션.
 *
 * 최소 테스트 요구 중 **"상태 머신 허용 전이표"** 와 **"비어드민 403"** 이 여기 있다.
 * 전이표 자체(DB 없는 순수 규칙)는 `features/refund/status.test.ts` 가 따로 지킨다.
 */
import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { loginAs } from "@/features/landlord/testing";
import {
  createAdmin,
  createApplication,
  createNonAdmin,
  createRefundScene,
  requiredDocs,
} from "@/features/refund/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
  process.env.ADMIN_API_SECRET = "test-admin-secret";
});

const review = (id: string, body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request(`http://localhost/api/refunds/${id}/review`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

async function submittedApplication() {
  const scene = await createRefundScene();
  const application = await createApplication(scene, {
    status: "SUBMITTED",
    documents: requiredDocs(),
    submittedAt: new Date(),
  });
  return { scene, application };
}

// ── 권한 ────────────────────────────────────────────────────────────────────

test("비로그인·시크릿 없으면 401", async () => {
  const { application } = await submittedApplication();
  expect((await review(application.id, { action: "START" })).status).toBe(401);
});

test("**비어드민 세션은 403** — 세입자 본인이어도 자기 신청을 심사할 수 없다", async () => {
  const { scene, application } = await submittedApplication();
  await loginAs(scene.tenant.user.id);

  const response = await review(application.id, { action: "START" });
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe("FORBIDDEN");

  const row = await prisma.refundApplication.findUnique({ where: { id: application.id } });
  expect(row?.status).toBe("SUBMITTED");
});

test("어드민이 아닌 일반 계정도 403", async () => {
  const { application } = await submittedApplication();
  const user = await createNonAdmin("01033333333");
  await loginAs(user.id);
  expect((await review(application.id, { action: "START" })).status).toBe(403);
});

test("서비스 시크릿으로도 심사할 수 있다 — 심사자는 DB 의 isAdmin 계정", async () => {
  const { application } = await submittedApplication();
  const admin = await createAdmin();

  const response = await review(
    application.id,
    { action: "START" },
    { "x-admin-secret": "test-admin-secret" },
  );
  expect(response.status).toBe(200);

  const row = await prisma.refundApplication.findUnique({ where: { id: application.id } });
  expect(row?.reviewedById).toBe(admin.id);
});

test("없는 신청은 404", async () => {
  const admin = await createAdmin();
  await loginAs(admin.id);
  expect((await review("nope", { action: "START" })).status).toBe(404);
});

test("모르는 액션은 400", async () => {
  const { application } = await submittedApplication();
  const admin = await createAdmin();
  await loginAs(admin.id);
  expect((await review(application.id, { action: "DELETE" })).status).toBe(400);
});

// ── 전이표 ──────────────────────────────────────────────────────────────────

test("심사시작 — SUBMITTED 에서만 되고, 상태·심사자가 기록된다", async () => {
  const { application } = await submittedApplication();
  const admin = await createAdmin();
  await loginAs(admin.id);

  const response = await review(application.id, { action: "START" });
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body.application.status).toBe("REVIEWING");
  expect(body.application.reviewedByName).toBe("관리자");

  const row = await prisma.refundApplication.findUnique({ where: { id: application.id } });
  expect(row?.status).toBe("REVIEWING");
  expect(row?.reviewedById).toBe(admin.id);
  // 심사 「시작」은 결정이 아니다 — decidedAt 은 아직 비어 있다
  expect(row?.decidedAt).toBeNull();
});

test("**SUBMITTED 에서 바로 승인·반려·보완요청은 409**", async () => {
  const scene = await createRefundScene();
  const admin = await createAdmin();
  await loginAs(admin.id);

  for (const action of ["APPROVE", "REJECT", "NEED_MORE_DOCS"] as const) {
    const application = await createApplication(scene, {
      status: "SUBMITTED",
      documents: requiredDocs(),
      submittedAt: new Date(),
    });
    const response = await review(application.id, { action, note: "사유" });
    expect(response.status, `SUBMITTED 에서 ${action} 은 거부`).toBe(409);

    const row = await prisma.refundApplication.findUnique({ where: { id: application.id } });
    expect(row?.status).toBe("SUBMITTED");
  }
});

test("이미 심사중인 건에 심사시작을 또 누르면 409", async () => {
  const scene = await createRefundScene();
  const application = await createApplication(scene, {
    status: "REVIEWING",
    documents: requiredDocs(),
    submittedAt: new Date(),
  });
  const admin = await createAdmin();
  await loginAs(admin.id);

  expect((await review(application.id, { action: "START" })).status).toBe(409);
});

test("**코멘트 없는 반려·보완요청은 400**", async () => {
  const scene = await createRefundScene();
  const admin = await createAdmin();
  await loginAs(admin.id);

  for (const action of ["REJECT", "NEED_MORE_DOCS"] as const) {
    const application = await createApplication(scene, {
      status: "REVIEWING",
      documents: requiredDocs(),
      submittedAt: new Date(),
    });

    const empty = await review(application.id, { action });
    expect(empty.status, `${action} 은 코멘트 필수`).toBe(400);

    const blank = await review(application.id, { action, note: "   " });
    expect(blank.status, `${action} 은 공백 코멘트도 거부`).toBe(400);

    const row = await prisma.refundApplication.findUnique({ where: { id: application.id } });
    expect(row?.status).toBe("REVIEWING");
  }
});

test("보완요청 — 코멘트·결정 시각·심사자가 기록되고 세입자에게 알림톡 시뮬이 남는다", async () => {
  const scene = await createRefundScene();
  const application = await createApplication(scene, {
    status: "REVIEWING",
    documents: requiredDocs(),
    submittedAt: new Date(),
  });
  const admin = await createAdmin();
  await loginAs(admin.id);

  const response = await review(application.id, {
    action: "NEED_MORE_DOCS",
    note: "등본에 전입일이 보이지 않습니다.",
  });
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body.application.status).toBe("NEED_MORE_DOCS");
  expect(body.application.reviewNote).toContain("전입일");
  expect(body.application.canUpload).toBe(true); // 세입자가 다시 올릴 수 있다
  expect(body.notification.toPhone).toBe(scene.tenant.user.phone);

  const row = await prisma.refundApplication.findUnique({ where: { id: application.id } });
  expect(row?.decidedAt).not.toBeNull();
  expect(row?.reviewedById).toBe(admin.id);

  const logs = await prisma.messageLog.findMany({ where: { toPhone: scene.tenant.user.phone } });
  expect(logs).toHaveLength(1);
  expect(logs[0]?.title).toContain("보완요청");
  expect(logs[0]?.body).toContain(application.id);
  expect(logs[0]?.body).toContain("관리자");
});

test("승인 → 지급 완료까지 이어진다 (액션마다 알림톡 1건)", async () => {
  const scene = await createRefundScene();
  const application = await createApplication(scene, {
    status: "REVIEWING",
    documents: requiredDocs(),
    submittedAt: new Date(),
  });
  const admin = await createAdmin();
  await loginAs(admin.id);

  const approved = await (await review(application.id, { action: "APPROVE" })).json();
  expect(approved.application.status).toBe("APPROVED");
  expect(approved.application.availableActions.map((a: { action: string }) => a.action)).toEqual([
    "COMPLETE",
  ]);

  const completed = await (await review(application.id, { action: "COMPLETE" })).json();
  expect(completed.application.status).toBe("COMPLETED");
  expect(completed.application.availableActions).toEqual([]);

  expect(await prisma.messageLog.count({ where: { toPhone: scene.tenant.user.phone } })).toBe(2);
});

test("반려는 종결 — 그 뒤 어떤 액션도 409", async () => {
  const scene = await createRefundScene();
  const application = await createApplication(scene, {
    status: "REVIEWING",
    documents: requiredDocs(),
    submittedAt: new Date(),
  });
  const admin = await createAdmin();
  await loginAs(admin.id);

  expect((await review(application.id, { action: "REJECT", note: "요건 미달" })).status).toBe(200);

  for (const action of ["START", "APPROVE", "COMPLETE", "NEED_MORE_DOCS"] as const) {
    const response = await review(application.id, { action, note: "재시도" });
    expect(response.status, `반려 뒤 ${action} 은 거부`).toBe(409);
  }
});

test("DRAFT 는 심사 대상이 아니다 — 어떤 액션도 409", async () => {
  const scene = await createRefundScene();
  const application = await createApplication(scene, { status: "DRAFT" });
  const admin = await createAdmin();
  await loginAs(admin.id);

  for (const action of ["START", "APPROVE", "REJECT", "NEED_MORE_DOCS", "COMPLETE"] as const) {
    expect((await review(application.id, { action, note: "x" })).status).toBe(409);
  }
});
