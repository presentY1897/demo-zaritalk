/**
 * `POST /api/toss/confirm` (T2.1) — **돈이 오가는 경로**라 task 최소 테스트의 ①②③이 여기 있다.
 *
 * | 축 | 검증 |
 * |---|---|
 * | ① 금액 위변조 거부 | 클라이언트 금액 ≠ 서버 주문 금액 / 서버 주문 금액 ≠ 청구 잔액 / 토스 승인 금액 ≠ 주문 금액 |
 * | ② DONE orderId 재승인 거부 | 이미 끝난 주문은 409, 납부가 늘지 않는다 |
 * | ③ 승인 실패 시 FAILED | `TossPayment.status = FAILED`, `RentPayment` 미생성 |
 *
 * 토스 API 는 전부 mock 이다(`mockTossFetch`). 승인 전에 거절되는 경우 **토스를 호출조차 하지 않는지**도 본다.
 */
import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createOrder,
  createPayableCharge,
  loginAs,
  mockTossFetch,
  stubTossEnv,
  tossPaymentObject,
} from "@/features/pay/testing";
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
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/toss/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const PAYMENT_KEY = "test_payment_key_abcdef";

/** 로그인한 세입자 + READY 주문 1건(700,000원) */
async function ready(amount = 700_000) {
  const setup = await createPayableCharge();
  const order = await createOrder(setup.charge.id, { amount });
  await loginAs(setup.tenant.user.id);
  return { ...setup, order };
}

// ───────────────────────────────────────────── 가드

test("비로그인이면 401", async () => {
  const res = await post({ paymentKey: PAYMENT_KEY, orderId: "zari_abcdef", amount: 1000 });
  expect(res.status).toBe(401);
});

test("없는 주문번호는 404", async () => {
  const setup = await createPayableCharge();
  await loginAs(setup.tenant.user.id);
  const res = await post({ paymentKey: PAYMENT_KEY, orderId: "zari_nosuchorder", amount: 700_000 });
  expect(res.status).toBe(404);
});

test("남의 주문은 403 — 토스를 부르지 않는다", async () => {
  const other = await createPayableCharge({
    tenantPhone: "01066666666",
    landlordPhone: "01099999999",
  });
  const order = await createOrder(other.charge.id);
  const mine = await createPayableCharge();
  await loginAs(mine.tenant.user.id);
  const calls = mockTossFetch({ confirm: { status: 200, body: tossPaymentObject() } });

  const res = await post({ paymentKey: PAYMENT_KEY, orderId: order.orderId, amount: 700_000 });
  expect(res.status).toBe(403);
  expect(calls).toHaveLength(0);
  expect(await prisma.rentPayment.count()).toBe(0);
});

test("주문번호 형식이 어긋나면 400 (zod)", async () => {
  const setup = await createPayableCharge();
  await loginAs(setup.tenant.user.id);
  const res = await post({ paymentKey: PAYMENT_KEY, orderId: "짧음", amount: 700_000 });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
});

// ───────────────────────────────────────────── ① 금액 위변조 거부

test("축 ① 클라이언트가 보낸 금액이 서버 주문 금액과 다르면 400 — 토스를 부르지 않는다", async () => {
  const { order } = await ready();
  const calls = mockTossFetch({ confirm: { status: 200, body: tossPaymentObject() } });

  // 700,000원 주문인데 1원만 결제했다고 주장
  const res = await post({ paymentKey: PAYMENT_KEY, orderId: order.orderId, amount: 1 });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error.code).toBe("VALIDATION_ERROR");
  expect(body.error.details).toMatchObject({ expected: 700_000, received: 1 });

  // 승인 자체를 시도하지 않았고, 주문은 READY 그대로다
  expect(calls).toHaveLength(0);
  expect(await prisma.rentPayment.count()).toBe(0);
  const toss = await prisma.tossPayment.findUniqueOrThrow({ where: { id: order.id } });
  expect(toss.status).toBe("READY");
  // 이미 결제된 카드를 찾아 환불할 수 있게 거절한 시도는 raw 에 남는다
  expect(JSON.stringify(toss.raw)).toContain("CLIENT_AMOUNT_MISMATCH");
  expect(JSON.stringify(toss.raw)).toContain(PAYMENT_KEY);
  // 승인하지 않은 결제를 이 주문 것으로 확정하지는 않는다
  expect(toss.paymentKey).toBeNull();
});

test("축 ① checkout 이후 청구가 바뀌면(수기 납부 기록) 400 — 옛 금액으로 결제되지 않는다", async () => {
  const { order, charge } = await ready();
  const calls = mockTossFetch({ confirm: { status: 200, body: tossPaymentObject() } });

  // 임대인이 그 사이 300,000원을 받음 체크 → 잔액 400,000
  await prisma.rentPayment.create({
    data: { chargeId: charge.id, amount: 300_000, method: "MANUAL_CHECK" },
  });
  await prisma.rentCharge.update({
    where: { id: charge.id },
    data: { paidAmount: 300_000, status: "PARTIALLY_PAID" },
  });

  const res = await post({ paymentKey: PAYMENT_KEY, orderId: order.orderId, amount: 700_000 });
  expect(res.status).toBe(400);
  expect((await res.json()).error.details).toMatchObject({ expected: 700_000, outstanding: 400_000 });
  expect(calls).toHaveLength(0);
  // 카드 납부는 생기지 않았다(수기 납부 1건만)
  expect(await prisma.rentPayment.count({ where: { method: "CARD" } })).toBe(0);
  expect(
    JSON.stringify((await prisma.tossPayment.findUniqueOrThrow({ where: { id: order.id } })).raw),
  ).toContain("OUTSTANDING_CHANGED");
});

test("축 ① 토스가 다른 금액을 승인해 돌려주면 원장에 반영하지 않고 FAILED", async () => {
  const { order } = await ready();
  mockTossFetch({
    confirm: { status: 200, body: tossPaymentObject({ totalAmount: 1_000_000 }) },
  });

  const res = await post({ paymentKey: PAYMENT_KEY, orderId: order.orderId, amount: 700_000 });
  expect(res.status).toBe(400);
  expect(await prisma.rentPayment.count()).toBe(0);
  expect((await prisma.tossPayment.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
    "FAILED",
  );
});

test("초과 납부 방지 — 잔액을 넘는 결제는 금액 검증에서 걸린다", async () => {
  const setup = await createPayableCharge();
  // 잔액(700,000)보다 큰 주문을 억지로 만들어 둔다
  const order = await createOrder(setup.charge.id, { amount: 900_000 });
  await loginAs(setup.tenant.user.id);
  const calls = mockTossFetch({ confirm: { status: 200, body: tossPaymentObject() } });

  const res = await post({ paymentKey: PAYMENT_KEY, orderId: order.orderId, amount: 900_000 });
  expect(res.status).toBe(400);
  expect(calls).toHaveLength(0);
  expect(await prisma.rentPayment.count()).toBe(0);
  const charge = await prisma.rentCharge.findUniqueOrThrow({ where: { id: setup.charge.id } });
  expect(charge.paidAmount).toBe(0);
});

// ───────────────────────────────────────────── 정상 승인 + 원장 반영

test("정상 승인 — DONE + RentPayment(CARD) + 청구 완납 전이", async () => {
  const { order, charge } = await ready();
  const calls = mockTossFetch({
    confirm: {
      status: 200,
      body: tossPaymentObject({ paymentKey: PAYMENT_KEY, orderId: order.orderId }),
    },
  });

  const res = await post({ paymentKey: PAYMENT_KEY, orderId: order.orderId, amount: 700_000 });
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body.receipt).toMatchObject({
    orderId: order.orderId,
    paymentKey: PAYMENT_KEY,
    amount: 700_000,
    method: "카드",
    cardCompany: "신한",
    receiptUrl: "https://dashboard.tosspayments.com/receipt/test",
    status: "DONE",
  });
  // 원장 반영 결과가 응답에 그대로 들어 있다(화면이 다시 조회할 필요 없음)
  expect(body.charge).toMatchObject({
    id: charge.id,
    totalDue: 700_000,
    paidAmount: 700_000,
    outstanding: 0,
    status: "PAID",
  });

  // ── 승인 요청이 문서대로 나갔는가
  expect(calls).toHaveLength(1);
  const call = calls[0]!;
  expect(call.url).toBe("https://api.tosspayments.com/v1/payments/confirm");
  expect(call.method).toBe("POST");
  expect(call.body).toEqual({ paymentKey: PAYMENT_KEY, orderId: order.orderId, amount: 700_000 });
  // Basic base64("<secret>:") — 콜론까지 포함해야 한다
  expect(call.headers.get("authorization")).toBe(
    `Basic ${Buffer.from("test_gsk_unit_test:").toString("base64")}`,
  );
  // 중복 승인을 토스 쪽에서도 막는다
  expect(call.headers.get("idempotency-key")).toBe(order.orderId);

  // ── DB
  const toss = await prisma.tossPayment.findUniqueOrThrow({ where: { id: order.id } });
  expect(toss).toMatchObject({ status: "DONE", paymentKey: PAYMENT_KEY, amount: 700_000 });
  expect(toss.approvedAt).not.toBeNull();

  const payments = await prisma.rentPayment.findMany();
  expect(payments).toHaveLength(1);
  expect(payments[0]).toMatchObject({
    chargeId: charge.id,
    amount: 700_000,
    method: "CARD",
    tossPaymentId: order.id,
  });

  const updated = await prisma.rentCharge.findUniqueOrThrow({ where: { id: charge.id } });
  expect(updated).toMatchObject({ paidAmount: 700_000, status: "PAID" });
});

test("부분납부 청구는 잔액만 결제하고 완납으로 전이한다", async () => {
  const setup = await createPayableCharge();
  await prisma.rentPayment.create({
    data: { chargeId: setup.charge.id, amount: 300_000, method: "MANUAL_CHECK" },
  });
  await prisma.rentCharge.update({
    where: { id: setup.charge.id },
    data: { paidAmount: 300_000, status: "PARTIALLY_PAID" },
  });
  const order = await createOrder(setup.charge.id, { amount: 400_000 });
  await loginAs(setup.tenant.user.id);
  mockTossFetch({
    confirm: {
      status: 200,
      body: tossPaymentObject({
        paymentKey: PAYMENT_KEY,
        orderId: order.orderId,
        totalAmount: 400_000,
      }),
    },
  });

  const res = await post({ paymentKey: PAYMENT_KEY, orderId: order.orderId, amount: 400_000 });
  expect(res.status).toBe(200);
  expect((await res.json()).charge).toMatchObject({ paidAmount: 700_000, status: "PAID" });
  expect(await prisma.rentPayment.count()).toBe(2);
});

// ───────────────────────────────────────────── ② 재승인 거부

test("축 ② DONE 주문은 재승인하지 않는다 — 409, 납부가 늘지 않는다", async () => {
  const { order } = await ready();
  mockTossFetch({
    confirm: {
      status: 200,
      body: tossPaymentObject({ paymentKey: PAYMENT_KEY, orderId: order.orderId }),
    },
  });

  const first = await post({ paymentKey: PAYMENT_KEY, orderId: order.orderId, amount: 700_000 });
  expect(first.status).toBe(200);

  const second = await post({ paymentKey: PAYMENT_KEY, orderId: order.orderId, amount: 700_000 });
  expect(second.status).toBe(409);
  expect((await second.json()).error.code).toBe("CONFLICT");

  expect(await prisma.rentPayment.count()).toBe(1);
  expect(
    (await prisma.rentCharge.findUniqueOrThrow({ where: { id: order.chargeId } })).paidAmount,
  ).toBe(700_000);
});

test("축 ② CANCELED·FAILED 주문도 재승인하지 않는다", async () => {
  const setup = await createPayableCharge();
  await loginAs(setup.tenant.user.id);
  mockTossFetch({ confirm: { status: 200, body: tossPaymentObject() } });

  for (const status of ["CANCELED", "FAILED"] as const) {
    const order = await createOrder(setup.charge.id, { status });
    const res = await post({ paymentKey: PAYMENT_KEY, orderId: order.orderId, amount: 700_000 });
    expect(res.status).toBe(409);
  }
  expect(await prisma.rentPayment.count()).toBe(0);
});

test("축 ② 동시 승인 요청이 와도 납부는 1건만 생긴다", async () => {
  const { order, charge } = await ready();
  mockTossFetch({
    confirm: {
      status: 200,
      body: tossPaymentObject({ paymentKey: PAYMENT_KEY, orderId: order.orderId }),
    },
    get: {
      status: 200,
      body: tossPaymentObject({ paymentKey: PAYMENT_KEY, orderId: order.orderId }),
    },
  });

  const results = await Promise.all([
    post({ paymentKey: PAYMENT_KEY, orderId: order.orderId, amount: 700_000 }),
    post({ paymentKey: PAYMENT_KEY, orderId: order.orderId, amount: 700_000 }),
  ]);
  expect(results.filter((res) => res.status === 200)).toHaveLength(1);

  expect(await prisma.rentPayment.count()).toBe(1);
  expect(
    (await prisma.rentCharge.findUniqueOrThrow({ where: { id: charge.id } })).paidAmount,
  ).toBe(700_000);
});

// ───────────────────────────────────────────── ③ 승인 실패

test("축 ③ 토스가 승인을 거절하면 FAILED + RentPayment 미생성", async () => {
  const { order, charge } = await ready();
  mockTossFetch({
    confirm: {
      status: 400,
      body: { code: "REJECT_CARD_COMPANY", message: "카드사에서 결제를 거절했습니다." },
    },
  });

  const res = await post({ paymentKey: PAYMENT_KEY, orderId: order.orderId, amount: 700_000 });
  expect(res.status).toBe(409);
  const body = await res.json();
  expect(body.error.details).toMatchObject({ tossCode: "REJECT_CARD_COMPANY" });

  expect(await prisma.rentPayment.count()).toBe(0);
  const toss = await prisma.tossPayment.findUniqueOrThrow({ where: { id: order.id } });
  expect(toss.status).toBe("FAILED");
  // 실패 사유가 raw 에 남아 대사할 수 있다
  expect(JSON.stringify(toss.raw)).toContain("REJECT_CARD_COMPANY");
  // 청구는 손대지 않았다
  expect(
    (await prisma.rentCharge.findUniqueOrThrow({ where: { id: charge.id } })).paidAmount,
  ).toBe(0);
});

test("축 ③ 승인은 됐는데 상태가 DONE 이 아니면 반영하지 않는다", async () => {
  const { order } = await ready();
  mockTossFetch({
    confirm: {
      status: 200,
      body: tossPaymentObject({
        paymentKey: PAYMENT_KEY,
        orderId: order.orderId,
        status: "WAITING_FOR_DEPOSIT",
      }),
    },
  });

  const res = await post({ paymentKey: PAYMENT_KEY, orderId: order.orderId, amount: 700_000 });
  expect(res.status).toBe(409);
  expect(await prisma.rentPayment.count()).toBe(0);
  expect((await prisma.tossPayment.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
    "FAILED",
  );
});

test("네트워크 오류는 FAILED 로 확정하지 않는다 — 재시도로 복구할 수 있어야 한다", async () => {
  const { order } = await ready();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("fetch failed");
    }),
  );

  const res = await post({ paymentKey: PAYMENT_KEY, orderId: order.orderId, amount: 700_000 });
  expect(res.status).toBe(409);
  const toss = await prisma.tossPayment.findUniqueOrThrow({ where: { id: order.id } });
  expect(toss.status).toBe("READY");
  // paymentKey 는 선점 단계에서 이미 박혀 있어 복구 경로가 열려 있다
  expect(toss.paymentKey).toBe(PAYMENT_KEY);
});

// ───────────────────────────────────────────── ④ 승인 후 DB 반영 실패 복구

test("승인 후 원장 반영이 끊긴 주문은 재시도로 복구된다(조회 → 반영)", async () => {
  const { order, charge } = await ready();
  // 승인은 끝났지만 ④ 원장 반영 직전에 죽은 상태를 재현한다:
  // paymentKey 는 박혀 있고 status 는 아직 READY 다.
  await prisma.tossPayment.update({
    where: { id: order.id },
    data: { paymentKey: PAYMENT_KEY },
  });
  const calls = mockTossFetch({
    get: {
      status: 200,
      body: tossPaymentObject({ paymentKey: PAYMENT_KEY, orderId: order.orderId }),
    },
  });

  const res = await post({ paymentKey: PAYMENT_KEY, orderId: order.orderId, amount: 700_000 });
  expect(res.status).toBe(200);

  // 승인을 다시 하지 않고 **조회**로 상태를 확인했다
  expect(calls).toHaveLength(1);
  expect(calls[0]!.method).toBe("GET");
  expect(calls[0]!.url).toContain(`/v1/payments/${PAYMENT_KEY}`);

  expect(await prisma.rentPayment.count()).toBe(1);
  expect(
    (await prisma.rentCharge.findUniqueOrThrow({ where: { id: charge.id } })).status,
  ).toBe("PAID");
});

test("다른 결제의 paymentKey 로는 복구되지 않는다", async () => {
  const { order } = await ready();
  await prisma.tossPayment.update({
    where: { id: order.id },
    data: { paymentKey: "someone_elses_key" },
  });
  const calls = mockTossFetch({ get: { status: 200, body: tossPaymentObject() } });

  const res = await post({ paymentKey: PAYMENT_KEY, orderId: order.orderId, amount: 700_000 });
  expect(res.status).toBe(409);
  expect(calls).toHaveLength(0);
  expect(await prisma.rentPayment.count()).toBe(0);
});
