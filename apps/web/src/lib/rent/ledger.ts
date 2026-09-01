/**
 * 원장 규칙 (T1.4) — **Phase 1 전체가 공유하는 돈 계산 코어.**
 *
 * DB를 모르는 순수 함수만 둔다. 청구·납부·연체 계산식은 **여기 한 곳에만** 있고
 * T1.2(계약)·T1.5(수납 UI)·T1.6(장부)·T1.9(대시보드)는 이 함수들을 가져다 쓴다.
 *
 * ## 규칙 요약
 * | 항목 | 규칙 |
 * |---|---|
 * | 총액 | `totalDue = 월세 + 관리비 + 전월 이월 + 연체료` |
 * | 상태 | `PAID` > `PARTIALLY_PAID` > `OVERDUE` > `SCHEDULED` (위에서부터 먼저 판정) |
 * | 이월 | 전월 미납 잔액 `max(0, totalDue - paidAmount)` 를 익월 `carriedOverAmount` 로 |
 * | 연체료 | `floor(이월액 × 월이율% / 100 × 연체일수 / 30)` — 이율 null 이면 0, **내림** |
 * | 납부 충당 | 이월 → 연체료 → 관리비 → 월세 (민법 479조 취지: 오래된 채무·이자 먼저) |
 * | 말일 보정 | `paymentDay` 가 그 달에 없으면 말일 (31 → 2월이면 28/29) |
 *
 * ## 상태 우선순위를 이렇게 정한 이유
 * "납부일 경과 → OVERDUE" 와 "0<paid<total → PARTIALLY_PAID" 는 겹칠 수 있다.
 * **일부라도 낸 청구는 부분납으로 남긴다** — 한 푼도 안 낸 청구와 구분되어야 임대인이
 * 독촉 대상을 고를 수 있고, 시드의 4개 상태(완납/부분납/연체/예정) 시연도 이 규칙이라야 성립한다.
 * "기한이 지난 미납"이라는 넓은 의미가 필요하면 `isDelinquent()` 를 쓴다(부분납 포함).
 */
import type {
  ChargeAmounts,
  ChargeStatus,
  LeaseTerms,
  PaymentLike,
  PreviousCharge,
} from "./types";
import { CHARGE_STATUS } from "./types";
import { daysBetween, dueDateFor } from "./date";

/** 월 연체이율을 일할로 나눌 때 쓰는 기준 일수. 달마다 바뀌지 않게 30일 고정. */
export const LATE_FEE_DAYS_IN_MONTH = 30;

/** 만기 알림을 보내는 기준 — 만기 N일 전부터. */
export const EXPIRY_NOTICE_DAYS = 90;

/** 원 단위 정수로 정규화 — 음수와 소수점은 허용하지 않는다. */
function toWon(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

// ===================== 금액 =====================

/** `totalDue = 월세 + 관리비 + 전월 이월 + 연체료` */
export function calcTotalDue(amounts: ChargeAmounts): number {
  return (
    toWon(amounts.rentAmount) +
    toWon(amounts.maintenanceAmount) +
    toWon(amounts.carriedOverAmount) +
    toWon(amounts.lateFeeAmount)
  );
}

/** 납부 행들의 합계 — `RentCharge.paidAmount` 의 원본. */
export function sumPayments(payments: readonly PaymentLike[]): number {
  return payments.reduce((sum, p) => sum + Math.trunc(p.amount || 0), 0);
}

/** 미납 잔액. 초과 납부여도 음수가 되지 않는다. */
export function calcOutstanding(totalDue: number, paidAmount: number): number {
  return Math.max(0, Math.trunc(totalDue) - Math.trunc(paidAmount));
}

/** 이 금액을 더 받으면 총액을 넘는가 — T1.5 의 "초과 납부 400" 판정. */
export function isOverpayment(totalDue: number, paidAmount: number, amount: number): boolean {
  return Math.trunc(paidAmount) + Math.trunc(amount) > Math.trunc(totalDue);
}

/** 전월 미납 잔액 → 익월 이월액. 전월 청구가 없으면(첫 달) 0. */
export function calcCarriedOver(previous?: PreviousCharge | null): number {
  if (!previous) return 0;
  return calcOutstanding(previous.totalDue, previous.paidAmount);
}

// ===================== 연체 =====================

/** 납부기한이 지났는가. **기한 당일은 아직 아니다**(`asOf > dueDate` 부터). */
export function isPastDue(dueDate: Date, asOf: Date): boolean {
  return daysBetween(dueDate, asOf) > 0;
}

/** 연체 일수 — 기한 다음 날부터 1일. 기한 전이면 0. */
export function calcOverdueDays(dueDate: Date, asOf: Date): number {
  return Math.max(0, daysBetween(dueDate, asOf));
}

/**
 * 연체료 일할 계산 = `floor(base × rate/100 × days / 30)`.
 *
 * - `lateFeeRatePct` 가 null·0 이하면 0 (계약에 연체이율이 없다는 뜻).
 * - **내림(floor)** — 나눗셈에서 생기는 1원 미만은 세입자에게 유리한 쪽으로 버린다.
 * - 정수끼리 먼저 곱하고 마지막에 한 번만 나눠 부동소수 오차를 줄이고,
 *   그래도 남는 `15500.0000000002` 같은 표현 오차는 소수 6자리에서 정리한 뒤 내림한다.
 */
export function calcLateFee(input: {
  /** 연체 대상 금액(원) — 보통 전월에서 넘어온 미납 잔액 */
  base: number;
  /** 월 연체이율(%) */
  lateFeeRatePct?: number | null;
  overdueDays: number;
}): number {
  const base = toWon(input.base);
  const rate = input.lateFeeRatePct ?? 0;
  const days = Math.max(0, Math.trunc(input.overdueDays));
  if (base <= 0 || rate <= 0 || days <= 0 || !Number.isFinite(rate)) return 0;

  const raw = (base * rate * days) / (100 * LATE_FEE_DAYS_IN_MONTH);
  return Math.max(0, Math.floor(Number(raw.toFixed(6))));
}

// ===================== 상태 =====================

/**
 * 청구 상태 판정. 우선순위는 `PAID > PARTIALLY_PAID > OVERDUE > SCHEDULED`.
 * 총액 0원(전세 등 받을 게 없는 달)은 곧바로 PAID 다.
 */
export function resolveChargeStatus(input: {
  totalDue: number;
  paidAmount: number;
  dueDate: Date;
  /** 판정 기준일 — KST 오늘(UTC 자정) */
  asOf: Date;
}): ChargeStatus {
  const totalDue = Math.max(0, Math.trunc(input.totalDue));
  const paidAmount = Math.max(0, Math.trunc(input.paidAmount));

  if (paidAmount >= totalDue) return CHARGE_STATUS.PAID;
  if (paidAmount > 0) return CHARGE_STATUS.PARTIALLY_PAID;
  if (isPastDue(input.dueDate, input.asOf)) return CHARGE_STATUS.OVERDUE;
  return CHARGE_STATUS.SCHEDULED;
}

/**
 * "기한이 지났는데 아직 덜 낸" 넓은 의미의 미납 — **부분납도 포함**한다.
 * 대시보드의 `OVERDUE` 건수(= status 필터)와 다르다는 점에 주의.
 */
export function isDelinquent(
  charge: { totalDue: number; paidAmount: number; dueDate: Date },
  asOf: Date,
): boolean {
  return isPastDue(charge.dueDate, asOf) && calcOutstanding(charge.totalDue, charge.paidAmount) > 0;
}

// ===================== 청구 생성 =====================

export type ChargeDraftInput = {
  lease: LeaseTerms;
  year: number;
  /** 1~12 */
  month: number;
  /** 전월 청구. 없으면 이월·연체료 0 */
  previousCharge?: PreviousCharge | null;
  /** 상태 판정 기준일(KST 오늘, UTC 자정) */
  asOf: Date;
  /** 이미 쌓인 납부액. 신규 생성이면 0 */
  paidAmount?: number;
};

/** `prisma.rentCharge.create({ data: { leaseId, ...draft } })` 에 그대로 넣을 수 있는 모양. */
export type ChargeDraft = {
  year: number;
  month: number;
  dueDate: Date;
  rentAmount: number;
  maintenanceAmount: number;
  carriedOverAmount: number;
  lateFeeAmount: number;
  totalDue: number;
  paidAmount: number;
  status: ChargeStatus;
};

/**
 * 한 달치 청구를 만든다 — 크론의 당월 생성, T1.2 의 계약 등록 시 즉시 생성,
 * 그리고 이월액 정정(이미 납부액이 있는 청구 재계산)이 전부 이 함수를 쓴다.
 *
 * 연체료는 **전월 납부기한 다음 날부터 이번 납부기한까지**의 일수로 일할 계산해
 * 이번 달 청구에 얹는다(이미 발행된 전월 청구 금액은 건드리지 않는다).
 */
export function buildChargeDraft(input: ChargeDraftInput): ChargeDraft {
  const { lease, year, month, previousCharge, asOf } = input;
  const dueDate = dueDateFor(year, month, lease.paymentDay);
  const carriedOverAmount = calcCarriedOver(previousCharge);
  const lateFeeAmount = previousCharge
    ? calcLateFee({
        base: carriedOverAmount,
        lateFeeRatePct: lease.lateFeeRatePct,
        overdueDays: calcOverdueDays(previousCharge.dueDate, dueDate),
      })
    : 0;

  const amounts: ChargeAmounts = {
    rentAmount: toWon(lease.monthlyRent),
    maintenanceAmount: toWon(lease.maintenanceFee),
    carriedOverAmount,
    lateFeeAmount,
  };
  const totalDue = calcTotalDue(amounts);
  const paidAmount = toWon(input.paidAmount ?? 0);

  return {
    year,
    month,
    dueDate,
    ...amounts,
    totalDue,
    paidAmount,
    status: resolveChargeStatus({ totalDue, paidAmount, dueDate, asOf }),
  };
}

// ===================== 납부 충당 · 표시용 분해 =====================

/**
 * 납부액을 항목에 충당하는 순서.
 * 오래된 채무(이월)와 이자(연체료)를 먼저 지운다 — 민법 479조(비용·이자·원본) 취지.
 * 관리비는 실비 성격이라 월세보다 먼저 지운다.
 */
export const ALLOCATION_ORDER = ["carriedOver", "lateFee", "maintenance", "rent"] as const;
export type AllocationKey = (typeof ALLOCATION_ORDER)[number];

/** 항목별 충당액 + 총액을 넘어선 몫(`excess`). */
export type Allocation = Record<AllocationKey, number> & { excess: number };

const AMOUNT_FIELD: Record<AllocationKey, keyof ChargeAmounts> = {
  carriedOver: "carriedOverAmount",
  lateFee: "lateFeeAmount",
  maintenance: "maintenanceAmount",
  rent: "rentAmount",
};

/** 누적 납부액을 `ALLOCATION_ORDER` 순서로 항목에 배분한다. 초과분은 `excess`. */
export function allocateAmount(amounts: ChargeAmounts, paidAmount: number): Allocation {
  let rest = toWon(paidAmount);
  const result = { carriedOver: 0, lateFee: 0, maintenance: 0, rent: 0, excess: 0 } as Allocation;

  for (const key of ALLOCATION_ORDER) {
    const capacity = toWon(amounts[AMOUNT_FIELD[key]]);
    const applied = Math.min(rest, capacity);
    result[key] = applied;
    rest -= applied;
  }
  result.excess = rest;
  return result;
}

/**
 * 납부 행 각각이 어느 항목에 얼마씩 들어갔는지 — T1.6 장부의 항목별(월세·관리비·연체료) 집계용.
 * `paidAt` 오름차순으로 정렬해 앞선 납부부터 충당한다(`paidAt` 이 없으면 배열 순서 유지).
 */
export function allocatePayments<T extends PaymentLike>(
  amounts: ChargeAmounts,
  payments: readonly T[],
): { payment: T; allocation: Allocation }[] {
  const ordered = [...payments].sort(
    (a, b) => (a.paidAt?.getTime() ?? 0) - (b.paidAt?.getTime() ?? 0),
  );

  let cumulative = 0;
  let previous = allocateAmount(amounts, 0);

  return ordered.map((payment) => {
    cumulative += Math.trunc(payment.amount || 0);
    const current = allocateAmount(amounts, cumulative);
    const allocation = {
      carriedOver: current.carriedOver - previous.carriedOver,
      lateFee: current.lateFee - previous.lateFee,
      maintenance: current.maintenance - previous.maintenance,
      rent: current.rent - previous.rent,
      excess: current.excess - previous.excess,
    } as Allocation;
    previous = current;
    return { payment, allocation };
  });
}

export type ChargeLineKey = "RENT" | "MAINTENANCE" | "CARRY_OVER" | "LATE_FEE";

/** 화면에 그대로 쓰는 항목 라벨. */
export const CHARGE_LINE_LABELS: Record<ChargeLineKey, string> = {
  RENT: "월세",
  MAINTENANCE: "관리비",
  CARRY_OVER: "전월 이월",
  LATE_FEE: "연체료",
};

/** 표시 순서 — T1.5 의 "월세+관리비+이월+연체료" 그대로. 충당 순서와는 다르다. */
export const CHARGE_LINE_ORDER: ChargeLineKey[] = ["RENT", "MAINTENANCE", "CARRY_OVER", "LATE_FEE"];

const LINE_TO_ALLOCATION: Record<ChargeLineKey, AllocationKey> = {
  RENT: "rent",
  MAINTENANCE: "maintenance",
  CARRY_OVER: "carriedOver",
  LATE_FEE: "lateFee",
};

export type ChargeLine = {
  key: ChargeLineKey;
  label: string;
  /** 청구액 */
  amount: number;
  /** 그중 충당된 금액 */
  paid: number;
};

export type ChargeBreakdown = {
  /** 항상 4줄(0원 항목 포함). 0원 줄은 화면에서 숨기면 된다 */
  lines: ChargeLine[];
  dueDate: Date;
  totalDue: number;
  paidAmount: number;
  outstanding: number;
  /** 총액을 넘겨 받은 금액(정상 흐름에서는 0) */
  excess: number;
  status: ChargeStatus;
  /** 기한 경과 일수. 기한 전이면 0 */
  overdueDays: number;
};

export type DescribableCharge = ChargeAmounts & {
  dueDate: Date;
  paidAmount?: number;
  /** 저장된 총액. 없으면 항목 합으로 계산한다 */
  totalDue?: number;
};

/**
 * 청구 1건의 표시용 분해 — T1.5 청구 리스트·상세 시트가 이걸로 내역을 그린다.
 * `asOf` 는 상태·연체일수 판정 기준일 — 호출부에서 `kstToday()` 를 넘긴다.
 */
export function describeCharge(charge: DescribableCharge, asOf: Date): ChargeBreakdown {
  const amounts: ChargeAmounts = {
    rentAmount: toWon(charge.rentAmount),
    maintenanceAmount: toWon(charge.maintenanceAmount),
    carriedOverAmount: toWon(charge.carriedOverAmount),
    lateFeeAmount: toWon(charge.lateFeeAmount),
  };
  const totalDue = charge.totalDue === undefined ? calcTotalDue(amounts) : toWon(charge.totalDue);
  const paidAmount = toWon(charge.paidAmount ?? 0);
  const allocation = allocateAmount(amounts, paidAmount);

  return {
    lines: CHARGE_LINE_ORDER.map((key) => ({
      key,
      label: CHARGE_LINE_LABELS[key],
      amount: amounts[AMOUNT_FIELD[LINE_TO_ALLOCATION[key]]],
      paid: allocation[LINE_TO_ALLOCATION[key]],
    })),
    dueDate: charge.dueDate,
    totalDue,
    paidAmount,
    outstanding: calcOutstanding(totalDue, paidAmount),
    excess: allocation.excess,
    status: resolveChargeStatus({ totalDue, paidAmount, dueDate: charge.dueDate, asOf }),
    overdueDays: calcOverdueDays(charge.dueDate, asOf),
  };
}

// ===================== 계약 만기 =====================

/** 만기가 `asOf` 기준 `days` 일 이내인가 — 이미 지난 만기는 제외. T1.9 의 "만기 3개월 이내" 카드. */
export function isExpiringWithin(
  endDate: Date,
  asOf: Date,
  days: number = EXPIRY_NOTICE_DAYS,
): boolean {
  const remaining = daysBetween(asOf, endDate);
  return remaining >= 0 && remaining <= days;
}

/** 만기까지 남은 일수. 이미 지났으면 음수. */
export function daysUntilExpiry(endDate: Date, asOf: Date): number {
  return daysBetween(asOf, endDate);
}
