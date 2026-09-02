/**
 * `POST /api/toss/checkout` (T2.1).
 *
 * 핵심은 **금액을 서버가 정한다**는 것이다 — 요청 본문에 금액이 없고,
 * 만들어지는 `TossPayment.amount` 는 언제나 원장 엔진이 계산한 청구 잔액이다.
 */
import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createLandlordWithUnit } from "@/features/lease/testing";
import { createPayableCharge, loginAs, stubTossEnv } from "@/features/pay/testing";
import { ORDER_ID_PATTERN } from "@/features/pay/schema";
import { resetTestCookies } from "@/lib/auth/testing";
import { POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
  stubTossEnv();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/toss/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

test("비로그인이면 401", async () => {
  const res = await post({ chargeId: "x" });
  expect(res.status).toBe(401);
  expect(await prisma.tossPayment.count()).toBe(0);
});

test("세입자 프로필이 없으면 403", async () => {
  const landlord = await createLandlordWithUnit();
  await loginAs(landlord.user.id);

  const res = await post({ chargeId: "x" });
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe("FORBIDDEN");
});

test("없는 청구는 404, 남의 청구는 403 — 어느 쪽도 주문을 만들지 않는다", async () => {
  const mine = await createPayableCharge();
  const other = await createPayableCharge({
    tenantPhone: "01066666666",
    landlordPhone: "01099999999",
  });
  await loginAs(mine.tenant.user.id);

  expect((await post({ chargeId: "nope" })).status).toBe(404);
  const forbidden = await post({ chargeId: other.charge.id });
  expect(forbidden.status).toBe(403);
  expect((await forbidden.json()).error.code).toBe("FORBIDDEN");
  expect(await prisma.tossPayment.count()).toBe(0);
});

test("정상 — 201 + READY 주문 1건, 금액은 청구 잔액(전액)", async () => {
  const { tenant, charge, landlord } = await createPayableCharge();
  await loginAs(tenant.user.id);

  const res = await post({ chargeId: charge.id });
  expect(res.status).toBe(201);

  const body = await res.json();
  expect(body).toMatchObject({
    amount: 700_000,
    chargeId: charge.id,
    customerKey: tenant.profile.id,
    customerName: tenant.user.name,
  });
  // 토스 orderId 규칙(영문·숫자·-·_·= 6~64자)을 지킨다
  expect(body.orderId).toMatch(ORDER_ID_PATTERN);
  expect(body.orderName).toContain(landlord.unit.label);

  const rows = await prisma.tossPayment.findMany();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    chargeId: charge.id,
    orderId: body.orderId,
    amount: 700_000,
    status: "READY",
    paymentKey: null,
  });
});

test("부분납부 청구는 잔액만 결제한다 — 클라이언트가 금액을 보낼 수 없다", async () => {
  const { tenant, charge } = await createPayableCharge();
  await prisma.rentPayment.create({
    data: { chargeId: charge.id, amount: 300_000, method: "MANUAL_CHECK" },
  });
  await prisma.rentCharge.update({
    where: { id: charge.id },
    data: { paidAmount: 300_000, status: "PARTIALLY_PAID" },
  });
  await loginAs(tenant.user.id);

  // 금액을 실어 보내도 무시된다(스키마에 없는 필드)
  const res = await post({ chargeId: charge.id, amount: 1 });
  expect(res.status).toBe(201);
  expect((await res.json()).amount).toBe(400_000);
  expect((await prisma.tossPayment.findFirstOrThrow()).amount).toBe(400_000);
});

test("이미 완납된 청구는 409 — 주문을 만들지 않는다", async () => {
  const { tenant, charge } = await createPayableCharge();
  await prisma.rentCharge.update({
    where: { id: charge.id },
    data: { paidAmount: 700_000, status: "PAID" },
  });
  await loginAs(tenant.user.id);

  const res = await post({ chargeId: charge.id });
  expect(res.status).toBe(409);
  expect((await res.json()).error.code).toBe("CONFLICT");
  expect(await prisma.tossPayment.count()).toBe(0);
});

test("토스 키가 없으면 주문을 만들기 전에 막는다", async () => {
  const { tenant, charge } = await createPayableCharge();
  await loginAs(tenant.user.id);
  vi.stubEnv("TOSS_SECRET_KEY", "");

  const res = await post({ chargeId: charge.id });
  expect(res.status).toBe(500);
  expect(await prisma.tossPayment.count()).toBe(0);
});

test("주문번호는 매번 다르다(같은 청구를 두 번 눌러도 주문이 섞이지 않는다)", async () => {
  const { tenant, charge } = await createPayableCharge();
  await loginAs(tenant.user.id);

  const first = await (await post({ chargeId: charge.id })).json();
  const second = await (await post({ chargeId: charge.id })).json();
  expect(first.orderId).not.toBe(second.orderId);
  expect(await prisma.tossPayment.count()).toBe(2);
});
