/**
 * `GET·POST /api/refunds` 테스트 (T2.4·T2.5) — 목록(세입자·어드민 큐)·생성.
 */
import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { loginAs } from "@/features/landlord/testing";
import {
  createAdmin,
  createApplication,
  createNonAdmin,
  createOtherRefundScene,
  createRefundScene,
  defaultCalcInput,
  requiredDocs,
} from "@/features/refund/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { GET, POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
  process.env.ADMIN_API_SECRET = "test-admin-secret";
});

const list = (query = "", init?: RequestInit) =>
  GET(new Request(`http://localhost/api/refunds${query}`, init));

const create = (body: unknown) =>
  POST(
    new Request("http://localhost/api/refunds", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

// ── GET (세입자) ────────────────────────────────────────────────────────────

test("비로그인이면 401", async () => {
  expect((await list()).status).toBe(401);
});

test("세입자 프로필이 없으면 403", async () => {
  const scene = await createRefundScene();
  await loginAs(scene.landlord.user.id);
  expect((await list()).status).toBe(403);
});

test("내 신청만 보인다 — 남의 신청은 목록에 없다", async () => {
  const scene = await createRefundScene();
  const mine = await createApplication(scene);

  const other = await createOtherRefundScene();
  await createApplication(other);

  await loginAs(scene.tenant.user.id);
  const body = await (await list()).json();

  expect(body.applications).toHaveLength(1);
  expect(body.applications[0].id).toBe(mine.id);
  // 신청서 자동 채움용 내 계약도 함께 온다
  expect(body.leases).toHaveLength(1);
  expect(body.leases[0].unitLabel).toBe("201호");
});

// ── GET (어드민 큐) ─────────────────────────────────────────────────────────

test("어드민 큐 — 비로그인·시크릿 없으면 401", async () => {
  expect((await list("?scope=review")).status).toBe(401);
});

test("어드민 큐 — **비어드민 세션은 403**", async () => {
  const user = await createNonAdmin();
  await loginAs(user.id);
  const response = await list("?scope=review");
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe("FORBIDDEN");
});

test("어드민 큐 — 어드민 세션이면 200, 기본은 처리 대기 상태만", async () => {
  const scene = await createRefundScene();
  await createApplication(scene, { status: "DRAFT" });
  const submitted = await createApplication(scene, {
    status: "SUBMITTED",
    documents: requiredDocs(),
    submittedAt: new Date(),
  });
  await createApplication(scene, { status: "COMPLETED", documents: requiredDocs() });

  const admin = await createAdmin();
  await loginAs(admin.id);

  const body = await (await list("?scope=review")).json();
  expect(body.applications.map((a: { id: string }) => a.id)).toEqual([submitted.id]);
  expect(body.applications[0].tenantName).toBe("박세입");
  expect(body.counts).toMatchObject({ DRAFT: 1, SUBMITTED: 1, COMPLETED: 1 });
});

test("어드민 큐 — 상태 필터를 쉼표로 받는다", async () => {
  const scene = await createRefundScene();
  const approved = await createApplication(scene, { status: "APPROVED" });
  await createApplication(scene, { status: "SUBMITTED", submittedAt: new Date() });

  const admin = await createAdmin();
  await loginAs(admin.id);

  const body = await (await list("?scope=review&status=APPROVED")).json();
  expect(body.applications.map((a: { id: string }) => a.id)).toEqual([approved.id]);
});

test("어드민 큐 — 로그인 없이 **서비스 시크릿**으로도 부를 수 있다(어드민 앱 서버 액션)", async () => {
  const scene = await createRefundScene();
  await createApplication(scene, { status: "SUBMITTED", submittedAt: new Date() });
  await createAdmin();

  const response = await list("?scope=review", {
    headers: { "x-admin-secret": "test-admin-secret" },
  });
  expect(response.status).toBe(200);
  expect((await response.json()).applications).toHaveLength(1);
});

test("어드민 큐 — 시크릿이 틀리면 403", async () => {
  await createAdmin();
  const response = await list("?scope=review", { headers: { "x-admin-secret": "wrong" } });
  expect(response.status).toBe(403);
});

test("어드민 큐 — 시크릿이 맞아도 **isAdmin 계정이 없으면 403**", async () => {
  const response = await list("?scope=review", {
    headers: { "x-admin-secret": "test-admin-secret" },
  });
  expect(response.status).toBe(403);
});

// ── POST ───────────────────────────────────────────────────────────────────

test("생성 — 201 DRAFT + 계산 결과가 컬럼에 저장된다", async () => {
  const scene = await createRefundScene();
  await loginAs(scene.tenant.user.id);

  const input = defaultCalcInput();
  const response = await create(input);
  expect(response.status).toBe(201);

  const body = await response.json();
  expect(body.application.status).toBe("DRAFT");
  expect(body.application.annualIncome).toBe(input.grossSalary);
  // 작년 한 해 = 12개월 × 50만 = 600만, 공제율 17% → 1,020,000원
  expect(body.application.expectedAmount).toBe(1_020_000);
  expect(body.application.calc.totals.creditAmount).toBe(1_020_000);
  expect(body.application.documents).toEqual([]);
  expect(body.application.missingSlots).toEqual(["LEASE_CONTRACT", "RESIDENT_REGISTRATION"]);
  expect(body.application.canSubmit).toBe(false);

  const row = await prisma.refundApplication.findUnique({ where: { id: body.application.id } });
  expect(row?.expectedAmount).toBe(1_020_000);
  expect(row?.submittedAt).toBeNull();
});

test("생성 — 내 계약을 붙일 수 있다", async () => {
  const scene = await createRefundScene();
  await loginAs(scene.tenant.user.id);

  const body = await (await create({ ...defaultCalcInput(), leaseId: scene.lease.id })).json();
  expect(body.application.leaseId).toBe(scene.lease.id);
  expect(body.application.lease.unitLabel).toBe("201호");
  expect(body.application.lease.landlordName).toBe("김임대");
});

test("생성 — 남의 계약을 붙이면 403, 없는 계약은 404", async () => {
  const scene = await createRefundScene();
  const other = await createOtherRefundScene();
  await loginAs(scene.tenant.user.id);

  expect((await create({ ...defaultCalcInput(), leaseId: other.lease.id })).status).toBe(403);
  expect((await create({ ...defaultCalcInput(), leaseId: "nope" })).status).toBe(404);
});

test("생성 — 0원·음수·기간 역전은 400", async () => {
  const scene = await createRefundScene();
  await loginAs(scene.tenant.user.id);

  const input = defaultCalcInput();
  expect((await create({ ...input, grossSalary: 0 })).status).toBe(400);
  expect((await create({ ...input, monthlyRent: -1 })).status).toBe(400);
  expect(
    (await create({ ...input, startDate: input.endDate, endDate: input.startDate })).status,
  ).toBe(400);
});

test("생성 — 달력에 없는 날짜·미래 시작일은 400", async () => {
  const scene = await createRefundScene();
  await loginAs(scene.tenant.user.id);

  const input = defaultCalcInput();
  // 형식은 맞지만 달력에 없는 날짜. 기간 역전 검증에 먼저 걸리지 않게 같은 해 2월로 잡는다
  const impossible = await create({ ...input, startDate: `${input.startDate.slice(0, 4)}-02-31` });
  expect(impossible.status).toBe(400);
  expect((await impossible.json()).error.message).toContain("존재하지 않는");

  const future = await create({ ...input, startDate: "2099-01-01", endDate: "2099-12-31" });
  expect(future.status).toBe(400);
  expect((await future.json()).error.message).toContain("미래");
});

test("생성 — 이미 작성 중인 DRAFT 가 있으면 409", async () => {
  const scene = await createRefundScene();
  await createApplication(scene, { status: "DRAFT" });
  await loginAs(scene.tenant.user.id);

  const response = await create(defaultCalcInput());
  expect(response.status).toBe(409);
  expect(await prisma.refundApplication.count()).toBe(1);
});

test("생성 — 제출한 신청이 있어도 새 신청은 만들 수 있다", async () => {
  const scene = await createRefundScene();
  await createApplication(scene, { status: "COMPLETED", documents: requiredDocs() });
  await loginAs(scene.tenant.user.id);

  expect((await create(defaultCalcInput())).status).toBe(201);
  expect(await prisma.refundApplication.count()).toBe(2);
});

test("생성 — 비로그인 401 · 세입자 프로필 없으면 403", async () => {
  expect((await create(defaultCalcInput())).status).toBe(401);

  const scene = await createRefundScene();
  await loginAs(scene.landlord.user.id);
  expect((await create(defaultCalcInput())).status).toBe(403);
});
