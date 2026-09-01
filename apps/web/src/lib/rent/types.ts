/**
 * 원장 엔진(T1.4)이 주고받는 값 타입.
 *
 * **DB를 모른다.** Prisma 모델의 부분집합을 구조적으로 받도록 좁게 정의해서
 * (`Lease` 전체가 아니라 계산에 쓰는 필드만) 테스트에서 리터럴 객체로 바로 만들 수 있게 한다.
 * Prisma 레코드를 그대로 넘겨도 구조적 타이핑으로 통과한다.
 */

/** `ChargeStatus` — Prisma 생성 타입과 같은 문자열 유니온이라 서로 대입된다. */
export type ChargeStatus = "SCHEDULED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";

export const CHARGE_STATUS = {
  SCHEDULED: "SCHEDULED",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  OVERDUE: "OVERDUE",
} as const satisfies Record<ChargeStatus, ChargeStatus>;

/** 청구 금액을 만들 때 필요한 계약 조건 (`Lease` 의 부분집합). */
export type LeaseTerms = {
  /** 월세(원). 전세면 0 */
  monthlyRent: number;
  /** 관리비(원) */
  maintenanceFee: number;
  /** 매월 납부일(1~31). 그 달에 없는 날이면 말일로 보정한다 */
  paymentDay: number;
  /** 월 연체이율(%). null 이면 연체료 0 */
  lateFeeRatePct?: number | null;
};

/** 청구 1건의 항목별 금액 (`RentCharge` 의 금액 부분집합). */
export type ChargeAmounts = {
  rentAmount: number;
  maintenanceAmount: number;
  carriedOverAmount: number;
  lateFeeAmount: number;
};

/** 상태 판정에 필요한 청구 최소 정보. */
export type ChargeSnapshot = ChargeAmounts & {
  dueDate: Date;
  totalDue: number;
  paidAmount: number;
};

/** 이월·연체료 계산의 기준이 되는 전월 청구. */
export type PreviousCharge = {
  dueDate: Date;
  totalDue: number;
  paidAmount: number;
};

/** 납부 1건 (`RentPayment` 의 부분집합). */
export type PaymentLike = {
  amount: number;
  paidAt?: Date;
};

/** 연·월 쌍. month 는 1~12 */
export type YearMonth = { year: number; month: number };
