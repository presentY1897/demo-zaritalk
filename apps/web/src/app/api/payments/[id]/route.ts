/**
 * `DELETE /api/payments/[id]` — 오기록 취소 (T1.5).
 *
 * 임대인이 "받음 체크"를 잘못 눌렀을 때 되돌리는 길이다. 지운 뒤 남은 납부 합계로
 * `paidAmount`·`status` 를 다시 계산한다(`recalcCharge` → `sumPayments`·`resolveChargeStatus`).
 * 완납이던 청구가 다시 부분납·연체로 내려가는 것도 이 한 경로로 처리된다.
 *
 * D1 규약의 삭제는 204 지만 여기서는 **200 + 갱신된 청구**를 돌려준다 —
 * 화면이 상태 배지·잔액을 곧바로 다시 그려야 하는데, 다시 조회하러 가면 한 박자 늦는다.
 *
 * `CARD` 납부(자리페이)는 토스 취소와 함께 다뤄야 하므로 여기서 지우지 않는다(T2.2 범위).
 */
import { prisma } from "@zari/db";
import { requireLandlord } from "@/features/landlord/ownership";
import { requireOwnedPayment } from "@/features/lease/ownership";
import { recalcCharge } from "@/features/lease/queries";
import { fail, ok } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Context): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const { id } = await context.params;
  const owned = await requireOwnedPayment(landlord.data, id);
  if (owned.response) return owned.response;

  // 자리페이 결제는 토스 취소와 함께 다뤄야 한다 — 여기서 행만 지우면 결제와 장부가 어긋난다
  if (owned.data.method === "CARD") {
    return fail("CONFLICT", "자리페이 결제는 여기서 취소할 수 없습니다.");
  }

  await prisma.rentPayment.delete({ where: { id } });

  const charge = await recalcCharge(owned.data.chargeId);
  if (!charge) return fail("NOT_FOUND", "청구를 찾을 수 없습니다.");
  return ok({ charge });
}
