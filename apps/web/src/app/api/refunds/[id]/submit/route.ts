/**
 * `POST /api/refunds/[id]/submit` — 환급 신청 제출 (T2.4). **세입자 전용.**
 *
 * 같은 엔드포인트가 두 가지 제출을 처리한다(목표 상태는 상태 머신이 정한다):
 *
 * | 현재 | 목표 | 무엇 |
 * |---|---|---|
 * | `DRAFT` | `SUBMITTED` | 최초 제출 |
 * | `NEED_MORE_DOCS` | `REVIEWING` | 보완 재제출 — 심사자 책상으로 되돌린다 |
 *
 * **필수 서류 검증**이 여기서 일어난다(임대차계약서·주민등록등본 각 1장 이상).
 * 보완 재제출은 거기에 더해 **보완요청 이후 새로 올린 서류가 1건 이상** 있어야 한다 —
 * 아무것도 안 내고 "다시 봐 달라" 는 요청을 큐에 다시 올리지 않으려는 규칙이다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 세입자 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 신청 | 404 `NOT_FOUND` |
 * | 남의 신청 | 403 `FORBIDDEN` |
 * | **필수 서류 부족** | 400 `VALIDATION_ERROR` (`details.missingSlots`) |
 * | **보완 후 추가 서류 없음** | 400 `VALIDATION_ERROR` |
 * | 제출할 수 없는 상태(이미 제출·심사중·종결) | 409 `CONFLICT` |
 */
import { prisma } from "@zari/db";
import { missingRequiredSlots, missingSlotsMessage } from "@/features/refund/documents";
import { REFUND_APPLICATION_INCLUDE, requireOwnApplication } from "@/features/refund/ownership";
import { readDocuments, toApplicationDto } from "@/features/refund/queries";
import { hasSupplementSince } from "@/features/refund/service";
import { submitTargetFor, transitionRejectReason, type RefundStatusValue } from "@/features/refund/status";
import { fail, ok } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  const owned = await requireOwnApplication(id);
  if (owned.response) return owned.response;
  const { application } = owned.data;

  const from = application.status as RefundStatusValue;
  const target = submitTargetFor(from);
  if (!target) return fail("CONFLICT", transitionRejectReason(from, "SUBMITTED"));

  const documents = readDocuments(application.documents);
  const missing = missingRequiredSlots(documents);
  if (missing.length > 0) {
    return fail("VALIDATION_ERROR", missingSlotsMessage(missing), { missingSlots: missing });
  }

  if (from === "NEED_MORE_DOCS" && !hasSupplementSince(documents, application.decidedAt)) {
    return fail("VALIDATION_ERROR", "보완 요청 이후에 추가한 서류가 없습니다.");
  }

  const now = new Date();
  // 전이 전 상태를 조건에 넣은 단일 UPDATE — 두 번 눌러도 한 번만 성공한다(count 0 → 409)
  const updated = await prisma.refundApplication.updateMany({
    where: { id, status: from },
    data: {
      status: target,
      // 최초 제출 시각은 한 번만 찍는다 — 보완 재제출이 접수 시각을 밀어내면 큐 정렬이 흔들린다
      ...(application.submittedAt ? {} : { submittedAt: now }),
    },
  });
  if (updated.count === 0) return fail("CONFLICT", "이미 처리된 신청입니다.");

  const row = await prisma.refundApplication.findUnique({
    where: { id },
    include: REFUND_APPLICATION_INCLUDE,
  });
  if (!row) return fail("INTERNAL_ERROR", "신청을 제출하지 못했습니다.");
  return ok({ application: toApplicationDto(row) });
}
