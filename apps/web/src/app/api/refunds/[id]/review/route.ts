/**
 * `POST /api/refunds/[id]/review` — 어드민 심사 액션 (T2.5).
 *
 * 요청은 **액션 이름만** 보낸다. 목표 상태도, 코멘트 필수 여부도 서버의 상태 전이표
 * (`features/refund/status.ts`)가 정한다 — 클라이언트가 목표 상태를 고르게 두면 상태 머신이
 * 두 벌이 된다(어드민 앱은 별도 Next 앱이라 더 그렇다).
 *
 * ```jsonc
 * // 요청
 * { "action": "NEED_MORE_DOCS", "note": "등본에 전입일이 안 보입니다. 다시 올려 주세요." }
 * ```
 *
 * 액션 → 전이:
 *
 * | action | 전이 | 코멘트 |
 * |---|---|---|
 * | `START` | `SUBMITTED` → `REVIEWING` | 선택 |
 * | `NEED_MORE_DOCS` | `REVIEWING` → `NEED_MORE_DOCS` | **필수** |
 * | `APPROVE` | `REVIEWING` → `APPROVED` | 선택 |
 * | `REJECT` | `REVIEWING` → `REJECTED` | **필수** |
 * | `COMPLETE` | `APPROVED` → `COMPLETED` | 선택 |
 *
 * 성공하면 **상태·심사자·시각**을 기록하고 세입자에게 알림톡 시뮬(`MessageLog`)을 한 줄 남긴다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 세션도 서비스 시크릿도 없음 | 401 `UNAUTHORIZED` |
 * | **비어드민 세션** | 403 `FORBIDDEN` |
 * | 없는 신청 | 404 `NOT_FOUND` |
 * | 모르는 액션 | 400 `VALIDATION_ERROR` |
 * | **코멘트가 필수인데 비었음** | 400 `VALIDATION_ERROR` |
 * | 지금 상태에서 못 하는 액션(SUBMITTED 에서 승인 등) | 409 `CONFLICT` |
 */
import { prisma } from "@zari/db";
import {
  findApplication,
  REFUND_APPLICATION_INCLUDE,
  requireRefundAdmin,
} from "@/features/refund/ownership";
import { toReviewItemDto } from "@/features/refund/queries";
import { refundReviewSchema } from "@/features/refund/schema";
import { notifyTenantOfReview } from "@/features/refund/service";
import {
  resolveReviewTransition,
  reviewTransitionsFor,
  transitionRejectReason,
  type RefundStatusValue,
} from "@/features/refund/status";
import { fail, ok, parseJson } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  const admin = await requireRefundAdmin(request);
  if (admin.response) return admin.response;

  const parsed = await parseJson(request, refundReviewSchema);
  if (parsed.response) return parsed.response;
  const { action } = parsed.data;
  const note = parsed.data.note?.trim() ? parsed.data.note.trim() : null;

  const application = await findApplication(id);
  if (!application) return fail("NOT_FOUND", "환급 신청을 찾을 수 없습니다.");

  const from = application.status as RefundStatusValue;
  const transition = resolveReviewTransition(from, action);
  if (!transition) {
    // 그 액션이 원래 가려던 곳을 알아야 "왜 안 되는지" 를 문구로 설명할 수 있다
    const intended = reviewTransitionsFor(action)[0];
    return fail("CONFLICT", transitionRejectReason(from, intended?.to ?? from));
  }

  if (transition.requiresNote && !note) {
    return fail("VALIDATION_ERROR", `「${transition.label}」에는 심사 코멘트가 필요합니다.`);
  }

  const now = new Date();
  // 전이 전 상태를 조건에 넣은 단일 UPDATE — 두 심사자가 동시에 눌러도 한쪽만 성공한다
  const updated = await prisma.refundApplication.updateMany({
    where: { id, status: from },
    data: {
      status: transition.to,
      reviewedById: admin.data.user.id,
      reviewNote: note,
      // 심사 「시작」은 아직 결정이 아니다 — 결정 시각은 보완요청·승인·반려·완료에만 찍는다
      ...(action === "START" ? {} : { decidedAt: now }),
    },
  });
  if (updated.count === 0) return fail("CONFLICT", "이미 다른 상태로 처리된 신청입니다.");

  const row = await prisma.refundApplication.findUnique({
    where: { id },
    include: REFUND_APPLICATION_INCLUDE,
  });
  if (!row) return fail("INTERNAL_ERROR", "심사 결과를 저장하지 못했습니다.");

  const notification = await notifyTenantOfReview({
    application: row,
    status: transition.to,
    actorName: admin.data.user.name,
    note,
    at: now,
  });

  return ok({ application: toReviewItemDto(row), notification });
}
