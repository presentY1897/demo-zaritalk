/**
 * `POST /api/quotes/[id]/accept` — 임대인의 **견적 수락**. 의뢰를 낸 임대인 전용 (T5.3).
 *
 * ## 하나를 고르면 나머지는 자동으로 닫힌다 — **원자적으로**
 *
 * 수락 한 건(`ACCEPTED`) · 나머지 전부(`REJECTED`) · 의뢰 배정(`ASSIGNED`) 셋은
 * **한 트랜잭션**이다. 규칙과 순서는 `features/workorder/quotes.ts` 의 `runQuoteAcceptance`
 * 한 곳에만 있고, 여기서는 트랜잭션이 던진 신호를 상태 코드로 옮기기만 한다.
 *
 * **동시 요청 2건은 하나만 성공한다.** 트랜잭션이 의뢰 행을 먼저 조건부로 갱신하므로
 * (`where: { status: "REQUESTED" }`) 뒤에 온 쪽은 잠금이 풀린 뒤 조건 재평가에서 밀려
 * `count = 0` → 409 가 된다. 자세한 근거는 `quotes.ts` 상단 주석에 적었다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 임대인 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 견적 | 404 `NOT_FOUND` |
 * | **남의 의뢰에 달린 견적** | 403 `FORBIDDEN` |
 * | 이미 수락·거절된 견적 · 이미 배정·종결된 의뢰 · 동시 요청에서 밀린 쪽 | 409 `CONFLICT` |
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
import { prisma } from "@zari/db";
import { requireLandlord } from "@/features/landlord/ownership";
import { requireOwnWorkOrder } from "@/features/workorder/ownership";
import {
  acceptQuote,
  getLandlordWorkOrderDetail,
  QuoteAcceptConflictError,
} from "@/features/workorder/quotes";
import { fail, ok } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const quote = await prisma.workOrderQuote.findUnique({
    where: { id },
    select: { id: true, workOrderId: true, status: true },
  });
  if (!quote) return fail("NOT_FOUND", "견적을 찾을 수 없습니다.");

  // 소유권 판정은 의뢰 쪽 가드 한 곳(T5.1 `requireOwnWorkOrder`) — 견적용을 새로 쓰지 않는다
  const owned = await requireOwnWorkOrder(landlord.data, quote.workOrderId);
  if (owned.response) return owned.response;

  try {
    await acceptQuote({ quoteId: quote.id, workOrderId: quote.workOrderId });
  } catch (error) {
    if (error instanceof QuoteAcceptConflictError) return fail("CONFLICT", error.message);
    throw error;
  }

  const detail = await getLandlordWorkOrderDetail(quote.workOrderId);
  if (!detail) return fail("INTERNAL_ERROR", "견적 수락을 저장하지 못했습니다.");
  return ok({ ...detail, acceptedQuoteId: quote.id });
}
