/**
 * 자리페이 결제 흐름 (T2.1) — **서버 전용**(`@zari/db` + 토스 시크릿 키를 쓴다).
 *
 * ## 금액은 한 줄도 직접 계산하지 않는다
 * 결제 금액 = **청구 잔액**이고, 그 값은 원장 엔진(T1.4) `calcOutstanding(totalDue, paidAmount)` 이
 * 정한다. 승인 후 원장 반영도 T1.5 가 만든 **같은 경로**(`recalcCharge` → `sumPayments` →
 * `resolveChargeStatus`)를 탄다 — 임대인 수납 화면과 숫자가 어긋나지 않게 하기 위해서다.
 *
 * ## 트랜잭션 경계
 * 토스 승인은 외부 HTTP 라 트랜잭션에 넣을 수 없다. 그래서 **승인 전/후를 나눈다**:
 *
 * ```
 * ① 주문 확정   checkout    TossPayment(READY, amount = 잔액)          ← DB
 * ② 승인 선점   confirm     paymentKey 를 READY 행에 CAS 로 박는다      ← DB (동시 요청 차단)
 * ③ 승인        confirm     POST /v1/payments/confirm                  ← 외부 (Idempotency-Key = orderId)
 * ④ 원장 반영   confirm     TossPayment→DONE + RentPayment(CARD) + 청구 재계산  ← DB **한 트랜잭션**
 * ```
 *
 * ③ 이 성공한 뒤 ④ 가 실패하면 *돈은 받았는데 원장에 없는* 상태가 된다. 두 겹으로 복구한다:
 * - **재시도 복구** — ② 에서 paymentKey 를 먼저 박아 두므로, 같은 orderId·paymentKey 로 다시
 *   confirm 이 오면 `GET /v1/payments/{paymentKey}` 로 진짜 상태를 확인하고 ④ 만 다시 돌린다.
 * - **웹훅 복구** — `PAYMENT_STATUS_CHANGED(DONE)` 이 오면 같은 ④ 를 실행한다.
 *
 * ④ 는 두 겹으로 중복을 막는다: 트랜잭션 안의 `status: READY` 조건부 UPDATE(CAS) +
 * `RentPayment.tossPaymentId @unique`(DB 제약). 둘 중 하나만 뚫려도 이중 납부가 되지 않는다.
 */
import { Prisma, prisma, type TossPaymentStatus } from "@zari/db";
import { getCharge, recalcCharge, toChargeDto } from "@/features/lease/queries";
import type { ChargeDto } from "@/features/lease/types";
import type { TenantSession } from "@/features/tenant/ownership";
import { calcOutstanding, kstToday } from "@/lib/rent";
import { payableChargeInclude, type PayableCharge } from "./ownership";
import type {
  CheckoutDto,
  ConfirmResultDto,
  PayCheckoutViewDto,
  PayReceiptDto,
  TenantPaymentDto,
  TenantPaymentsDto,
  TossPaymentStatusValue,
} from "./types";
import {
  confirmTossPayment,
  fetchTossPayment,
  fetchTossPaymentByOrderId,
  TOSS_CANCELED_STATUSES,
  TOSS_DONE,
  TOSS_FAILED_STATUSES,
  type TossPaymentObject,
  type TossResult,
} from "./toss";

/** `TossPayment.raw` 에 담기는 모양 — 토스 원문 + 받은 웹훅 이력 + 거절한 승인 시도 */
type TossRaw = {
  /** 승인·조회로 받은 최신 Payment 객체 */
  payment?: TossPaymentObject;
  /** 받은 웹훅 원문(최근 것부터, 최대 `MAX_WEBHOOK_HISTORY` 개) */
  webhooks?: unknown[];
  /**
   * 금액이 맞지 않아 **승인하지 않고 거절한** 시도(최근 것부터).
   * 사용자가 이미 카드로 결제해 버린 뒤 우리가 거절하는 경우가 있어(예: 탭 두 개로 두 번 결제)
   * 나중에 환불·대사할 수 있게 paymentKey 와 사유를 남긴다.
   */
  rejected?: unknown[];
};

/** raw 가 무한히 커지지 않게 이력을 자른다 */
const MAX_WEBHOOK_HISTORY = 10;

function readRaw(raw: Prisma.JsonValue | null): TossRaw {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as TossRaw;
}

function mergeRaw(current: Prisma.JsonValue | null, patch: TossRaw): Prisma.InputJsonValue {
  const base = readRaw(current);
  const payment = patch.payment ?? base.payment;
  const webhooks = patch.webhooks
    ? [...patch.webhooks, ...(base.webhooks ?? [])].slice(0, MAX_WEBHOOK_HISTORY)
    : base.webhooks;
  const rejected = patch.rejected
    ? [...patch.rejected, ...(base.rejected ?? [])].slice(0, MAX_WEBHOOK_HISTORY)
    : base.rejected;
  const merged: TossRaw = {};
  if (payment) merged.payment = payment;
  if (webhooks) merged.webhooks = webhooks;
  if (rejected) merged.rejected = rejected;
  return merged as Prisma.InputJsonValue;
}

/**
 * 토스 orderId — 영문 대소문자·숫자·`-`·`_`·`=` 로 6~64자(SDK v2 규칙).
 * `zari_` + UUID(하이픈 제거) = 37자. 추측할 수 없고 주문마다 유일하다.
 */
export function generateOrderId(): string {
  return `zari_${crypto.randomUUID().replaceAll("-", "")}`;
}

/** "행당해피빌 201호 2026년 8월 월세" — 토스 주문명(최대 100자) */
export function buildOrderName(charge: {
  year: number;
  month: number;
  lease: { unit: { label: string; building: { name: string } } };
}): string {
  const { building, label } = charge.lease.unit;
  return `${building.name} ${label} ${charge.year}년 ${charge.month}월 월세`;
}

/** 결제 금액 = 청구 잔액. **여기가 금액의 유일한 출처**다(원장 엔진 `calcOutstanding`) */
export function payableAmount(charge: { totalDue: number; paidAmount: number }): number {
  return calcOutstanding(charge.totalDue, charge.paidAmount);
}

// ────────────────────────────────────────────────────────────── 결제 화면

/** `/tenant/pay/[chargeId]` 서버 컴포넌트용 — 내 청구가 아니면 null */
export async function getPayCheckoutView(
  chargeId: string,
  tenantProfileId: string,
  tenantName: string,
): Promise<PayCheckoutViewDto | null> {
  const charge = await prisma.rentCharge.findUnique({
    where: { id: chargeId },
    include: { ...payableChargeInclude, payments: { orderBy: [{ paidAt: "asc" }, { id: "asc" }] } },
  });
  if (!charge || charge.lease.tenantProfileId !== tenantProfileId) return null;

  return {
    charge: toChargeDto(charge, kstToday()),
    lease: {
      id: charge.lease.id,
      buildingName: charge.lease.unit.building.name,
      unitLabel: charge.lease.unit.label,
      landlordName: charge.lease.unit.building.ownerProfile.user.name,
    },
    orderName: buildOrderName(charge),
    customerKey: tenantProfileId,
    customerName: tenantName,
  };
}

// ────────────────────────────────────────────────────────────── ① checkout

export type CheckoutOutcome =
  | { kind: "ok"; checkout: CheckoutDto }
  | { kind: "settled" };

/**
 * 주문 확정 — `TossPayment(READY)` 1건을 만든다.
 *
 * **클라이언트가 보낸 금액은 받지도 않는다.** 금액은 서버가 청구 잔액으로 정하고,
 * 승인 시점에 그 값을 다시 대조한다(위변조 검증).
 */
export async function createCheckout(
  tenant: TenantSession,
  charge: PayableCharge,
): Promise<CheckoutOutcome> {
  const amount = payableAmount(charge);
  if (amount <= 0) return { kind: "settled" };

  const orderId = generateOrderId();
  await prisma.tossPayment.create({
    data: { chargeId: charge.id, orderId, amount, status: "READY" },
  });

  return {
    kind: "ok",
    checkout: {
      orderId,
      amount,
      orderName: buildOrderName(charge),
      customerKey: tenant.profile.id,
      customerName: tenant.user.name,
      chargeId: charge.id,
    },
  };
}

// ────────────────────────────────────────────────────────────── ③④ confirm

export type ConfirmOutcome =
  | { kind: "ok"; result: ConfirmResultDto }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  /** 클라이언트가 주장한 금액 ≠ 서버가 확정한 금액, 또는 서버 금액 ≠ 현재 청구 잔액 */
  | { kind: "amount_mismatch"; expected: number; received: number; outstanding: number }
  /** 이미 승인·취소·실패로 끝난 주문 — 재승인 거부 */
  | { kind: "already"; status: TossPaymentStatusValue }
  /** 토스가 승인을 거절했거나 승인 결과가 DONE 이 아님 */
  | { kind: "declined"; code: string; message: string };

function toReceipt(
  row: { orderId: string; amount: number; status: TossPaymentStatus },
  payment: TossPaymentObject,
): PayReceiptDto {
  return {
    orderId: row.orderId,
    paymentKey: payment.paymentKey,
    amount: row.amount,
    method: typeof payment.method === "string" ? payment.method : null,
    approvedAt: typeof payment.approvedAt === "string" ? payment.approvedAt : null,
    receiptUrl: typeof payment.receipt?.url === "string" ? payment.receipt.url : null,
    cardCompany: typeof payment.card?.company === "string" ? payment.card.company : null,
    status: row.status,
  };
}

/**
 * ④ 원장 반영 — **한 트랜잭션**에서 `TossPayment` DONE + `RentPayment(CARD)` 생성 + 청구 재계산.
 *
 * 중복 방어 2겹:
 * 1. `updateMany({ status: "READY" })` 의 count 가 0 이면 이미 다른 요청이 반영한 것 → 중단
 * 2. `RentPayment.tossPaymentId @unique` → 같은 결제로 납부 행이 두 개 생길 수 없다(P2002)
 */
async function applyApproval(
  row: { id: string; chargeId: string; orderId: string; amount: number; raw: Prisma.JsonValue | null },
  payment: TossPaymentObject,
): Promise<ChargeDto | null> {
  const approvedAt = payment.approvedAt ? new Date(payment.approvedAt) : new Date();
  const raw = mergeRaw(row.raw, { payment });
  const memo = `자리페이 ${typeof payment.method === "string" && payment.method ? payment.method : "카드"}`;

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.tossPayment.updateMany({
      where: { id: row.id, status: "READY" },
      data: { status: "DONE", approvedAt, raw, paymentKey: payment.paymentKey },
    });
    // 이미 다른 요청(또는 웹훅)이 반영을 끝냈다 — 여기서 멈춰야 이중 납부가 안 생긴다
    if (claimed.count === 0) return null;

    await tx.rentPayment.create({
      data: {
        chargeId: row.chargeId,
        amount: row.amount,
        method: "CARD",
        paidAt: approvedAt,
        memo: memo.slice(0, 60),
        tossPaymentId: row.id,
      },
    });

    // T1.5 와 **같은 재계산 경로** — paidAmount·status 를 함께 갱신한다
    return recalcCharge(row.chargeId, tx);
  });
}

/**
 * 금액이 맞지 않아 거절한 승인 시도를 남긴다 — **상태는 바꾸지 않는다.**
 *
 * 우리는 승인하지 않았지만 **사용자 카드는 이미 결제됐을 수 있다**(탭을 두 개 열어 두 번 결제한
 * 경우 등). 그 돈을 찾아 환불하려면 paymentKey 가 필요하므로 사유와 함께 raw 에 기록한다.
 * `paymentKey` 유니크 컬럼은 건드리지 않는다 — 승인하지 않은 결제를 이 주문의 것으로 확정하면
 * 나중에 잘못된 복구가 일어날 수 있다.
 */
async function recordRejectedAttempt(
  row: { id: string; raw: Prisma.JsonValue | null },
  detail: Record<string, unknown>,
): Promise<void> {
  await prisma.tossPayment.update({
    where: { id: row.id },
    data: { raw: mergeRaw(row.raw, { rejected: [{ at: new Date().toISOString(), ...detail }] }) },
  });
}

/** 승인 실패 확정 — READY 인 주문만 FAILED 로 내린다(이미 끝난 주문은 건드리지 않는다) */
async function markFailed(
  row: { id: string; raw: Prisma.JsonValue | null },
  detail: unknown,
): Promise<void> {
  await prisma.tossPayment.updateMany({
    where: { id: row.id, status: "READY" },
    data: { status: "FAILED", raw: mergeRaw(row.raw, { payment: detail as TossPaymentObject }) },
  });
}

/**
 * ② 승인 선점 + ③ 승인 + ④ 원장 반영.
 *
 * ### 금액 위변조 검증 (3중)
 * | 비교 | 막는 것 |
 * |---|---|
 * | `body.amount` = `TossPayment.amount` | 리다이렉트 쿼리(`?amount=`)를 손댄 경우 |
 * | `TossPayment.amount` = `calcOutstanding(청구)` | checkout 이후 청구가 바뀐(임대인이 수기 납부를 기록한) 경우 |
 * | 승인 응답 `totalAmount` = `TossPayment.amount` | 토스에 다른 금액이 결제된 경우 |
 *
 * 셋 중 하나라도 어긋나면 **승인하지 않는다.**
 */
export async function confirmCheckout(
  tenant: TenantSession,
  input: { paymentKey: string; orderId: string; amount: number },
): Promise<ConfirmOutcome> {
  const row = await prisma.tossPayment.findUnique({
    where: { orderId: input.orderId },
    include: { charge: { include: payableChargeInclude } },
  });
  if (!row) return { kind: "not_found" };
  if (row.charge.lease.tenantProfileId !== tenant.profile.id) return { kind: "forbidden" };

  // ── 재승인 방지: READY 가 아닌 주문은 이미 끝난 주문이다
  if (row.status !== "READY") return { kind: "already", status: row.status };

  // ── 금액 위변조 검증 ①② (③ 은 승인 응답을 받은 뒤)
  const outstanding = payableAmount(row.charge);
  if (input.amount !== row.amount || row.amount !== outstanding) {
    // 승인은 하지 않지만, 이미 결제된 카드를 찾아 환불할 수 있게 시도를 남긴다
    await recordRejectedAttempt(row, {
      reason: input.amount !== row.amount ? "CLIENT_AMOUNT_MISMATCH" : "OUTSTANDING_CHANGED",
      paymentKey: input.paymentKey,
      expected: row.amount,
      received: input.amount,
      outstanding,
    });
    return {
      kind: "amount_mismatch",
      expected: row.amount,
      received: input.amount,
      outstanding,
    };
  }

  // ── ② 승인 선점(CAS) — paymentKey 는 유니크 컬럼이라 동시 요청 중 하나만 성공한다
  const claim = await prisma.tossPayment.updateMany({
    where: { id: row.id, status: "READY", paymentKey: null },
    data: { paymentKey: input.paymentKey },
  });

  let result: TossResult;
  if (claim.count === 1) {
    // ── ③ 신규 승인
    result = await confirmTossPayment({
      paymentKey: input.paymentKey,
      orderId: input.orderId,
      amount: row.amount,
    });
  } else {
    // 선점에 실패했다 = 이전 시도가 paymentKey 만 박고 끊겼거나(=승인 후 반영 실패 복구),
    // 동시 요청이 먼저 박았다. 승인을 다시 시도하지 않고 **진짜 상태를 조회**한다.
    const current = await prisma.tossPayment.findUnique({ where: { id: row.id } });
    if (!current) return { kind: "not_found" };
    if (current.status !== "READY") return { kind: "already", status: current.status };
    if (current.paymentKey !== input.paymentKey) {
      return { kind: "already", status: current.status };
    }
    result = await fetchTossPayment(input.paymentKey);
  }

  if (!result.ok) {
    // 네트워크 오류는 승인 여부를 모르는 상태다 — FAILED 로 확정하지 않고 재시도에 맡긴다
    if (result.code !== "TOSS_NETWORK_ERROR") {
      await markFailed(row, { error: { code: result.code, message: result.message } });
    }
    return { kind: "declined", code: result.code, message: result.message };
  }

  const payment = result.payment;
  // ── 금액 위변조 검증 ③ — 토스에 실제로 승인된 금액
  if (payment.totalAmount !== row.amount) {
    await markFailed(row, payment);
    return {
      kind: "amount_mismatch",
      expected: row.amount,
      received: payment.totalAmount,
      outstanding,
    };
  }
  if (payment.status !== TOSS_DONE) {
    await markFailed(row, payment);
    return {
      kind: "declined",
      code: `TOSS_STATUS_${payment.status}`,
      message: "결제가 완료되지 않았습니다.",
    };
  }

  // ── ④ 원장 반영
  const charge = await applyApproval(row, payment);
  if (!charge) {
    // 트랜잭션 CAS 가 막았다 = 그 사이 다른 경로가 이미 반영했다
    const after = await prisma.tossPayment.findUnique({ where: { id: row.id } });
    return { kind: "already", status: after?.status ?? "DONE" };
  }

  return {
    kind: "ok",
    result: { receipt: toReceipt({ ...row, status: "DONE" }, payment), charge },
  };
}

// ────────────────────────────────────────────────────────────── 웹훅

export type WebhookOutcome = {
  /** 우리가 아는 주문이 아니거나 다룰 이벤트가 아니라 건너뛴 경우 */
  ignored: boolean;
  /** 토스 재조회로 검증했는지 — 검증 못 하면 DB 를 바꾸지 않는다 */
  verified: boolean;
  orderId: string | null;
  /** 동기화 후 우리 쪽 상태 */
  status: TossPaymentStatusValue | null;
  /** 무엇을 했는지 — 로그·테스트용 */
  action: "none" | "approved" | "canceled" | "failed" | "unchanged";
};

/** 결제 상태 웹훅에서 우리가 다루는 이벤트 */
const HANDLED_EVENTS = new Set(["PAYMENT_STATUS_CHANGED", "CANCEL_STATUS_CHANGED"]);

/**
 * 웹훅 동기화 — **raw 를 먼저 저장하고, 본문을 믿지 않고 토스에 다시 물어본 뒤** 동기화한다.
 *
 * 토스는 `PAYMENT_STATUS_CHANGED` 에 서명 헤더를 주지 않는다(서명은 `payout.changed`·
 * `seller.changed` 전용). 그래서 **재조회가 곧 인증**이다 — 우리 시크릿 키로만 조회할 수 있고,
 * 위조 본문이 와도 토스 원본과 다르면 아무것도 바뀌지 않는다.
 */
export async function syncTossWebhook(event: {
  eventType: string;
  data: { orderId?: string; paymentKey?: string; status?: string };
  raw: unknown;
}): Promise<WebhookOutcome> {
  const orderId = event.data.orderId ?? null;
  if (!HANDLED_EVENTS.has(event.eventType) || !orderId) {
    return { ignored: true, verified: false, orderId, status: null, action: "none" };
  }

  const row = await prisma.tossPayment.findUnique({ where: { orderId } });
  if (!row) return { ignored: true, verified: false, orderId, status: null, action: "none" };

  // ① raw 를 먼저 남긴다 — 검증에 실패해도 "이런 웹훅이 왔다" 는 기록은 남아야 대사가 가능하다
  await prisma.tossPayment.update({
    where: { id: row.id },
    data: { raw: mergeRaw(row.raw, { webhooks: [event.raw] }) },
  });

  // ② 본문을 믿지 않고 토스에 다시 묻는다(= 인증)
  const paymentKey = event.data.paymentKey ?? row.paymentKey;
  const result = paymentKey
    ? await fetchTossPayment(paymentKey)
    : await fetchTossPaymentByOrderId(orderId);
  if (!result.ok) {
    return { ignored: false, verified: false, orderId, status: row.status, action: "none" };
  }
  const payment = result.payment;
  // 조회 결과의 주문번호가 다르면 우리 주문이 아니다
  if (payment.orderId !== orderId) {
    return { ignored: false, verified: false, orderId, status: row.status, action: "none" };
  }

  const fresh = await prisma.tossPayment.findUniqueOrThrow({ where: { id: row.id } });

  // ③ 동기화
  if ((TOSS_CANCELED_STATUSES as readonly string[]).includes(payment.status)) {
    if (fresh.status === "CANCELED") {
      return { ignored: false, verified: true, orderId, status: "CANCELED", action: "unchanged" };
    }
    await prisma.$transaction(async (tx) => {
      await tx.tossPayment.update({
        where: { id: fresh.id },
        data: { status: "CANCELED", raw: mergeRaw(fresh.raw, { payment }) },
      });
      // 카드 납부 행을 걷어내고 **같은 재계산 경로**로 청구를 되돌린다(완납 → 부분납·연체)
      await tx.rentPayment.deleteMany({ where: { tossPaymentId: fresh.id } });
      await recalcCharge(fresh.chargeId, tx);
    });
    return { ignored: false, verified: true, orderId, status: "CANCELED", action: "canceled" };
  }

  if (payment.status === TOSS_DONE) {
    if (fresh.status !== "READY" || fresh.amount !== payment.totalAmount) {
      return { ignored: false, verified: true, orderId, status: fresh.status, action: "unchanged" };
    }
    // 승인 후 원장 반영이 끊긴 주문 복구
    const charge = await applyApproval(fresh, payment);
    return {
      ignored: false,
      verified: true,
      orderId,
      status: "DONE",
      action: charge ? "approved" : "unchanged",
    };
  }

  if ((TOSS_FAILED_STATUSES as readonly string[]).includes(payment.status)) {
    if (fresh.status !== "READY") {
      return { ignored: false, verified: true, orderId, status: fresh.status, action: "unchanged" };
    }
    await markFailed(fresh, payment);
    return { ignored: false, verified: true, orderId, status: "FAILED", action: "failed" };
  }

  return { ignored: false, verified: true, orderId, status: fresh.status, action: "unchanged" };
}

/**
 * 주문번호 → 청구 id (내 계약의 주문일 때만).
 * success·fail 화면이 "다시 결제하기" 링크를 만들 때 쓴다.
 */
export async function findChargeIdByOrderId(
  orderId: string,
  tenantProfileId: string,
): Promise<string | null> {
  const row = await prisma.tossPayment.findUnique({
    where: { orderId },
    include: { charge: { select: { id: true, lease: { select: { tenantProfileId: true } } } } },
  });
  if (!row || row.charge.lease.tenantProfileId !== tenantProfileId) return null;
  return row.charge.id;
}

// ────────────────────────────────────────────────────────────── 납부 이력

/** `/tenant/payments` — 내 계약의 납부 전부(최근 순), 카드/기타 구분 */
export async function listTenantPayments(tenantProfileId: string): Promise<TenantPaymentsDto> {
  const rows = await prisma.rentPayment.findMany({
    where: { charge: { lease: { tenantProfileId } } },
    orderBy: [{ paidAt: "desc" }, { id: "desc" }],
    include: {
      tossPayment: true,
      charge: {
        include: { lease: { include: { unit: { include: { building: true } } } } },
      },
    },
  });

  const payments: TenantPaymentDto[] = rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    method: row.method,
    paidAt: row.paidAt.toISOString(),
    memo: row.memo,
    charge: {
      id: row.charge.id,
      year: row.charge.year,
      month: row.charge.month,
      status: row.charge.status,
    },
    lease: {
      id: row.charge.lease.id,
      buildingName: row.charge.lease.unit.building.name,
      unitLabel: row.charge.lease.unit.label,
    },
    toss: row.tossPayment
      ? {
          orderId: row.tossPayment.orderId,
          receiptUrl: readRaw(row.tossPayment.raw).payment?.receipt?.url ?? null,
          status: row.tossPayment.status,
        }
      : null,
  }));

  const card = payments.filter((payment) => payment.method === "CARD");
  return {
    payments,
    totals: {
      count: payments.length,
      amount: payments.reduce((sum, payment) => sum + payment.amount, 0),
      cardCount: card.length,
      cardAmount: card.reduce((sum, payment) => sum + payment.amount, 0),
    },
  };
}

export { getCharge };
