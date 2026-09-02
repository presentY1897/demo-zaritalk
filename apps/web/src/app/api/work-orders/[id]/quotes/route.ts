/**
 * `POST /api/work-orders/[id]/quotes` — 마스터의 **견적 제안** (T5.3). **의뢰당 업체 1회.**
 *
 * ## 누가 낼 수 있나 — 판정을 새로 쓰지 않는다
 *
 * "이 마스터가 이 의뢰를 볼 수 있는가" 는 T5.2 의 `getMasterWorkOrder` 한 곳에서만 판정한다
 * (추천으로 받았거나 · 내 업종 + 활동반경 안). 견적 자격을 여기서 다시 계산하면 **피드에는
 * 보이는데 견적은 못 내는** 어긋남이 생긴다. 상태 조건(`REQUESTED` 만)은 그 위에 한 겹 더 얹는다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 마스터 프로필·업종/활동지역 없음(임대인 계정 포함) | 403 `FORBIDDEN` |
 * | 없는 의뢰 | 404 `NOT_FOUND` |
 * | **내 업종·반경 밖이고 추천도 아닌 의뢰** | 403 `FORBIDDEN` |
 * | **이미 견적을 낸 의뢰**(의뢰당 1회) | 409 `CONFLICT` |
 * | **`REQUESTED` 가 아닌 의뢰**(배정·완료·취소) | 409 `CONFLICT` |
 * | 금액·메시지 형식 오류 | 400 `VALIDATION_ERROR` |
 *
 * 409(중복)는 **두 겹**이다 — 먼저 조회로 막고, 동시 요청은 `@@unique([workOrderId, masterProfileId])`
 * 위반(P2002)을 잡아 같은 409 로 바꾼다(T5.1 의 민원 전환 409 와 같은 처리).
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
import { Prisma, prisma } from "@zari/db";
import { requireMaster } from "@/features/master/ownership";
import { getMasterWorkOrder } from "@/features/master/queries";
import { getMasterQuote } from "@/features/workorder/quotes";
import { createQuoteSchema } from "@/features/workorder/schema";
import { acceptsNewQuote, quoteRejectReason } from "@/features/workorder/status";
import { created, fail, parseJson } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  const master = await requireMaster();
  if (master.response) return master.response;

  const parsed = await parseJson(request, createQuoteSchema);
  if (parsed.response) return parsed.response;

  // 없는 의뢰(404)와 볼 수 없는 의뢰(403)를 가른다 — `getMasterWorkOrder` 는 둘 다 null 이다
  const exists = await prisma.workOrder.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return fail("NOT_FOUND", "작업 의뢰를 찾을 수 없습니다.");

  const workOrder = await getMasterWorkOrder(master.data, id);
  if (!workOrder) {
    return fail("FORBIDDEN", "내 업종·활동반경 안의 의뢰에만 견적을 낼 수 있습니다.");
  }
  if (!acceptsNewQuote(workOrder.status)) {
    return fail("CONFLICT", quoteRejectReason(workOrder.status));
  }

  const already = await prisma.workOrderQuote.findUnique({
    where: {
      workOrderId_masterProfileId: { workOrderId: id, masterProfileId: master.data.profile.id },
    },
    select: { id: true },
  });
  if (already) return fail("CONFLICT", "이 의뢰에는 이미 견적을 냈습니다.");

  let quoteId: string;
  try {
    const row = await prisma.workOrderQuote.create({
      data: {
        workOrderId: id,
        masterProfileId: master.data.profile.id,
        amount: parsed.data.amount,
        message: parsed.data.message?.trim() ? parsed.data.message.trim() : null,
        // status 는 스키마 기본값 PROPOSED — 임대인이 수락할 때까지 이 상태다
      },
    });
    quoteId = row.id;
  } catch (error) {
    // 동시에 두 번 보내도 견적은 하나뿐이다(@@unique)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("CONFLICT", "이 의뢰에는 이미 견적을 냈습니다.");
    }
    throw error;
  }

  const quote = await getMasterQuote(quoteId);
  if (!quote) return fail("INTERNAL_ERROR", "견적을 저장하지 못했습니다.");
  return created({ quote });
}
