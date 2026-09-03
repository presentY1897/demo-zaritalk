/**
 * `GET /api/admin/metrics/overview` 테스트 (T6.2).
 */
import { MessageKind, prisma, RefundStatus, TossPaymentStatus } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { createLandlordWithUnit } from "@/features/lease/testing";
import { loginAs } from "@/features/landlord/testing";
import { createAdmin, createNonAdmin } from "@/features/refund/testing";
import { addCharge, addPaymentTo, createPendingLease, createTenant } from "@/features/tenant/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { kstYearMonth } from "@/lib/rent";
import { GET } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
  process.env.ADMIN_API_SECRET = "test-admin-secret";
});

const overview = (query = "", headers?: Record<string, string>) =>
  GET(new Request(`http://localhost/api/admin/metrics/overview${query}`, { headers }));

test("세션도 시크릿도 없으면 401", async () => {
  const response = await overview();
  expect(response.status).toBe(401);
  expect((await response.json()).error.code).toBe("UNAUTHORIZED");
});

test("비어드민 세션은 403", async () => {
  const user = await createNonAdmin();
  await loginAs(user.id);
  const response = await overview();
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe("FORBIDDEN");
});

test("어드민 서비스 시크릿으로도 통과한다 (어드민 앱 서버 액션 경로)", async () => {
  await createAdmin();
  const response = await overview("", { "x-admin-secret": "test-admin-secret" });
  expect(response.status).toBe(200);
});

test("시크릿이 맞아도 isAdmin 계정이 없으면 403", async () => {
  const response = await overview("", { "x-admin-secret": "test-admin-secret" });
  expect(response.status).toBe(403);
});

test("빈 DB 에서도 0 으로 채워져 나온다 (버킷 개수는 그대로)", async () => {
  const admin = await createAdmin();
  await loginAs(admin.id);

  const body = await (await overview()).json();

  expect(body.range.days).toBe(30);
  expect(body.range.months).toBe(6);
  expect(body.daily).toHaveLength(30);
  expect(body.collection.months).toHaveLength(6);
  expect(body.messages.months).toHaveLength(6);
  expect(body.payments.months).toHaveLength(6);
  expect(body.summary.collectionRate).toBe(0);
  expect(body.summary.openRate).toBe(0);
  expect(body.summary.users).toBe(1); // 방금 만든 관리자
  expect(body.refunds.stages).toHaveLength(7);
  expect(body.refunds.total.count).toBe(0);
});

test("수납률·발송열람률·결제액·환급 파이프라인이 실데이터로 채워진다", async () => {
  const admin = await createAdmin();
  await loginAs(admin.id);

  const landlord = await createLandlordWithUnit();
  const tenant = await createTenant();
  const lease = await createPendingLease(landlord.unit.id, {
    tenantProfileId: tenant.profile.id,
    status: "ACTIVE",
  });
  const period = kstYearMonth();
  const charge = await addCharge(lease, period);
  await addPaymentTo(charge.id, Math.floor(charge.totalDue / 2));

  // 발송 2건 중 공개 고지서 링크가 붙은 것은 2건, 그중 1건 열람
  await prisma.messageLog.createMany({
    data: [
      {
        kind: MessageKind.RENT_NOTICE,
        toPhone: "01022222222",
        title: "고지서",
        body: "본문",
        token: "a".repeat(32),
        leaseId: lease.id,
        chargeId: charge.id,
        openedAt: new Date(),
      },
      {
        kind: MessageKind.RENT_NOTICE,
        toPhone: "01022222222",
        title: "고지서",
        body: "본문",
        token: "b".repeat(32),
        leaseId: lease.id,
        chargeId: charge.id,
      },
      // OTP 처럼 열람을 판정할 수 없는 발송은 분모에서 빠진다
      { kind: MessageKind.OTP, toPhone: "01022222222", title: "인증", body: "123456" },
    ],
  });

  await prisma.tossPayment.create({
    data: {
      chargeId: charge.id,
      orderId: "order-1",
      amount: 300_000,
      status: TossPaymentStatus.DONE,
      approvedAt: new Date(),
    },
  });
  // 승인되지 않은 결제는 결제액에 들어가지 않는다
  await prisma.tossPayment.create({
    data: { chargeId: charge.id, orderId: "order-2", amount: 999_000, status: TossPaymentStatus.READY },
  });

  await prisma.refundApplication.createMany({
    data: [
      {
        tenantProfileId: tenant.profile.id,
        annualIncome: 48_000_000,
        startYear: 2025,
        endYear: 2025,
        expectedAmount: 400_000,
        status: RefundStatus.SUBMITTED,
      },
      {
        tenantProfileId: tenant.profile.id,
        annualIncome: 48_000_000,
        startYear: 2025,
        endYear: 2025,
        expectedAmount: 600_000,
        status: RefundStatus.APPROVED,
      },
    ],
  });

  await prisma.trackingEvent.createMany({
    data: [
      { anonId: "a".repeat(32), name: "page_view" },
      { anonId: "a".repeat(32), name: "page_view" },
      { anonId: "b".repeat(32), name: "notice_view" },
    ],
  });

  const body = await (await overview()).json();

  // 수납률 — 절반만 납부
  const month = body.collection.months.find(
    (item: { month: number; year: number }) => item.month === period.month && item.year === period.year,
  );
  expect(month.chargedAmount).toBe(charge.totalDue);
  expect(month.outstandingAmount).toBe(charge.totalDue - Math.floor(charge.totalDue / 2));
  expect(body.summary.collectionRate).toBeGreaterThan(0.49);
  expect(body.summary.collectionRate).toBeLessThan(0.51);

  // 발송·열람 — 열람 분모는 token 이 붙은 발송뿐
  expect(body.messages.total.sent).toBe(3);
  expect(body.messages.total.trackable).toBe(2);
  expect(body.messages.total.opened).toBe(1);
  expect(body.summary.openRate).toBe(0.5);

  // 결제액 — 승인(DONE)분만
  expect(body.payments.total.amount).toBe(300_000);
  expect(body.payments.total.count).toBe(1);

  // 환급 파이프라인
  const submitted = body.refunds.stages.find((stage: { status: string }) => stage.status === "SUBMITTED");
  expect(submitted.count).toBe(1);
  expect(submitted.label).toBe("제출");
  expect(submitted.expectedAmount).toBe(400_000);
  expect(body.refunds.total.count).toBe(2);
  expect(body.summary.refundOpenCount).toBe(1);

  // DAU 는 anonId 중복 제거 — 이벤트 3건이지만 방문자는 2명
  expect(body.summary.visitors).toBe(2);
  expect(body.daily.at(-1).dau).toBe(2);
  expect(body.summary.activeLeases).toBe(1);
});

test("days·months 는 범위를 벗어나면 400 이 아니라 잘라서 쓴다", async () => {
  const admin = await createAdmin();
  await loginAs(admin.id);

  const body = await (await overview("?days=9999&months=0")).json();
  expect(body.range.days).toBe(180);
  expect(body.range.months).toBe(6); // 0 은 기본값으로
  expect(body.daily).toHaveLength(180);
});

test("숫자가 아닌 days 는 400", async () => {
  const admin = await createAdmin();
  await loginAs(admin.id);
  expect((await overview("?days=열흘")).status).toBe(400);
});
