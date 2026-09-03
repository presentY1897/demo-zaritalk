/**
 * `GET /api/admin/metrics/funnel` 테스트 (T6.1·T6.2).
 */
import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { loginAs } from "@/features/landlord/testing";
import { createAdmin, createNonAdmin } from "@/features/refund/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { GET } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
  process.env.ADMIN_API_SECRET = "test-admin-secret";
});

const funnel = (query = "", headers?: Record<string, string>) =>
  GET(new Request(`http://localhost/api/admin/metrics/funnel${query}`, { headers }));

async function assign(anonId: string, variant: string, userId?: string) {
  return prisma.abAssignment.create({
    data: { anonId, experimentKey: "notice_cta", variant, userId: userId ?? null },
  });
}

async function track(anonId: string, name: string, variant?: string) {
  return prisma.trackingEvent.create({
    data: { anonId, name, props: variant ? { experiment: "notice_cta", variant } : undefined },
  });
}

test("세션도 시크릿도 없으면 401 · 비어드민은 403", async () => {
  expect((await funnel()).status).toBe(401);

  const user = await createNonAdmin();
  await loginAs(user.id);
  expect((await funnel()).status).toBe(403);
});

test("어드민 서비스 시크릿으로도 통과한다", async () => {
  await createAdmin();
  expect((await funnel("", { "x-admin-secret": "test-admin-secret" })).status).toBe(200);
});

test("없는 실험 키는 404", async () => {
  const admin = await createAdmin();
  await loginAs(admin.id);
  const response = await funnel("?experiment=no_such_experiment");
  expect(response.status).toBe(404);
  expect((await response.json()).error.code).toBe("NOT_FOUND");
});

test("실험을 지정하지 않으면 notice_cta 를 본다 — 빈 데이터면 전부 0", async () => {
  const admin = await createAdmin();
  await loginAs(admin.id);

  const { funnel: result } = await (await funnel()).json();
  expect(result.experimentKey).toBe("notice_cta");
  expect(result.steps.map((step: { event: string }) => step.event)).toEqual([
    "notice_view",
    "notice_cta_click",
    "signup_start",
    "signup_complete",
  ]);
  expect(result.variants).toHaveLength(2);
  for (const variant of result.variants) {
    expect(variant.assignedCount).toBe(0);
    expect(variant.steps.map((step: { count: number }) => step.count)).toEqual([0, 0, 0, 0]);
  }
});

test("변형별로 분리되고 anonId 중복 제거로 센다", async () => {
  const admin = await createAdmin();
  const user = await prisma.user.create({ data: { phone: "01099998888", name: "홍미가" } });
  await loginAs(admin.id);

  await assign("a".repeat(32), "A");
  await assign("b".repeat(32), "B", user.id);
  await assign("c".repeat(32), "B");

  // A: 같은 사람이 세 번 열람 → 1명
  await track("a".repeat(32), "notice_view", "A");
  await track("a".repeat(32), "notice_view", "A");
  await track("a".repeat(32), "notice_view", "A");

  // B: 둘 다 열람, 하나는 가입까지
  await track("b".repeat(32), "notice_view", "B");
  await track("b".repeat(32), "notice_cta_click", "B");
  await track("b".repeat(32), "signup_start");
  await track("b".repeat(32), "signup_complete");
  await track("c".repeat(32), "notice_view", "B");

  // 배정되지 않은 방문자의 가입 이벤트는 세지 않는다
  await track("d".repeat(32), "signup_complete");

  const { funnel: result } = await (await funnel()).json();
  const byVariant = Object.fromEntries(
    result.variants.map((variant: { variant: string }) => [variant.variant, variant]),
  );

  expect(byVariant.A.assignedCount).toBe(1);
  expect(byVariant.A.steps.map((step: { count: number }) => step.count)).toEqual([1, 0, 0, 0]);
  expect(byVariant.B.assignedCount).toBe(2);
  expect(byVariant.B.steps.map((step: { count: number }) => step.count)).toEqual([2, 1, 1, 1]);
  expect(byVariant.B.conversionRate).toBe(0.5);

  expect(result.totals.assigned).toBe(3);
  expect(result.totals.linkedUsers).toBe(1);
});

test("`?variant=` 미리보기로 남은 이벤트는 세지 않는다 (실험 오염 차단)", async () => {
  const admin = await createAdmin();
  await loginAs(admin.id);

  await assign("a".repeat(32), "A");
  await track("a".repeat(32), "notice_view", "B"); // ?variant=B 로 강제한 화면
  await track("a".repeat(32), "notice_cta_click", "B");

  const { funnel: result } = await (await funnel()).json();
  for (const variant of result.variants) {
    expect(variant.steps.map((step: { count: number }) => step.count)).toEqual([0, 0, 0, 0]);
  }
  expect(result.totals.mismatchedEvents).toBe(2);
});
