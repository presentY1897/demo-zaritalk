/**
 * `POST /api/reports/[id]/action` — 신고 처리 (T4.2). **어드민 전용.**
 *
 * 요청은 **액션 이름만** 보낸다 — 무엇이 바뀌는지는 서버가 정한다(T2.5 심사 API 와 같은 방식).
 * 어드민 화면은 `availableActions` 를 그대로 그리므로 규칙을 한 벌도 들고 있지 않다.
 *
 * | 액션 | 대상 | 이 신고 | 같은 대상의 다른 **대기** 신고 |
 * |---|---|---|---|
 * | `BLIND` 블라인드 | `deletedAt` 을 찍는다(소프트 삭제) | `ACTIONED` | **함께 `ACTIONED`** — 같은 처리자·시각 |
 * | `DISMISS` 기각 | 그대로 | `DISMISSED` | **건드리지 않는다** |
 *
 * 블라인드는 **대상에 대한 결정**이라 같은 대상의 다른 신고도 함께 끝난다(같은 글이 큐에 5줄로
 * 남지 않는다). 기각은 **그 신고에 대한 결정**이라 다른 사람이 다른 사유로 낸 신고는 큐에 남는다 —
 * "광고" 로 낸 신고를 기각했다고 "욕설" 신고까지 사라지면 안 되기 때문이다.
 *
 * ## 기록
 *
 * | 기록 | 어디에 |
 * |---|---|
 * | 결과 | `Report.status` |
 * | **처리자** | `Report.handledById` — 세션이든 서비스 시크릿이든 **실재하는 `isAdmin` User** |
 * | **시각** | `Report.handledAt` |
 * | 블라인드 결과 | 대상의 `deletedAt`(글은 `Post`, 댓글은 `Comment`) |
 *
 * 저장은 **`status: OPEN` 을 조건에 넣은 `updateMany`** 라 두 어드민이 동시에 눌러도 한쪽만
 * 성공한다(`count === 0` → 409). T2.5 환급 심사와 같은 방식이다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 세션도 시크릿도 없음 | 401 `UNAUTHORIZED` |
 * | **비어드민 세션**·시크릿 불일치·`isAdmin` 계정 없음 | 403 `FORBIDDEN` |
 * | 없는 신고 | 404 `NOT_FOUND` |
 * | 모르는 액션 | 400 `VALIDATION_ERROR` |
 * | **이미 처리된 신고** | 409 `CONFLICT` |
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
import { prisma, ReportStatus, ReportTargetType } from "@zari/db";
import { requireModerationAdmin } from "@/features/community/ownership";
import { getAdminReport } from "@/features/community/queries";
import { reportActionSchema } from "@/features/community/schema";
import { fail, ok, parseJson } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  const admin = await requireModerationAdmin(request);
  if (admin.response) return admin.response;

  const parsed = await parseJson(request, reportActionSchema);
  if (parsed.response) return parsed.response;
  const action = parsed.data.action;

  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) return fail("NOT_FOUND", "신고를 찾을 수 없습니다.");
  if (report.status !== ReportStatus.OPEN) {
    return fail("CONFLICT", "이미 처리된 신고입니다.");
  }

  const handledAt = new Date();
  const handledById = admin.data.user.id;
  const isPost = report.targetType === ReportTargetType.POST;

  const alsoClosedReportIds = await prisma.$transaction(async (tx) => {
    // 전이 전 상태를 조건에 넣는다 — 두 어드민이 동시에 눌러도 한쪽만 성공한다
    const claimed = await tx.report.updateMany({
      where: { id, status: ReportStatus.OPEN },
      data: {
        status: action === "BLIND" ? ReportStatus.ACTIONED : ReportStatus.DISMISSED,
        handledById,
        handledAt,
      },
    });
    if (claimed.count === 0) return null;

    if (action !== "BLIND") return [];

    // ① 대상 블라인드 — 이미 지워진 글이면 시각을 덮어쓰지 않는다
    if (isPost && report.postId) {
      await tx.post.updateMany({
        where: { id: report.postId, deletedAt: null },
        data: { deletedAt: handledAt },
      });
    } else if (report.commentId) {
      await tx.comment.updateMany({
        where: { id: report.commentId, deletedAt: null },
        data: { deletedAt: handledAt },
      });
    }

    // ② 같은 대상의 다른 대기 신고도 같은 결정으로 종결
    const targetWhere = isPost ? { postId: report.postId } : { commentId: report.commentId };
    const siblings = await tx.report.findMany({
      where: { ...targetWhere, status: ReportStatus.OPEN, id: { not: id } },
      select: { id: true },
    });
    if (siblings.length > 0) {
      await tx.report.updateMany({
        where: { id: { in: siblings.map((row) => row.id) } },
        data: { status: ReportStatus.ACTIONED, handledById, handledAt },
      });
    }
    return siblings.map((row) => row.id);
  });

  if (alsoClosedReportIds === null) return fail("CONFLICT", "이미 처리된 신고입니다.");

  const updated = await getAdminReport(id);
  if (!updated) return fail("INTERNAL_ERROR", "신고를 처리하지 못했습니다.");
  return ok({ report: updated, alsoClosedReportIds });
}
