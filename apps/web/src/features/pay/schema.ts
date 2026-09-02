/**
 * 자리페이 요청 스키마 (T2.1) — zod 4, [D1](../../../../../docs/DECISIONS.md#-d1-api-스타일).
 *
 * `@zari/db` 를 import 하지 않는다 — 결제 화면(클라이언트)도 같은 스키마를 쓴다.
 *
 * ## orderId 형식은 토스가 정한다
 * 결제위젯 SDK v2 `requestPayment()` 문서: *"영문 대소문자, 숫자, 특수문자 `-`, `_`, `=` 로
 * 이루어진 6자 이상 64자 이하의 문자열"*. 우리가 만든 값만 받으므로 형식까지 검증한다.
 */
import { z } from "zod";

/** 토스 orderId 문자셋·길이 — SDK v2 문서 그대로 */
export const ORDER_ID_PATTERN = /^[A-Za-z0-9_=-]{6,64}$/;

const orderIdSchema = z
  .string()
  .regex(ORDER_ID_PATTERN, "주문번호 형식이 올바르지 않습니다.");

/** 금액(원) — Prisma Int 상한(약 21억) 안쪽. 0원 결제는 받지 않는다 */
const amountSchema = z
  .number()
  .int("결제 금액은 원 단위 정수여야 합니다.")
  .positive("결제 금액은 1원 이상이어야 합니다.")
  .max(2_000_000_000, "결제 금액이 너무 큽니다.");

/** `POST /api/toss/checkout` 본문 — **금액은 받지 않는다**(서버가 청구 잔액으로 정한다) */
export const checkoutSchema = z.object({
  chargeId: z.string().min(1, "청구를 찾을 수 없습니다."),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/**
 * `POST /api/toss/confirm` 본문 — successUrl 쿼리 파라미터를 그대로 옮겨 담는다.
 * `{successUrl}?paymentType=..&amount=..&orderId=..&paymentKey=..` (SDK v2 Redirect 방식)
 */
export const confirmSchema = z.object({
  paymentKey: z.string().min(1).max(200, "결제 키가 너무 깁니다."),
  orderId: orderIdSchema,
  /** 클라이언트가 주장하는 금액. **믿지 않고 서버 값과 대조만 한다**(위변조 검증) */
  amount: amountSchema,
});
export type ConfirmInput = z.infer<typeof confirmSchema>;

/**
 * `POST /api/toss/webhook` 본문.
 *
 * 토스 웹훅 문서의 이벤트는 `{ eventType, createdAt, data }` 형태다. `data` 는 이벤트마다
 * 다르므로 **우리가 쓰는 필드만 좁히고 나머지는 통과**시킨다(`looseObject`) — raw 를 그대로
 * 저장해야 나중에 대사(reconciliation)를 할 수 있기 때문이다.
 */
export const webhookSchema = z.looseObject({
  eventType: z.string().min(1).max(64),
  createdAt: z.string().max(64).optional(),
  data: z.looseObject({
    orderId: z.string().max(64).optional(),
    paymentKey: z.string().max(200).optional(),
    status: z.string().max(40).optional(),
    totalAmount: z.number().optional(),
    balanceAmount: z.number().optional(),
  }),
});
export type WebhookInput = z.infer<typeof webhookSchema>;
