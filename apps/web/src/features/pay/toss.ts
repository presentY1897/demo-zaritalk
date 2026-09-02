/**
 * 토스페이먼츠 코어 API 클라이언트 (T2.1) — **서버 전용**(시크릿 키를 쓴다).
 *
 * 공식 문서(2026-09 확인)에 맞춘 것만 담는다. 이 파일이 외부 HTTP 를 아는 유일한 곳이고,
 * `queries.ts` 는 결과(`TossResult`)만 보고 DB 를 갱신한다 — 단위 테스트는 `fetch` 만 목킹하면 된다.
 *
 * | | |
 * |---|---|
 * | 승인 | `POST https://api.tosspayments.com/v1/payments/confirm` — body `{ paymentKey, orderId, amount }` |
 * | 조회 | `GET  https://api.tosspayments.com/v1/payments/{paymentKey}` |
 * | 인증 | `Authorization: Basic base64("<시크릿키>:")` — **콜론까지 붙이고** base64 (비밀번호 없는 Basic) |
 * | 멱등 | `Idempotency-Key` 헤더. 같은 키로 재요청해도 중복 승인되지 않는다 |
 *
 * 실패 응답은 `{ code, message }` 한 형태다(`ALREADY_PROCESSED_PAYMENT`,
 * `NOT_FOUND_PAYMENT_SESSION`, `PROVIDER_ERROR`, `UNAUTHORIZED` …).
 */

/** 테스트·스테이징에서 갈아 끼울 수 있게 열어 둔다. 기본은 운영 도메인(테스트 키를 쓰면 테스트 결제다) */
export const TOSS_API_BASE = process.env.TOSS_API_BASE ?? "https://api.tosspayments.com";

/** 토스 승인 API 가 상점을 식별하는 시크릿 키. 없으면 결제 기능 자체가 꺼진 것으로 본다 */
export function getTossSecretKey(): string | null {
  const key = process.env.TOSS_SECRET_KEY?.trim();
  return key ? key : null;
}

/** 위젯 SDK 가 쓰는 클라이언트 키(브라우저 노출). 서버에서도 설정 여부 확인용으로 읽는다 */
export function getTossClientKey(): string | null {
  const key = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim();
  return key ? key : null;
}

/** `Basic base64("<secret>:")` — 시크릿 키 뒤의 **콜론이 빠지면 401** 이다 */
export function tossAuthHeader(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`, "utf8").toString("base64")}`;
}

/**
 * 토스 Payment 객체 — 화면·원장에 쓰는 필드만 좁히고 나머지는 그대로 둔다.
 * 전체 원문은 `TossPayment.raw` 에 저장해 대사에 쓴다.
 */
export type TossPaymentObject = {
  paymentKey: string;
  orderId: string;
  /** `READY` `IN_PROGRESS` `WAITING_FOR_DEPOSIT` `DONE` `CANCELED` `PARTIAL_CANCELED` `ABORTED` `EXPIRED` */
  status: string;
  totalAmount: number;
  balanceAmount?: number;
  method?: string | null;
  approvedAt?: string | null;
  requestedAt?: string | null;
  receipt?: { url?: string | null } | null;
  card?: { company?: string | null; issuerCode?: string | null; number?: string | null } | null;
  cancels?: unknown;
  [key: string]: unknown;
};

export type TossResult =
  | { ok: true; payment: TossPaymentObject }
  | { ok: false; status: number; code: string; message: string; body: unknown };

/** 토스가 최종 승인 완료로 보는 상태 */
export const TOSS_DONE = "DONE";
/** 결제가 취소된 상태(전체·부분) — 웹훅 동기화에서 원장을 되돌린다 */
export const TOSS_CANCELED_STATUSES = ["CANCELED", "PARTIAL_CANCELED"] as const;
/** 결제가 끝내 성립하지 못한 상태 */
export const TOSS_FAILED_STATUSES = ["ABORTED", "EXPIRED"] as const;

function toFailure(status: number, body: unknown): TossResult {
  const parsed = body as { code?: unknown; message?: unknown } | null;
  return {
    ok: false,
    status,
    code: typeof parsed?.code === "string" ? parsed.code : "TOSS_ERROR",
    message:
      typeof parsed?.message === "string" ? parsed.message : "결제 승인에 실패했습니다.",
    body,
  };
}

async function callToss(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string },
): Promise<TossResult> {
  const secretKey = getTossSecretKey();
  if (!secretKey) {
    return {
      ok: false,
      status: 0,
      code: "TOSS_NOT_CONFIGURED",
      message: "결제 설정(TOSS_SECRET_KEY)이 없습니다.",
      body: null,
    };
  }

  let response: Response;
  try {
    response = await fetch(`${TOSS_API_BASE}${path}`, {
      method: init.method,
      headers: {
        Authorization: tossAuthHeader(secretKey),
        "Content-Type": "application/json",
        ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      // 결제 승인은 캐시 대상이 아니다
      cache: "no-store",
    });
  } catch (error) {
    // 네트워크 단절 — 승인 여부를 **모르는** 상태다. 호출부는 FAILED 로 확정하지 말고
    // 재조회(`fetchTossPayment`)로 실제 상태를 확인해야 한다.
    return {
      ok: false,
      status: 0,
      code: "TOSS_NETWORK_ERROR",
      message: error instanceof Error ? error.message : "결제 서버에 연결하지 못했습니다.",
      body: null,
    };
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return toFailure(response.status, body);

  const payment = body as TossPaymentObject | null;
  if (!payment || typeof payment.paymentKey !== "string") {
    return toFailure(response.status, body);
  }
  return { ok: true, payment };
}

/**
 * 결제 승인 — `POST /v1/payments/confirm`.
 * `Idempotency-Key` 에 orderId 를 넣어 **같은 주문이 두 번 승인되지 않게** 한다
 * (네트워크 재시도로 요청이 중복돼도 토스 쪽에서 한 번만 처리된다).
 */
export function confirmTossPayment(input: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<TossResult> {
  return callToss("/v1/payments/confirm", {
    method: "POST",
    body: { paymentKey: input.paymentKey, orderId: input.orderId, amount: input.amount },
    idempotencyKey: input.orderId,
  });
}

/**
 * 결제 조회 — `GET /v1/payments/{paymentKey}`.
 *
 * 두 곳에서 쓴다:
 * 1. **승인 후 DB 반영 실패 복구** — 승인은 됐는데 원장 반영이 끊긴 주문의 진짜 상태 확인
 * 2. **웹훅 검증** — 웹훅 본문을 믿지 않고 우리 시크릿 키로 다시 물어본다
 */
export function fetchTossPayment(paymentKey: string): Promise<TossResult> {
  return callToss(`/v1/payments/${encodeURIComponent(paymentKey)}`, { method: "GET" });
}

/** 주문번호로 조회 — `GET /v1/payments/orders/{orderId}`. 웹훅에 paymentKey 가 없을 때 쓴다 */
export function fetchTossPaymentByOrderId(orderId: string): Promise<TossResult> {
  return callToss(`/v1/payments/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
}
