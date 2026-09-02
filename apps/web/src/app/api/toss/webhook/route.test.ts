/**
 * `POST /api/toss/webhook` (T2.1) — task 최소 테스트 ④ **webhook 취소 동기화**.
 *
 * 핵심 설계는 "**본문을 믿지 않는다**" 이다. 토스는 결제 상태 웹훅에 서명 헤더를 주지 않으므로
 * (서명은 `payout.changed`·`seller.changed` 전용) 우리 시크릿 키로 `GET /v1/payments/{key}` 를
 * 다시 호출해 나온 값만으로 동기화한다. 위조 본문이 와도 DB 는 바뀌지 않아야 한다.
 */
import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createOrder,
  createPayableCharge,
  mockTossFetch,
  stubTossEnv,
  tossPaymentObject,
} from "@/features/pay/testing";
import { POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  stubTossEnv();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const PAYMENT_KEY = "test_payment_key_webhook";

function post(body: unknown, raw?: string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/toss/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // 결제 상태 웹훅에 실제로 오는 헤더(추적용 — 검증용이 아니다)
        "tosspayments-webhook-transmission-id": "wh_test_1",
        "tosspayments-webhook-transmission-time": "2026-09-02T12:00:00+09:00",
        "tosspayments-webhook-transmission-retried-count": "0",
      },
      body: raw ?? JSON.stringify(body),
    }),
  );
}

function statusEvent(orderId: string, status: string) {
  return {
    eventType: "PAYMENT_STATUS_CHANGED",
    createdAt: "2026-09-02T12:00:00+09:00",
    data: tossPaymentObject({ paymentKey: PAYMENT_KEY, orderId, status }),
  };
}

/** 승인까지 끝난 상태(DONE 주문 + CARD 납부 + 완납 청구)를 직접 만든다 */
async function approved() {
  const setup = await createPayableCharge();
  const order = await createOrder(setup.charge.id, {
    status: "DONE",
    paymentKey: PAYMENT_KEY,
    approvedAt: new Date(),
  });
  await prisma.rentPayment.create({
    data: {
      chargeId: setup.charge.id,
      amount: 700_000,
      method: "CARD",
      memo: "자리페이 카드",
      tossPaymentId: order.id,
    },
  });
  await prisma.rentCharge.update({
    where: { id: setup.charge.id },
    data: { paidAmount: 700_000, status: "PAID" },
  });
  return { ...setup, order };
}

// ───────────────────────────────────────────── ④ 취소 동기화

test("축 ④ 취소 웹훅 — TossPayment CANCELED + CARD 납부 회수 + 청구 재계산", async () => {
  const { order, charge } = await approved();
  const calls = mockTossFetch({
    get: {
      status: 200,
      body: tossPaymentObject({
        paymentKey: PAYMENT_KEY,
        orderId: order.orderId,
        status: "CANCELED",
        balanceAmount: 0,
      }),
    },
  });

  const res = await post(statusEvent(order.orderId, "CANCELED"));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({
    received: true,
    ignored: false,
    verified: true,
    status: "CANCELED",
    action: "canceled",
  });

  // 본문이 아니라 토스 재조회로 확인했다(= 인증)
  expect(calls).toHaveLength(1);
  expect(calls[0]!.method).toBe("GET");
  expect(calls[0]!.url).toContain(`/v1/payments/${PAYMENT_KEY}`);

  const toss = await prisma.tossPayment.findUniqueOrThrow({ where: { id: order.id } });
  expect(toss.status).toBe("CANCELED");
  // raw 에 웹훅 원문이 남는다
  expect(JSON.stringify(toss.raw)).toContain("PAYMENT_STATUS_CHANGED");

  // 카드 납부는 회수되고 청구는 미납으로 돌아간다
  expect(await prisma.rentPayment.count()).toBe(0);
  const updated = await prisma.rentCharge.findUniqueOrThrow({ where: { id: charge.id } });
  expect(updated.paidAmount).toBe(0);
  expect(updated.status).not.toBe("PAID");
});

test("축 ④ 부분 취소도 같은 경로로 처리한다", async () => {
  const { order, charge } = await approved();
  mockTossFetch({
    get: {
      status: 200,
      body: tossPaymentObject({
        paymentKey: PAYMENT_KEY,
        orderId: order.orderId,
        status: "PARTIAL_CANCELED",
        balanceAmount: 200_000,
      }),
    },
  });

  const res = await post(statusEvent(order.orderId, "PARTIAL_CANCELED"));
  expect((await res.json()).action).toBe("canceled");
  expect(await prisma.rentPayment.count()).toBe(0);
  expect(
    (await prisma.rentCharge.findUniqueOrThrow({ where: { id: charge.id } })).paidAmount,
  ).toBe(0);
});

test("축 ④ 같은 취소 웹훅이 두 번 와도 상태가 더 흔들리지 않는다(멱등)", async () => {
  const { order } = await approved();
  mockTossFetch({
    get: {
      status: 200,
      body: tossPaymentObject({
        paymentKey: PAYMENT_KEY,
        orderId: order.orderId,
        status: "CANCELED",
      }),
    },
  });

  await post(statusEvent(order.orderId, "CANCELED"));
  const second = await post(statusEvent(order.orderId, "CANCELED"));
  expect((await second.json()).action).toBe("unchanged");
  expect(await prisma.rentPayment.count()).toBe(0);
});

// ───────────────────────────────────────────── 검증(재조회)

test("본문이 취소라고 해도 토스가 DONE 이면 취소하지 않는다 — 위조 웹훅 방어", async () => {
  const { order, charge } = await approved();
  mockTossFetch({
    get: {
      status: 200,
      body: tossPaymentObject({ paymentKey: PAYMENT_KEY, orderId: order.orderId, status: "DONE" }),
    },
  });

  const res = await post(statusEvent(order.orderId, "CANCELED"));
  expect(res.status).toBe(200);
  expect((await res.json()).action).toBe("unchanged");

  expect((await prisma.tossPayment.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
    "DONE",
  );
  expect(await prisma.rentPayment.count()).toBe(1);
  expect(
    (await prisma.rentCharge.findUniqueOrThrow({ where: { id: charge.id } })).status,
  ).toBe("PAID");
});

test("토스 재조회에 실패하면 아무것도 바꾸지 않는다(raw 만 남긴다)", async () => {
  const { order } = await approved();
  mockTossFetch({ get: { status: 500, body: { code: "PROVIDER_ERROR", message: "일시 오류" } } });

  const res = await post(statusEvent(order.orderId, "CANCELED"));
  expect(await res.json()).toMatchObject({ verified: false, action: "none" });

  const toss = await prisma.tossPayment.findUniqueOrThrow({ where: { id: order.id } });
  expect(toss.status).toBe("DONE");
  expect(JSON.stringify(toss.raw)).toContain("PAYMENT_STATUS_CHANGED");
  expect(await prisma.rentPayment.count()).toBe(1);
});

test("조회 결과의 주문번호가 다르면 동기화하지 않는다", async () => {
  const { order } = await approved();
  mockTossFetch({
    get: {
      status: 200,
      body: tossPaymentObject({
        paymentKey: PAYMENT_KEY,
        orderId: "zari_other_order",
        status: "CANCELED",
      }),
    },
  });

  expect((await (await post(statusEvent(order.orderId, "CANCELED"))).json()).verified).toBe(false);
  expect((await prisma.tossPayment.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
    "DONE",
  );
});

// ───────────────────────────────────────────── 복구·기타 상태

test("승인 후 원장 반영이 끊긴 주문을 DONE 웹훅이 복구한다", async () => {
  const setup = await createPayableCharge();
  // paymentKey 는 박혔지만 아직 READY — confirm 의 ④ 단계에서 끊긴 상태
  const order = await createOrder(setup.charge.id, { paymentKey: PAYMENT_KEY });
  mockTossFetch({
    get: {
      status: 200,
      body: tossPaymentObject({ paymentKey: PAYMENT_KEY, orderId: order.orderId, status: "DONE" }),
    },
  });

  const res = await post(statusEvent(order.orderId, "DONE"));
  expect(await res.json()).toMatchObject({ verified: true, status: "DONE", action: "approved" });

  const payments = await prisma.rentPayment.findMany();
  expect(payments).toHaveLength(1);
  expect(payments[0]).toMatchObject({ method: "CARD", amount: 700_000, tossPaymentId: order.id });
  expect(
    (await prisma.rentCharge.findUniqueOrThrow({ where: { id: setup.charge.id } })).status,
  ).toBe("PAID");
});

test("ABORTED 웹훅은 READY 주문을 FAILED 로 내린다", async () => {
  const setup = await createPayableCharge();
  const order = await createOrder(setup.charge.id, { paymentKey: PAYMENT_KEY });
  mockTossFetch({
    get: {
      status: 200,
      body: tossPaymentObject({
        paymentKey: PAYMENT_KEY,
        orderId: order.orderId,
        status: "ABORTED",
      }),
    },
  });

  expect((await (await post(statusEvent(order.orderId, "ABORTED"))).json()).action).toBe("failed");
  expect((await prisma.tossPayment.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
    "FAILED",
  );
  expect(await prisma.rentPayment.count()).toBe(0);
});

// ───────────────────────────────────────────── 방어

test("모르는 주문번호는 200 ignored — 토스가 재시도하지 않게", async () => {
  const calls = mockTossFetch({ get: { status: 200, body: tossPaymentObject() } });
  const res = await post(statusEvent("zari_unknown_order", "CANCELED"));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ignored: true, action: "none" });
  expect(calls).toHaveLength(0);
});

test("다루지 않는 이벤트는 200 ignored", async () => {
  const { order } = await approved();
  const calls = mockTossFetch({ get: { status: 200, body: tossPaymentObject() } });

  const res = await post({
    eventType: "METHOD_UPDATED",
    data: { orderId: order.orderId, status: "CANCELED" },
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ignored: true });
  expect(calls).toHaveLength(0);
  expect((await prisma.tossPayment.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
    "DONE",
  );
});

test("JSON 이 아니거나 스키마를 벗어나면 400 — 재전송이 의미 있는 유일한 경우", async () => {
  expect((await post(null, "not-json")).status).toBe(400);
  expect((await post({ eventType: "PAYMENT_STATUS_CHANGED" })).status).toBe(400);
});
