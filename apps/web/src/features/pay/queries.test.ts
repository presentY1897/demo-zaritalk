/**
 * 자리페이 조회·헬퍼 (T2.1·T2.2) — 화면이 쓰는 DTO 와 주문 식별자 규칙.
 */
import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test } from "vitest";
import { ORDER_ID_PATTERN } from "./schema";
import {
  buildOrderName,
  findChargeIdByOrderId,
  generateOrderId,
  getPayCheckoutView,
  listTenantPayments,
  payableAmount,
} from "./queries";
import { createOrder, createPayableCharge } from "./testing";

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
});

test("orderId 는 토스 규칙(영문·숫자·-·_·= 6~64자)을 지키고 매번 다르다", () => {
  const ids = new Set(Array.from({ length: 50 }, () => generateOrderId()));
  expect(ids.size).toBe(50);
  for (const id of ids) expect(id).toMatch(ORDER_ID_PATTERN);
});

test("주문명은 100자 제한 안에서 건물·호실·청구월을 담는다", () => {
  const name = buildOrderName({
    year: 2026,
    month: 8,
    lease: { unit: { label: "201호", building: { name: "행당해피빌" } } },
  });
  expect(name).toBe("행당해피빌 201호 2026년 8월 월세");
  expect(name.length).toBeLessThanOrEqual(100);
});

test("결제 금액은 원장 엔진의 잔액 그대로다(음수 없음)", () => {
  expect(payableAmount({ totalDue: 700_000, paidAmount: 0 })).toBe(700_000);
  expect(payableAmount({ totalDue: 700_000, paidAmount: 300_000 })).toBe(400_000);
  expect(payableAmount({ totalDue: 700_000, paidAmount: 900_000 })).toBe(0);
});

test("결제 화면 DTO — 내 청구만 열리고 잔액·내역이 실린다", async () => {
  const { tenant, charge, landlord } = await createPayableCharge();

  const view = await getPayCheckoutView(charge.id, tenant.profile.id, tenant.user.name);
  expect(view).not.toBeNull();
  expect(view!.charge).toMatchObject({ id: charge.id, totalDue: 700_000, outstanding: 700_000 });
  expect(view!.lease).toMatchObject({
    buildingName: landlord.building.name,
    unitLabel: landlord.unit.label,
    landlordName: landlord.user.name,
  });
  expect(view!.customerKey).toBe(tenant.profile.id);
  // 4줄 중 0원 줄까지 그대로 온다(화면이 숨긴다)
  expect(view!.charge.lines).toHaveLength(4);

  // 남의 청구는 null
  const other = await createPayableCharge({
    tenantPhone: "01066666666",
    landlordPhone: "01099999999",
  });
  expect(await getPayCheckoutView(other.charge.id, tenant.profile.id, "박세입")).toBeNull();
  expect(await getPayCheckoutView("nope", tenant.profile.id, "박세입")).toBeNull();
});

test("납부 이력 — 카드/기타를 구분하고 합계를 서버가 계산한다", async () => {
  const { tenant, charge } = await createPayableCharge();
  const order = await createOrder(charge.id, { status: "DONE", paymentKey: "pk_1" });
  await prisma.tossPayment.update({
    where: { id: order.id },
    data: { raw: { payment: { receipt: { url: "https://toss/receipt/1" } } } },
  });
  await prisma.rentPayment.create({
    data: { chargeId: charge.id, amount: 200_000, method: "MANUAL_CHECK", paidAt: new Date(1) },
  });
  await prisma.rentPayment.create({
    data: {
      chargeId: charge.id,
      amount: 500_000,
      method: "CARD",
      paidAt: new Date(2),
      tossPaymentId: order.id,
    },
  });

  const result = await listTenantPayments(tenant.profile.id);
  expect(result.totals).toEqual({
    count: 2,
    amount: 700_000,
    cardCount: 1,
    cardAmount: 500_000,
  });
  // 최근 순
  expect(result.payments.map((p) => p.method)).toEqual(["CARD", "MANUAL_CHECK"]);
  expect(result.payments[0]!.toss).toMatchObject({
    orderId: order.orderId,
    receiptUrl: "https://toss/receipt/1",
    status: "DONE",
  });
  expect(result.payments[1]!.toss).toBeNull();

  // 남의 납부는 섞이지 않는다
  const other = await createPayableCharge({
    tenantPhone: "01066666666",
    landlordPhone: "01099999999",
  });
  await prisma.rentPayment.create({
    data: { chargeId: other.charge.id, amount: 1, method: "MANUAL_CHECK" },
  });
  expect((await listTenantPayments(tenant.profile.id)).totals.count).toBe(2);
});

test("주문번호 → 청구 id 는 내 계약일 때만 돌려준다(재시도 링크용)", async () => {
  const { tenant, charge } = await createPayableCharge();
  const order = await createOrder(charge.id);
  const other = await createPayableCharge({
    tenantPhone: "01066666666",
    landlordPhone: "01099999999",
  });
  const otherOrder = await createOrder(other.charge.id);

  expect(await findChargeIdByOrderId(order.orderId, tenant.profile.id)).toBe(charge.id);
  expect(await findChargeIdByOrderId(otherOrder.orderId, tenant.profile.id)).toBeNull();
  expect(await findChargeIdByOrderId("zari_nope", tenant.profile.id)).toBeNull();
});
