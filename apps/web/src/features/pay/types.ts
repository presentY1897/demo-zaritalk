/**
 * 자리페이(토스 결제위젯) DTO (T2.1·T2.2).
 *
 * **`@zari/db` 를 import 하지 않는다** — 결제 화면·성공 화면이 클라이언트 컴포넌트라
 * Prisma 타입을 끌어오면 브라우저 번들이 깨진다(T1.1 `features/landlord/types.ts` 미러 패턴).
 *
 * 청구·납부 DTO 는 **T1.2·T1.5 가 만든 것을 그대로 쓴다** — 세입자가 보는 금액과
 * 임대인 수납 화면(T1.5)의 금액이 같은 원본(`ChargeDto`)에서 나와야 어긋나지 않는다.
 */
import type { ChargeDto, ChargeStatusValue, PaymentMethodValue } from "@/features/lease/types";

export type { ChargeDto, ChargeStatusValue, PaymentMethodValue };

/** 토스 결제 상태 — Prisma `TossPaymentStatus` 미러 */
export type TossPaymentStatusValue = "READY" | "DONE" | "CANCELED" | "FAILED";

/** 결제 화면 헤더에 쓰는 계약·호실 정보 */
export type PayLeaseDto = {
  id: string;
  buildingName: string;
  unitLabel: string;
  landlordName: string;
};

/**
 * `/tenant/pay/[chargeId]` 서버 컴포넌트 → 위젯 클라이언트로 넘기는 확정값.
 *
 * `amount`(결제 금액)는 여기 없다 — **금액은 언제나 `charge.outstanding`(원장 엔진
 * `calcOutstanding` 결과)이고, 실제 결제 금액은 `POST /api/toss/checkout` 이 다시 확정한다.**
 */
export type PayCheckoutViewDto = {
  charge: ChargeDto;
  lease: PayLeaseDto;
  /** 토스에 넘길 주문명 — "행당해피빌 201호 2026년 8월 월세" */
  orderName: string;
  /** 위젯 `widgets({ customerKey })` — 세입자 프로필 id(추측 불가한 cuid) */
  customerKey: string;
  /** 구매자명 — 결제 내역 메일에 쓰인다 */
  customerName: string;
};

/** `POST /api/toss/checkout` 응답 — 서버가 확정한 주문 1건 */
export type CheckoutDto = {
  orderId: string;
  /** 서버가 계산한 결제 금액(= 청구 잔액). 클라이언트가 보낸 금액은 쓰지 않는다 */
  amount: number;
  orderName: string;
  customerKey: string;
  customerName: string;
  chargeId: string;
};

/** 승인 결과 영수증 요약 — 토스 Payment 객체에서 화면에 필요한 것만 추린 것 */
export type PayReceiptDto = {
  orderId: string;
  paymentKey: string;
  amount: number;
  /** 토스가 준 결제수단 원문("카드"·"간편결제"…). 없으면 null */
  method: string | null;
  /** ISO 타임스탬프 */
  approvedAt: string | null;
  receiptUrl: string | null;
  cardCompany: string | null;
  status: TossPaymentStatusValue;
};

/** `POST /api/toss/confirm` 응답 — 영수증 + **원장 반영 결과**(청구 재계산 후) */
export type ConfirmResultDto = {
  receipt: PayReceiptDto;
  charge: ChargeDto;
};

/** `/tenant/payments` 의 한 줄 */
export type TenantPaymentDto = {
  id: string;
  amount: number;
  method: PaymentMethodValue;
  /** ISO 타임스탬프 */
  paidAt: string;
  memo: string | null;
  charge: { id: string; year: number; month: number; status: ChargeStatusValue };
  lease: { id: string; buildingName: string; unitLabel: string };
  /** 자리페이(CARD) 납부만 채워진다 */
  toss: { orderId: string; receiptUrl: string | null; status: TossPaymentStatusValue } | null;
};

/** `/tenant/payments` 전체 — 합계는 서버가 미리 계산해 둔다 */
export type TenantPaymentsDto = {
  payments: TenantPaymentDto[];
  totals: { count: number; amount: number; cardCount: number; cardAmount: number };
};
