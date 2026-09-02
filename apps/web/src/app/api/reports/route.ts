/**
 * `POST /api/reports` — 글·댓글 신고 (T4.2) · `GET /api/reports` — 어드민 신고 큐.
 *
 * 한 파일에 사용자용 접수와 어드민용 큐가 함께 있다. 사용자 쪽에는 "내 신고 목록" 화면이 없어
 * `GET` 자리가 비어 있었고, T2.5 가 `GET /api/refunds?scope=review` 로 큐를 붙인 것과 같은 모양이다.
 *
 * ## 중복 신고를 어떻게 다루나
 *
 * | 상황 | 결과 |
 * |---|---|
 * | **같은 사람**이 **같은 대상**을 다시 신고 (대기 중인 내 신고가 있다) | **새 행을 만들지 않고** 그 신고를 200 `duplicated: true` 로 돌려준다 |
 * | 다른 사람이 같은 대상을 신고 | 새 행(큐에 나란히 쌓인다 — 몇 명이 신고했는지가 판단 재료다) |
 * | 내 지난 신고가 이미 처리됨(블라인드·기각) | 새 행 — 같은 대상이라도 **새 사건**이다 |
 *
 * 같은 사람의 재신고를 막지 않고 "이미 접수됨" 으로 돌려주는 이유: 화면에서 두 번 눌렀을 때
 * 에러를 띄우면 신고가 안 된 것처럼 보인다. 큐는 깨끗하게 두고 사용자에게는 성공으로 보인다.
 *
 * ## 실패
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 프로필 없음 | 403 `FORBIDDEN` |
 * | **내 글·댓글 신고** | 403 `FORBIDDEN` |
 * | 없는 대상 · 작성자가 지운 대상 | 404 `NOT_FOUND` |
 * | **이미 블라인드된 대상** | 409 `CONFLICT` |
 * | **사유 누락·공백만**·형식 오류 | 400 `VALIDATION_ERROR` |
 * | (`GET`) 세션도 시크릿도 없음 | 401 `UNAUTHORIZED` |
 * | (`GET`) **비어드민 세션**·시크릿 불일치·`isAdmin` 계정 없음 | 403 `FORBIDDEN` |
 */
import { prisma, ReportStatus, ReportTargetType } from "@zari/db";
import { blockedReason, canInteract } from "@/features/community/moderation";
import {
  loadComment,
  loadPost,
  requireCommunityProfile,
  requireModerationAdmin,
} from "@/features/community/ownership";
import { listReportQueue, reportStatusCounts } from "@/features/community/queries";
import { createReportSchema, reportQueueQuerySchema } from "@/features/community/schema";
import type { ReportDto, ReportStatusValue } from "@/features/community/types";
import { created, fail, ok, parseJson, parseQuery } from "@/lib/api/response";

const ALL_STATUSES: ReportStatusValue[] = ["OPEN", "ACTIONED", "DISMISSED"];

function toReportDto(row: {
  id: string;
  targetType: string;
  postId: string | null;
  commentId: string | null;
  reason: string;
  status: string;
  createdAt: Date;
}): ReportDto {
  return {
    id: row.id,
    targetType: row.targetType as ReportDto["targetType"],
    targetId: (row.targetType === ReportTargetType.POST ? row.postId : row.commentId) ?? "",
    reason: row.reason,
    status: row.status as ReportStatusValue,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function POST(request: Request): Promise<Response> {
  const session = await requireCommunityProfile();
  if (session.response) return session.response;

  const parsed = await parseJson(request, createReportSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  // 대상 확인 — 없거나 작성자가 지웠으면 404, 이미 블라인드면 409(더 할 일이 없다)
  const target =
    input.targetType === "POST"
      ? await loadPost(input.targetId)
      : await loadComment(input.targetId);
  if (!target || target.state === "REMOVED") {
    return fail("NOT_FOUND", "신고할 대상을 찾을 수 없습니다.");
  }
  if (!canInteract(target.state)) {
    return fail("CONFLICT", blockedReason(target.state, input.targetType));
  }

  const authorProfileId =
    "post" in target ? target.post.authorProfileId : target.comment.authorProfileId;
  if (session.data.profileIds.includes(authorProfileId)) {
    return fail("FORBIDDEN", "내 글·댓글은 신고할 수 없습니다.");
  }

  const targetWhere =
    input.targetType === "POST" ? { postId: input.targetId } : { commentId: input.targetId };

  // 내가 이미 접수해 **대기 중인** 신고가 있으면 그것을 그대로 돌려준다(큐를 늘리지 않는다)
  const existing = await prisma.report.findFirst({
    where: {
      ...targetWhere,
      status: ReportStatus.OPEN,
      reporterProfileId: { in: session.data.profileIds },
    },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return ok({ report: toReportDto(existing), duplicated: true });

  const row = await prisma.report.create({
    data: {
      targetType:
        input.targetType === "POST" ? ReportTargetType.POST : ReportTargetType.COMMENT,
      ...targetWhere,
      reporterProfileId: session.data.profile.id,
      reason: input.reason,
    },
  });

  return created({ report: toReportDto(row), duplicated: false });
}

export async function GET(request: Request): Promise<Response> {
  const admin = await requireModerationAdmin(request);
  if (admin.response) return admin.response;

  const parsed = parseQuery(request, reportQueueQuerySchema);
  if (parsed.response) return parsed.response;

  // 모르는 값은 버린다(T2.5 심사 큐와 같은 규칙). 생략하면 손이 필요한 대기 건만.
  const requested = parsed.data.status
    ? parsed.data.status
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter((value): value is ReportStatusValue =>
          (ALL_STATUSES as string[]).includes(value),
        )
    : ["OPEN" as const];

  const statuses = requested.length > 0 ? requested : ["OPEN" as ReportStatusValue];
  const [reports, counts] = await Promise.all([listReportQueue(statuses), reportStatusCounts()]);
  return ok({ reports, counts });
}
