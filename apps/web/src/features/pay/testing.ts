/**
 * 자리페이 테스트 픽스처 (T2.1·T2.2) — **테스트에서만 import 한다**(앱 코드에서 쓰지 않는다).
 *
 * 계정·건물·호실은 T1.1 `features/landlord/testing.ts`, 계약·청구는 T1.2 `features/lease/testing.ts`,
 * 세입자 계정은 T1.3 `features/tenant/testing.ts` 를 그대로 재사용하고,
 * 여기서는 **세입자에게 연결된 계약 + 토스 주문 + 토스 API 목킹**만 더한다.
 */
import { prisma } from "@zari/db";
import { vi } from "vitest";
import { createLandlordWithUnit, createLeaseWithCharge } from "@/features/lease/testing";
import { createTenant } from "@/features/tenant/testing";
import { loginAs } from "@/features/landlord/testing";
import type { TossPaymentObject } from "./toss";

export { loginAs };

/** 테스트에서 쓰는 가짜 토스 키 — 실제 호출은 전부 `mockTossFetch` 가 가로챈다 */
export const TEST_TOSS_SECRET = "test_gsk_unit_test";
export const TEST_TOSS_CLIENT = "test_gck_unit_test";

/** 토스 키를 세팅한다(라우트가 키 없으면 500 을 내므로 필요하다) */
export function stubTossEnv(): void {
  vi.stubEnv("TOSS_SECRET_KEY", TEST_TOSS_SECRET);
  vi.stubEnv("NEXT_PUBLIC_TOSS_CLIENT_KEY", TEST_TOSS_CLIENT);
}

/**
 * 임대인 + 호실 + **세입자에게 연결된 ACTIVE 계약** + 당월 청구(700,000원).
 * 금액은 T1.2 `DEFAULT_TERMS`(월세 650,000 + 관리비 50,000) 그대로다.
 */
export async function createPayableCharge(
  options: { tenantPhone?: string; landlordPhone?: string } = {},
) {
  const landlord = await createLandlordWithUnit(options.landlordPhone ?? "01011111111");
  const tenant = await createTenant(options.tenantPhone ?? "01055555555");
  const { lease, charge } = await createLeaseWithCharge(landlord.unit.id, {
    tenantProfileId: tenant.profile.id,
  });
  if (!charge) throw new Error("청구 생성 실패");
  return { landlord, tenant, lease, charge };
}

/** 결제 대기 주문 1건(READY) */
export async function createOrder(
  chargeId: string,
  overrides: {
    orderId?: string;
    amount?: number;
    status?: "READY" | "DONE" | "CANCELED" | "FAILED";
    paymentKey?: string | null;
    approvedAt?: Date | null;
  } = {},
) {
  return prisma.tossPayment.create({
    data: {
      chargeId,
      orderId: overrides.orderId ?? `zari_${crypto.randomUUID().replaceAll("-", "")}`,
      amount: overrides.amount ?? 700_000,
      status: overrides.status ?? "READY",
      paymentKey: overrides.paymentKey ?? null,
      approvedAt: overrides.approvedAt ?? null,
    },
  });
}

/** 토스가 승인 완료로 돌려주는 Payment 객체(필요한 필드만) */
export function tossPaymentObject(overrides: Partial<TossPaymentObject> = {}): TossPaymentObject {
  return {
    paymentKey: "test_payment_key",
    orderId: "zari_test_order",
    status: "DONE",
    totalAmount: 700_000,
    balanceAmount: 700_000,
    method: "카드",
    approvedAt: "2026-09-02T12:00:00+09:00",
    requestedAt: "2026-09-02T11:59:00+09:00",
    receipt: { url: "https://dashboard.tosspayments.com/receipt/test" },
    card: { company: "신한", issuerCode: "41", number: "43301234****123*" },
    ...overrides,
  };
}

export type TossCall = { url: string; method: string; body: unknown; headers: Headers };

export type TossRoute =
  | { status: number; body: unknown }
  | ((call: TossCall) => { status: number; body: unknown });

/**
 * 토스 코어 API 를 목킹한다 — `confirm`(POST /v1/payments/confirm) 과
 * `get`(GET /v1/payments/…) 을 따로 정할 수 있다. 반환값으로 호출 이력을 본다.
 */
export function mockTossFetch(routes: { confirm?: TossRoute; get?: TossRoute }): TossCall[] {
  const calls: TossCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const call: TossCall = {
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
        headers: new Headers(init?.headers),
      };
      calls.push(call);

      const route = url.includes("/v1/payments/confirm") ? routes.confirm : routes.get;
      if (!route) throw new Error(`목킹되지 않은 토스 호출: ${call.method} ${url}`);
      const resolved = typeof route === "function" ? route(call) : route;
      return new Response(JSON.stringify(resolved.body), {
        status: resolved.status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}
