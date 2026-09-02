/**
 * 토스 코어 API 클라이언트 (T2.1).
 *
 * 단위는 `fetch` 를 mock 해서 **요청이 문서대로 나가는지**와 실패 응답 매핑만 본다.
 * 마지막 하나는 **실제 토스 테스트 API 통합 테스트**로, `TOSS_SECRET_KEY` 가 없으면 skip 한다.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  confirmTossPayment,
  fetchTossPayment,
  getTossSecretKey,
  tossAuthHeader,
  TOSS_API_BASE,
} from "./toss";
import { mockTossFetch, stubTossEnv, tossPaymentObject } from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("인증 헤더", () => {
  test("Basic base64(\"<secret>:\") — 콜론이 빠지면 401 이 난다", () => {
    // 토스 문서: 시크릿 키 뒤에 콜론을 붙이고 base64 (비밀번호가 없는 Basic 인증)
    expect(tossAuthHeader("test_gsk_docs_abc")).toBe(
      `Basic ${Buffer.from("test_gsk_docs_abc:").toString("base64")}`,
    );
    // 콜론 없는 인코딩과 다르다는 것까지 못 박는다
    expect(tossAuthHeader("test_gsk_docs_abc")).not.toBe(
      `Basic ${Buffer.from("test_gsk_docs_abc").toString("base64")}`,
    );
  });

  test("키가 없으면 호출하지 않고 TOSS_NOT_CONFIGURED", async () => {
    vi.stubEnv("TOSS_SECRET_KEY", "");
    const calls = mockTossFetch({ confirm: { status: 200, body: {} } });
    const result = await confirmTossPayment({ paymentKey: "k", orderId: "o", amount: 1 });
    expect(result).toMatchObject({ ok: false, code: "TOSS_NOT_CONFIGURED" });
    expect(calls).toHaveLength(0);
    expect(getTossSecretKey()).toBeNull();
  });
});

describe("승인 요청", () => {
  beforeEach(() => stubTossEnv());

  test("문서 그대로의 엔드포인트·본문·멱등키", async () => {
    const calls = mockTossFetch({ confirm: { status: 200, body: tossPaymentObject() } });
    const result = await confirmTossPayment({
      paymentKey: "pk_1",
      orderId: "zari_order_1",
      amount: 700_000,
    });

    expect(result.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      url: `${TOSS_API_BASE}/v1/payments/confirm`,
      method: "POST",
      body: { paymentKey: "pk_1", orderId: "zari_order_1", amount: 700_000 },
    });
    expect(calls[0]!.headers.get("idempotency-key")).toBe("zari_order_1");
    expect(calls[0]!.headers.get("content-type")).toBe("application/json");
  });

  test("실패 응답의 code·message 를 그대로 옮긴다", async () => {
    mockTossFetch({
      confirm: {
        status: 400,
        body: { code: "ALREADY_PROCESSED_PAYMENT", message: "이미 처리된 결제입니다." },
      },
    });
    const result = await confirmTossPayment({ paymentKey: "pk", orderId: "o", amount: 1 });
    expect(result).toMatchObject({
      ok: false,
      status: 400,
      code: "ALREADY_PROCESSED_PAYMENT",
      message: "이미 처리된 결제입니다.",
    });
  });

  test("본문이 Payment 객체가 아니면 성공으로 보지 않는다", async () => {
    mockTossFetch({ confirm: { status: 200, body: { unexpected: true } } });
    const result = await confirmTossPayment({ paymentKey: "pk", orderId: "o", amount: 1 });
    expect(result.ok).toBe(false);
  });

  test("네트워크 오류는 TOSS_NETWORK_ERROR — 승인 여부를 모르는 상태다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const result = await confirmTossPayment({ paymentKey: "pk", orderId: "o", amount: 1 });
    expect(result).toMatchObject({ ok: false, code: "TOSS_NETWORK_ERROR" });
  });
});

describe("조회", () => {
  beforeEach(() => stubTossEnv());

  test("GET /v1/payments/{paymentKey}", async () => {
    const calls = mockTossFetch({ get: { status: 200, body: tossPaymentObject() } });
    await fetchTossPayment("pk_1");
    expect(calls[0]).toMatchObject({
      url: `${TOSS_API_BASE}/v1/payments/pk_1`,
      method: "GET",
    });
  });
});

/**
 * 통합 — **실제 토스 테스트 API 1회**. `TOSS_SECRET_KEY` 가 없으면 skip 한다.
 *
 * 위젯 결제는 브라우저 상호작용 없이는 유효한 `paymentKey` 를 얻을 수 없다. 그래서 여기서는
 * *존재하지 않는 paymentKey 로 승인을 시도해* ① 엔드포인트가 살아 있고 ② Basic 인증이
 * 통과한다는 것(= `UNAUTHORIZED` 가 아니라 결제 조회 실패가 돌아온다)을 확인한다.
 * 승인 성공 경로는 위 mock 테스트와 `app/api/toss/confirm/route.test.ts` 가 덮는다.
 */
describe("통합(실 API)", () => {
  const hasKey = Boolean(process.env.TOSS_SECRET_KEY?.trim());

  test.skipIf(!hasKey)("실제 토스 confirm 호출 — 인증은 통과하고 결제만 없다", async () => {
    const result = await confirmTossPayment({
      paymentKey: `zari_integration_${Date.now()}`,
      orderId: `zari_integration_${Date.now()}`,
      amount: 1000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // 인증 실패(401 UNAUTHORIZED)가 아니어야 한다 — Basic base64("<secret>:") 가 맞다는 뜻
    expect(result.status).not.toBe(401);
    expect(result.code).not.toBe("UNAUTHORIZED");
    expect(result.code).not.toBe("TOSS_NOT_CONFIGURED");
    // 없는 결제라 세션/결제 없음 계열 코드가 온다
    expect(result.code).toMatch(/NOT_FOUND|INVALID/);
  }, 20_000);
});
