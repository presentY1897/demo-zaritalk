import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { loginAs } from "@/features/landlord/testing";
import { createLandlordWithUnit, createLeaseWithCharge } from "@/features/lease/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { utcDate } from "@/lib/rent";
import { POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function post(id: string, body: unknown): Promise<Response> {
  return POST(
    new Request(`http://localhost/api/charges/${id}/payments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx(id),
  );
}

/** 기한이 지난 700,000원 청구(연체) 한 건 — 상태 전이를 보기 좋은 사전 상태 */
async function overdueCharge(unitId: string) {
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
      status: "OVERDUE",
    },
  });
  return { lease, charge };
}

test("비로그인이면 401", async () => {
  expect((await post("x", { amount: 1, method: "MANUAL_CHECK" })).status).toBe(401);
});

test("없는 청구는 404, 타인 청구는 403", async () => {
  const me = await createLandlordWithUnit("01011111111");
  const other = await createLandlordWithUnit("01099999999");
  const { charge } = await overdueCharge(other.unit.id);
  await loginAs(me.user.id);

  expect((await post("nope", { amount: 1, method: "MANUAL_CHECK" })).status).toBe(404);
  expect((await post(charge.id, { amount: 1, method: "MANUAL_CHECK" })).status).toBe(403);
  expect(await prisma.rentPayment.count()).toBe(0);
});

test("초과 납부는 400 — 남은 금액을 넘겨 받을 수 없다", async () => {
  const me = await createLandlordWithUnit();
  const { charge } = await overdueCharge(me.unit.id);
  await loginAs(me.user.id);

  const res = await post(charge.id, { amount: 700_001, method: "MANUAL_CHECK" });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  expect(await prisma.rentPayment.count()).toBe(0);

  // 부분납이 쌓인 뒤에도 "남은 금액" 기준으로 막는다
  await post(charge.id, { amount: 400_000, method: "MANUAL_CHECK" });
  expect((await post(charge.id, { amount: 300_001, method: "MANUAL_CHECK" })).status).toBe(400);
  expect((await prisma.rentCharge.findUniqueOrThrow({ where: { id: charge.id } })).paidAmount).toBe(
    400_000,
  );
});

test("부분납이 누적되고 남은 금액을 채우면 완납으로 전이한다", async () => {
  const me = await createLandlordWithUnit();
  const { charge } = await overdueCharge(me.unit.id);
  await loginAs(me.user.id);

  const first = await post(charge.id, { amount: 300_000, method: "MANUAL_CHECK" });
  expect(first.status).toBe(201);
  const afterFirst = (await first.json()).charge;
  expect(afterFirst).toMatchObject({
    paidAmount: 300_000,
    outstanding: 400_000,
    status: "PARTIALLY_PAID",
  });

  const second = await post(charge.id, { amount: 200_000, method: "MANUAL_CHECK" });
  expect((await second.json()).charge).toMatchObject({
    paidAmount: 500_000,
    outstanding: 200_000,
    status: "PARTIALLY_PAID",
  });

  const third = await post(charge.id, { amount: 200_000, method: "VIRTUAL_TRANSFER" });
  const final = (await third.json()).charge;
  expect(final).toMatchObject({ paidAmount: 700_000, outstanding: 0, status: "PAID" });
  expect(final.payments).toHaveLength(3);

  // DB의 paidAmount·status 도 함께 갱신된다(원본은 RentPayment 합계)
  const saved = await prisma.rentCharge.findUniqueOrThrow({ where: { id: charge.id } });
  expect(saved).toMatchObject({ paidAmount: 700_000, status: "PAID" });
});

test("가상 입금은 입금자명이 메모로 남는다", async () => {
  const me = await createLandlordWithUnit();
  const { charge } = await overdueCharge(me.unit.id);
  await loginAs(me.user.id);

  const body = await (
    await post(charge.id, { amount: 700_000, method: "VIRTUAL_TRANSFER", memo: "박세입" })
  ).json();
  expect(body.charge.payments[0]).toMatchObject({
    amount: 700_000,
    method: "VIRTUAL_TRANSFER",
    memo: "박세입",
  });
  expect(body.charge.status).toBe("PAID");
});

test("0원·음수·CARD 는 400", async () => {
  const me = await createLandlordWithUnit();
  const { charge } = await overdueCharge(me.unit.id);
  await loginAs(me.user.id);

  expect((await post(charge.id, { amount: 0, method: "MANUAL_CHECK" })).status).toBe(400);
  expect((await post(charge.id, { amount: -100, method: "MANUAL_CHECK" })).status).toBe(400);
  // 자리페이(CARD)는 T2.2 의 토스 확인 흐름에서만 만들어져야 한다
  expect((await post(charge.id, { amount: 100, method: "CARD" })).status).toBe(400);
  expect(await prisma.rentPayment.count()).toBe(0);
});
