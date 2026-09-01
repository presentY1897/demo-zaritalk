/**
 * `POST /api/charges/[id]/payments` — 납부 추가 (T1.5).
 *
 * 화면의 두 가지 입력이 이 한 엔드포인트로 모인다:
 * - **받음 체크** → `MANUAL_CHECK` (금액만)
 * - **가상 입금 시뮬레이션** → `VIRTUAL_TRANSFER` (입금자명이 `memo` 로 들어간다)
 *
 * `CARD`(자리페이)는 T2.2 의 토스 확인 흐름에서만 만들어져야 하므로 스키마가 받지 않는다.
 *
 * ## 초과 납부는 400
 * 원장 엔진 `isOverpayment(totalDue, paidAmount, amount)` 로 판정한다. 남은 금액을 넘겨 받으면
 * 잔액이 음수가 되는 대신 요청을 거절한다 — 초과분 환급은 보증금 정산(T2.3)의 일이다.
 *
 * ## 상태 재계산
 * `paidAmount` 의 원본은 `RentPayment` 합계다. 저장 뒤 `recalcCharge` 가
 * `sumPayments` → `resolveChargeStatus` 로 `paidAmount`·`status` 를 **함께** 갱신한다
 * (크론은 상태만 고쳐 주고 `paidAmount` 는 손대지 않는다 — T1.4).
 */
import { prisma } from "@zari/db";
import { requireLandlord } from "@/features/landlord/ownership";
import { requireOwnedCharge } from "@/features/lease/ownership";
import { recalcCharge } from "@/features/lease/queries";
import { createPaymentSchema } from "@/features/lease/schema";
import { created, fail, parseJson } from "@/lib/api/response";
import { calcOutstanding, isOverpayment } from "@/lib/rent";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const { id } = await context.params;
  const owned = await requireOwnedCharge(landlord.data, id);
  if (owned.response) return owned.response;
  const charge = owned.data;

  const parsed = await parseJson(request, createPaymentSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  if (isOverpayment(charge.totalDue, charge.paidAmount, input.amount)) {
    return fail(
      "VALIDATION_ERROR",
      `남은 금액(${calcOutstanding(charge.totalDue, charge.paidAmount).toLocaleString(
        "ko-KR",
      )}원)을 넘겨 받을 수 없습니다.`,
    );
  }

  const payment = await prisma.rentPayment.create({
    data: {
      chargeId: charge.id,
      amount: input.amount,
      method: input.method,
      memo: input.memo?.trim() || null,
    },
  });

  const updated = await recalcCharge(charge.id);
  if (!updated) return fail("INTERNAL_ERROR", "납부를 반영하지 못했습니다.");

  return created({
    charge: updated,
    payment: updated.payments.find((row) => row.id === payment.id) ?? null,
  });
}
