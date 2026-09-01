import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { loginAs } from "@/features/landlord/testing";
import { addPayment, createLandlordWithUnit, createLeaseWithCharge } from "@/features/lease/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { utcDate } from "@/lib/rent";
import { GET } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (id: string) => new Request(`http://localhost/api/leases/${id}/charges`);

test("비로그인이면 401", async () => {
  expect((await GET(req("x"), ctx("x"))).status).toBe(401);
});

test("없는 계약은 404, 타인 계약은 403", async () => {
  const me = await createLandlordWithUnit("01011111111");
  const other = await createLandlordWithUnit("01099999999");
  const { lease } = await createLeaseWithCharge(other.unit.id);
  await loginAs(me.user.id);

  expect((await GET(req("nope"), ctx("nope"))).status).toBe(404);
  expect((await GET(req(lease.id), ctx(lease.id))).status).toBe(403);
});

test("청구 목록은 최신 월부터 오고 납부 기록이 함께 담긴다", async () => {
  const me = await createLandlordWithUnit();
  const { lease } = await createLeaseWithCharge(me.unit.id, { withCharge: false });
  const june = await prisma.rentCharge.create({
    data: {
      leaseId: lease.id,
      year: 2026,
      month: 6,
      dueDate: utcDate(2026, 6, 5),
      rentAmount: 650_000,
      maintenanceAmount: 50_000,
      totalDue: 700_000,
      paidAmount: 700_000,
      status: "PAID",
    },
  });
  await addPayment(june.id, 700_000, "VIRTUAL_TRANSFER");
  await prisma.rentCharge.create({
    data: {
      leaseId: lease.id,
      year: 2026,
      month: 7,
      dueDate: utcDate(2026, 7, 5),
      rentAmount: 650_000,
      maintenanceAmount: 50_000,
      totalDue: 700_000,
      status: "OVERDUE",
    },
  });
  await loginAs(me.user.id);

  const body = await (await GET(req(lease.id), ctx(lease.id))).json();
  expect(body.charges.map((c: { month: number }) => c.month)).toEqual([7, 6]);
  expect(body.charges[1].payments).toHaveLength(1);
  expect(body.charges[1].payments[0].method).toBe("VIRTUAL_TRANSFER");
});

test("내역은 원장 엔진 분해 그대로 — 월세+관리비+이월+연체료 4줄, 0원 줄도 온다", async () => {
  const me = await createLandlordWithUnit();
  const { lease } = await createLeaseWithCharge(me.unit.id, { withCharge: false });
  // 시드 8월 시나리오와 같은 금액 (이월 300,000 + 연체료 15,500)
  await prisma.rentCharge.create({
    data: {
      leaseId: lease.id,
      year: 2026,
      month: 8,
      dueDate: utcDate(2026, 8, 5),
      rentAmount: 650_000,
      maintenanceAmount: 50_000,
      carriedOverAmount: 300_000,
      lateFeeAmount: 15_500,
      totalDue: 1_015_500,
      status: "OVERDUE",
    },
  });
  await loginAs(me.user.id);

  const body = await (await GET(req(lease.id), ctx(lease.id))).json();
  const charge = body.charges[0];
  expect(charge.totalDue).toBe(1_015_500);
  expect(charge.outstanding).toBe(1_015_500);
  expect(charge.status).toBe("OVERDUE");
  expect(charge.lines).toEqual([
    { key: "RENT", label: "월세", amount: 650_000, paid: 0 },
    { key: "MAINTENANCE", label: "관리비", amount: 50_000, paid: 0 },
    { key: "CARRY_OVER", label: "전월 이월", amount: 300_000, paid: 0 },
    { key: "LATE_FEE", label: "연체료", amount: 15_500, paid: 0 },
  ]);
});
