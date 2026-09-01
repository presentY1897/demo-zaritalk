import { LeaseStatus, prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { loginAs } from "@/features/landlord/testing";
import { createLandlordWithUnit } from "@/features/lease/testing";
import { listPendingLeases } from "@/features/tenant/queries";
import {
  addCharge,
  addNoticeTo,
  addPaymentTo,
  createPendingLease,
  createTenant,
  TENANT_PHONE,
} from "@/features/tenant/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { kstYearMonth, previousMonth } from "@/lib/rent";
import { POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const decline = (id: string) =>
  POST(new Request(`http://localhost/api/leases/${id}/decline`, { method: "POST" }), ctx(id));

test("비로그인이면 401", async () => {
  expect((await decline("nope")).status).toBe(401);
});

test("세입자 프로필이 없으면 403", async () => {
  const landlord = await createLandlordWithUnit();
  const lease = await createPendingLease(landlord.unit.id, { tenantPhone: "01011111111" });
  await loginAs(landlord.user.id);
  expect((await decline(lease.id)).status).toBe(403);
});

test("없는 계약 id 는 404", async () => {
  const tenant = await createTenant();
  await loginAs(tenant.user.id);
  expect((await decline("nope")).status).toBe(404);
});

test("전화번호가 다른 계약은 403", async () => {
  const landlord = await createLandlordWithUnit();
  const lease = await createPendingLease(landlord.unit.id, { tenantPhone: "01099999999" });
  const tenant = await createTenant(TENANT_PHONE);
  await loginAs(tenant.user.id);

  expect((await decline(lease.id)).status).toBe(403);
  const after = await prisma.lease.findUniqueOrThrow({ where: { id: lease.id } });
  expect(after.status).toBe(LeaseStatus.PENDING_TENANT);
});

test("거절하면 CANCELLED 가 되고 세입자 연결은 남지 않는다", async () => {
  const landlord = await createLandlordWithUnit();
  const lease = await createPendingLease(landlord.unit.id);
  const tenant = await createTenant(TENANT_PHONE);
  await loginAs(tenant.user.id);

  const response = await decline(lease.id);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.lease.status).toBe("CANCELLED");

  const saved = await prisma.lease.findUniqueOrThrow({ where: { id: lease.id } });
  expect(saved.status).toBe(LeaseStatus.CANCELLED);
  expect(saved.tenantProfileId).toBeNull();
  expect(saved.tenantAcceptedAt).toBeNull();
});

test("거절한 계약은 대기 목록에서 사라진다", async () => {
  const landlord = await createLandlordWithUnit();
  const lease = await createPendingLease(landlord.unit.id);
  const tenant = await createTenant(TENANT_PHONE);
  await loginAs(tenant.user.id);

  expect(await listPendingLeases(TENANT_PHONE)).toHaveLength(1);
  await decline(lease.id);
  expect(await listPendingLeases(TENANT_PHONE)).toHaveLength(0);
});

test("근거 없는 청구는 지우고, 납부 기록이 있는 청구는 남긴다", async () => {
  const landlord = await createLandlordWithUnit();
  const lease = await createPendingLease(landlord.unit.id, { startDate: "2020-01-01" });
  const paid = await addCharge(lease, previousMonth(kstYearMonth()), { paidAmount: 700_000 });
  await addPaymentTo(paid.id, 700_000);
  const unpaid = await addCharge(lease, kstYearMonth());

  const tenant = await createTenant(TENANT_PHONE);
  await loginAs(tenant.user.id);

  const body = await (await decline(lease.id)).json();
  expect(body.settlement).toEqual({ removedCharges: 1, keptCharges: 1 });

  const remaining = await prisma.rentCharge.findMany({ where: { leaseId: lease.id } });
  expect(remaining.map((charge) => charge.id)).toEqual([paid.id]);
  expect(await prisma.rentCharge.findUnique({ where: { id: unpaid.id } })).toBeNull();
});

test("고지서를 보낸 청구는 남긴다 (공개 고지서가 아직 참조한다)", async () => {
  const landlord = await createLandlordWithUnit();
  const lease = await createPendingLease(landlord.unit.id);
  const charge = await addCharge(lease, kstYearMonth());
  await addNoticeTo(lease.id, charge.id);

  const tenant = await createTenant(TENANT_PHONE);
  await loginAs(tenant.user.id);

  const body = await (await decline(lease.id)).json();
  expect(body.settlement).toEqual({ removedCharges: 0, keptCharges: 1 });
  expect(await prisma.rentCharge.findUnique({ where: { id: charge.id } })).not.toBeNull();
});

test("이미 수락(ACTIVE)한 계약은 거절할 수 없다 (409)", async () => {
  const landlord = await createLandlordWithUnit();
  const tenant = await createTenant(TENANT_PHONE);
  const lease = await createPendingLease(landlord.unit.id, {
    status: LeaseStatus.ACTIVE,
    tenantProfileId: tenant.profile.id,
  });
  await loginAs(tenant.user.id);

  expect((await decline(lease.id)).status).toBe(409);
});

test("이미 거절한 계약을 또 거절하면 409", async () => {
  const landlord = await createLandlordWithUnit();
  const lease = await createPendingLease(landlord.unit.id);
  const tenant = await createTenant(TENANT_PHONE);
  await loginAs(tenant.user.id);

  expect((await decline(lease.id)).status).toBe(200);
  expect((await decline(lease.id)).status).toBe(409);
});
