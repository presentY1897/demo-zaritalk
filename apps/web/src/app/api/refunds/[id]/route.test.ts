/**
 * `GET·PATCH /api/refunds/[id]` 테스트 (T2.4) — 상세·수정.
 *
 * 최소 테스트 요구 중 **"DRAFT 아닌 신청 수정 거부"** 가 여기 있다.
 */
import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { loginAs } from "@/features/landlord/testing";
import {
  createAdmin,
  createApplication,
  createOtherRefundScene,
  createRefundScene,
  defaultCalcInput,
  requiredDocs,
} from "@/features/refund/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { GET, PATCH } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const detail = (id: string, init?: RequestInit) =>
  GET(new Request(`http://localhost/api/refunds/${id}`, init), params(id));

const update = (id: string, body: unknown) =>
  PATCH(
    new Request(`http://localhost/api/refunds/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    params(id),
  );

// ── GET ────────────────────────────────────────────────────────────────────

test("비로그인 401 · 없는 id 404 · 남의 신청 403", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene);

  expect((await detail(app.id)).status).toBe(401);

  await loginAs(scene.tenant.user.id);
  expect((await detail("nope")).status).toBe(404);

  const other = await createOtherRefundScene();
  await loginAs(other.tenant.user.id);
  const forbidden = await detail(app.id);
  expect(forbidden.status).toBe(403);
  expect((await forbidden.json()).error.code).toBe("FORBIDDEN");
});

test("내 신청은 상세를 본다 — 산출 내역이 함께 온다", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene, { documents: requiredDocs() });
  await loginAs(scene.tenant.user.id);

  const body = await (await detail(app.id)).json();
  expect(body.application.id).toBe(app.id);
  expect(body.application.calc.totals.creditAmount).toBe(app.expectedAmount);
  expect(body.application.documents).toHaveLength(2);
  // private Blob URL 은 응답에 실리지 않는다 — 뷰어 경로만 준다
  expect(JSON.stringify(body.application.documents)).not.toContain("memory://");
  expect(body.application.documents[0].viewHref).toBe(
    `/api/refunds/${app.id}/documents/${body.application.documents[0].id}`,
  );
});

test("어드민은 남의 신청 상세도 본다 — 신청자 정보가 붙는다", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene, { status: "SUBMITTED", documents: requiredDocs() });

  const admin = await createAdmin();
  await loginAs(admin.id);

  const body = await (await detail(app.id)).json();
  expect(body.application.tenantName).toBe("박세입");
  expect(body.application.tenantPhone).toBe("01022222222");
  expect(body.application.availableActions.map((a: { action: string }) => a.action)).toEqual([
    "START",
  ]);
});

// ── PATCH ──────────────────────────────────────────────────────────────────

test("DRAFT 는 수정된다 — 금액이 다시 계산돼 저장된다", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene);
  await loginAs(scene.tenant.user.id);

  const input = defaultCalcInput();
  const response = await update(app.id, { ...input, monthlyRent: 1_000_000 });
  expect(response.status).toBe(200);

  const body = await response.json();
  // 12개월 × 100만 = 1,200만 → 연 한도 1,000만까지만 공제 → 17% = 1,700,000
  expect(body.application.expectedAmount).toBe(1_700_000);
  expect(body.application.monthlyRent).toBe(1_000_000);

  const row = await prisma.refundApplication.findUnique({ where: { id: app.id } });
  expect(row?.expectedAmount).toBe(1_700_000);
});

test("**DRAFT 가 아니면 수정 거부(409)** — 제출·심사중·보완·승인·반려·완료 전부", async () => {
  const scene = await createRefundScene();
  await loginAs(scene.tenant.user.id);

  for (const status of [
    "SUBMITTED",
    "REVIEWING",
    "NEED_MORE_DOCS",
    "APPROVED",
    "REJECTED",
    "COMPLETED",
  ] as const) {
    const app = await createApplication(scene, { status, documents: requiredDocs() });
    const response = await update(app.id, { ...defaultCalcInput(), monthlyRent: 999_999 });
    expect(response.status, `${status} 는 수정 거부`).toBe(409);
    expect((await response.json()).error.code).toBe("CONFLICT");

    const row = await prisma.refundApplication.findUnique({ where: { id: app.id } });
    expect(row?.expectedAmount).toBe(app.expectedAmount); // 값이 바뀌지 않았다
  }
});

test("수정은 이미 올린 서류를 지우지 않는다", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene, { documents: requiredDocs() });
  await loginAs(scene.tenant.user.id);

  const body = await (await update(app.id, defaultCalcInput())).json();
  expect(body.application.documents).toHaveLength(2);
});

test("수정 — 남의 신청 403 · 없는 id 404 · 비로그인 401", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene);

  expect((await update(app.id, defaultCalcInput())).status).toBe(401);

  const other = await createOtherRefundScene();
  await loginAs(other.tenant.user.id);
  expect((await update(app.id, defaultCalcInput())).status).toBe(403);
  expect((await update("nope", defaultCalcInput())).status).toBe(404);
});

test("수정 — 형식·기간·미래 시작일 검증은 생성과 같다", async () => {
  const scene = await createRefundScene();
  const app = await createApplication(scene);
  await loginAs(scene.tenant.user.id);

  const input = defaultCalcInput();
  expect((await update(app.id, { ...input, grossSalary: -1 })).status).toBe(400);
  expect(
    (await update(app.id, { ...input, startDate: "2099-01-01", endDate: "2099-12-31" })).status,
  ).toBe(400);
});

test("수정 — 남의 계약을 붙이면 403", async () => {
  const scene = await createRefundScene();
  const other = await createOtherRefundScene();
  const app = await createApplication(scene);
  await loginAs(scene.tenant.user.id);

  expect((await update(app.id, { ...defaultCalcInput(), leaseId: other.lease.id })).status).toBe(
    403,
  );
});
