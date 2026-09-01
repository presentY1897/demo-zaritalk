import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { loginAs } from "@/features/landlord/testing";
import { addPayment, createLandlordWithUnit, createLeaseWithCharge } from "@/features/lease/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { utcDate } from "@/lib/rent";
import { DELETE } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (id: string) => new Request(`http://localhost/api/payments/${id}`, { method: "DELETE" });

/** 기한이 지난 700,000원 청구를 완납해 둔 상태 */
async function paidCharge(unitId: string) {
  const { lease } = await createLeaseWithCharge(unitId, { withCharge: false });
  const charge = await prisma.rentCharge.create({
    data: {
      leaseId: lease.id,
      year: 2026,
      month: 8,
      dueDate: utcDate(2026, 8, 5),
      rentAmount: 650_000,
      maintenanceAmount: 50_000,
      totalDue: 700_000,
      paidAmount: 700_000,
      status: "PAID",
    },
  });
  const first = await addPayment(charge.id, 400_000);
  const second = await addPayment(charge.id, 300_000, "VIRTUAL_TRANSFER");
  return { lease, charge, first, second };
}

test("비로그인이면 401", async () => {
  expect((await DELETE(req("x"), ctx("x"))).status).toBe(401);
});

test("없는 납부는 404, 타인 납부는 403", async () => {
  const me = await createLandlordWithUnit("01011111111");
  const other = await createLandlordWithUnit("01099999999");
  const { first } = await paidCharge(other.unit.id);
  await loginAs(me.user.id);

  expect((await DELETE(req("nope"), ctx("nope"))).status).toBe(404);
  expect((await DELETE(req(first.id), ctx(first.id))).status).toBe(403);
  expect(await prisma.rentPayment.count()).toBe(2);
});

test("납부를 지우면 완납이 부분납으로 다시 내려간다(상태 재계산)", async () => {
  const me = await createLandlordWithUnit();
  const { charge, second } = await paidCharge(me.unit.id);
  await loginAs(me.user.id);

  const res = await DELETE(req(second.id), ctx(second.id));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.charge).toMatchObject({
    paidAmount: 400_000,
    outstanding: 300_000,
    status: "PARTIALLY_PAID",
  });
  expect(body.charge.payments).toHaveLength(1);

  const saved = await prisma.rentCharge.findUniqueOrThrow({ where: { id: charge.id } });
  expect(saved).toMatchObject({ paidAmount: 400_000, status: "PARTIALLY_PAID" });
});

test("마지막 납부까지 지우면 기한이 지난 청구는 연체로 돌아간다", async () => {
  const me = await createLandlordWithUnit();
  const { charge, first, second } = await paidCharge(me.unit.id);
  await loginAs(me.user.id);

  await DELETE(req(second.id), ctx(second.id));
  const body = await (await DELETE(req(first.id), ctx(first.id))).json();
  expect(body.charge).toMatchObject({ paidAmount: 0, outstanding: 700_000, status: "OVERDUE" });

  const saved = await prisma.rentCharge.findUniqueOrThrow({ where: { id: charge.id } });
  expect(saved).toMatchObject({ paidAmount: 0, status: "OVERDUE" });
  expect(await prisma.rentPayment.count()).toBe(0);
});

test("자리페이(CARD) 납부는 여기서 취소할 수 없다 — 409", async () => {
  const me = await createLandlordWithUnit();
  const { charge } = await paidCharge(me.unit.id);
  await prisma.rentPayment.deleteMany({ where: { chargeId: charge.id } });
  const card = await addPayment(charge.id, 700_000, "CARD");
  await loginAs(me.user.id);

  const res = await DELETE(req(card.id), ctx(card.id));
  expect(res.status).toBe(409);
  expect(await prisma.rentPayment.count()).toBe(1);
});
