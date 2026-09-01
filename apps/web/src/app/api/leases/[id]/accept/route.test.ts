import { LeaseStatus, prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { loginAs } from "@/features/landlord/testing";
import { createLandlordWithUnit } from "@/features/lease/testing";
import { addCharge, createPendingLease, createTenant, TENANT_PHONE } from "@/features/tenant/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { kstToday, kstYearMonth, previousMonth } from "@/lib/rent";
import { POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const accept = (id: string) =>
  POST(new Request(`http://localhost/api/leases/${id}/accept`, { method: "POST" }), ctx(id));

test("비로그인이면 401", async () => {
  expect((await accept("nope")).status).toBe(401);
});

test("세입자 프로필이 없으면 403", async () => {
  const landlord = await createLandlordWithUnit();
  const lease = await createPendingLease(landlord.unit.id, { tenantPhone: "01011111111" });
  await loginAs(landlord.user.id);
  expect((await accept(lease.id)).status).toBe(403);
});

test("없는 계약 id 는 404", async () => {
  const tenant = await createTenant();
  await loginAs(tenant.user.id);
  expect((await accept("nope")).status).toBe(404);
});

test("전화번호가 다른 계약은 403", async () => {
  const landlord = await createLandlordWithUnit();
  const lease = await createPendingLease(landlord.unit.id, { tenantPhone: "01099999999" });
  const tenant = await createTenant(TENANT_PHONE);
  await loginAs(tenant.user.id);

  const response = await accept(lease.id);
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe("FORBIDDEN");

  // 계약은 그대로 대기 상태
  const after = await prisma.lease.findUniqueOrThrow({ where: { id: lease.id } });
  expect(after.status).toBe(LeaseStatus.PENDING_TENANT);
  expect(after.tenantProfileId).toBeNull();
});

test("수락하면 tenantProfileId·tenantAcceptedAt·ACTIVE 가 한 번에 기록된다", async () => {
  const landlord = await createLandlordWithUnit();
  const lease = await createPendingLease(landlord.unit.id);
  const tenant = await createTenant(TENANT_PHONE);
  await loginAs(tenant.user.id);

  const before = Date.now();
  const response = await accept(lease.id);
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body.lease).toMatchObject({
    id: lease.id,
    status: "ACTIVE",
    tenantProfileId: tenant.profile.id,
    landlordName: "김임대",
  });
  expect(body.lease.tenantAcceptedAt).not.toBeNull();

  const saved = await prisma.lease.findUniqueOrThrow({ where: { id: lease.id } });
  expect(saved.status).toBe(LeaseStatus.ACTIVE);
  expect(saved.tenantProfileId).toBe(tenant.profile.id);
  expect(saved.tenantAcceptedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
});

test("이미 ACTIVE 인 계약은 409", async () => {
  const landlord = await createLandlordWithUnit();
  const tenant = await createTenant(TENANT_PHONE);
  const lease = await createPendingLease(landlord.unit.id, {
    status: LeaseStatus.ACTIVE,
    tenantProfileId: tenant.profile.id,
  });
  await loginAs(tenant.user.id);

  const response = await accept(lease.id);
  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe("CONFLICT");
});

test("같은 번호라도 다른 계정이 먼저 수락했으면 409", async () => {
  const landlord = await createLandlordWithUnit();
  const other = await createTenant("01077777777", "먼저수락");
  const lease = await createPendingLease(landlord.unit.id, {
    status: LeaseStatus.ACTIVE,
    tenantProfileId: other.profile.id,
  });
  const tenant = await createTenant(TENANT_PHONE);
  await loginAs(tenant.user.id);

  const response = await accept(lease.id);
  expect(response.status).toBe(409);
  expect((await response.json()).error.message).toContain("다른 계정");

  const saved = await prisma.lease.findUniqueOrThrow({ where: { id: lease.id } });
  expect(saved.tenantProfileId).toBe(other.profile.id);
});

test("종료·취소된 계약은 수락할 수 없다 (409)", async () => {
  const landlord = await createLandlordWithUnit("01011111111", ["201호", "202호"]);
  const ended = await createPendingLease(landlord.units[0]!.id, { status: LeaseStatus.ENDED });
  const cancelled = await createPendingLease(landlord.units[1]!.id, {
    status: LeaseStatus.CANCELLED,
  });
  const tenant = await createTenant(TENANT_PHONE);
  await loginAs(tenant.user.id);

  expect((await accept(ended.id)).status).toBe(409);
  expect((await accept(cancelled.id)).status).toBe(409);
});

test("수락하면 이번 달 청구가 원장 엔진 규칙대로 생긴다", async () => {
  const landlord = await createLandlordWithUnit();
  const lease = await createPendingLease(landlord.unit.id); // 청구 없음
  const tenant = await createTenant(TENANT_PHONE);
  await loginAs(tenant.user.id);

  const body = await (await accept(lease.id)).json();
  const { year, month } = kstYearMonth();

  expect(body.charge).toMatchObject({
    leaseId: lease.id,
    year,
    month,
    // DEFAULT_TERMS: 월세 650,000 + 관리비 50,000, 납부일 5일
    rentAmount: 650_000,
    maintenanceAmount: 50_000,
    carriedOverAmount: 0,
    totalDue: 700_000,
    paidAmount: 0,
  });
  expect(body.charge.dueDate).toBe(`${year}-${String(month).padStart(2, "0")}-05`);
  expect(await prisma.rentCharge.count({ where: { leaseId: lease.id } })).toBe(1);
});

test("이미 이번 달 청구가 있으면 새로 만들지 않는다", async () => {
  const landlord = await createLandlordWithUnit();
  const lease = await createPendingLease(landlord.unit.id);
  const existing = await addCharge(lease, kstYearMonth());
  const tenant = await createTenant(TENANT_PHONE);
  await loginAs(tenant.user.id);

  const body = await (await accept(lease.id)).json();
  expect(body.charge.id).toBe(existing.id);
  expect(await prisma.rentCharge.count({ where: { leaseId: lease.id } })).toBe(1);
});

test("전월 미납이 있으면 이번 달 청구에 이월된다 (원장 엔진 규칙)", async () => {
  const landlord = await createLandlordWithUnit();
  const period = { startDate: "2020-01-01" }; // 전월 청구를 만들 수 있게 시작일을 과거로
  const lease = await createPendingLease(landlord.unit.id, period);
  const before = previousMonth(kstYearMonth());
  await addCharge(lease, before, { paidAmount: 200_000 }); // 700,000 중 200,000 만 납부

  const tenant = await createTenant(TENANT_PHONE);
  await loginAs(tenant.user.id);

  const body = await (await accept(lease.id)).json();
  expect(body.charge.carriedOverAmount).toBe(500_000);
  expect(body.charge.totalDue).toBeGreaterThan(700_000 + 500_000 - 1);
});

test("계약 기간이 이미 끝난 계약은 수락되지만 청구를 만들지 않는다", async () => {
  const landlord = await createLandlordWithUnit();
  const lease = await createPendingLease(landlord.unit.id, {
    startDate: "2020-01-01",
    endDate: "2020-12-31",
  });
  const tenant = await createTenant(TENANT_PHONE);
  await loginAs(tenant.user.id);

  const body = await (await accept(lease.id)).json();
  expect(body.lease.status).toBe("ACTIVE");
  expect(body.charge).toBeNull();
  expect(await prisma.rentCharge.count({ where: { leaseId: lease.id } })).toBe(0);
});

test("저장된 번호에 하이픈이 있어도 정규화해서 매칭한다", async () => {
  const landlord = await createLandlordWithUnit();
  const lease = await createPendingLease(landlord.unit.id, { tenantPhone: "010-5555-5555" });
  const tenant = await createTenant(TENANT_PHONE);
  await loginAs(tenant.user.id);

  expect((await accept(lease.id)).status).toBe(200);
});

test("수락 시각은 지금(KST 오늘 이내)이다", async () => {
  const landlord = await createLandlordWithUnit();
  const lease = await createPendingLease(landlord.unit.id);
  const tenant = await createTenant(TENANT_PHONE);
  await loginAs(tenant.user.id);

  await accept(lease.id);
  const saved = await prisma.lease.findUniqueOrThrow({ where: { id: lease.id } });
  const acceptedAt = saved.tenantAcceptedAt;
  expect(acceptedAt).not.toBeNull();
  // 오늘(KST 달력) 하루 안에 들어온다
  expect(Math.abs(acceptedAt!.getTime() - kstToday().getTime())).toBeLessThan(
    2 * 24 * 60 * 60 * 1000,
  );
});
