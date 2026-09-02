/**
 * `GET·POST /api/posts/[id]/comments` — 댓글 목록·작성 (T4.1).
 *
 * 작성 응답에는 **갱신된 스레드 전체**(`post`)가 함께 실린다 — 상세 화면이 왕복 한 번으로
 * 댓글 수·목록을 갱신한다(T2.6 스레드와 같은 방식).
 *
 * 블라인드된 댓글은 목록에 **자리를 남기고 본문만 가린다**(작성자·어드민은 원문을 본다).
 * 작성자가 지운 댓글은 목록에서 빠진다 — `features/community/moderation.ts` 규칙표 그대로다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 글 · 작성자가 지운 글 | 404 `NOT_FOUND` |
 * | **블라인드된 글에 댓글** | 409 `CONFLICT` |
 * | 본문 형식 오류 | 400 `VALIDATION_ERROR` |
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
import { prisma } from "@zari/db";
import { blockedReason, canInteract } from "@/features/community/moderation";
import {
  requireCommunityProfile,
  requireVisiblePost,
  toViewer,
} from "@/features/community/ownership";
import { getPostDetail, listComments } from "@/features/community/queries";
import { createCommentSchema } from "@/features/community/schema";
import { created, fail, ok, parseJson } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  const session = await requireCommunityProfile();
  if (session.response) return session.response;

  const visible = await requireVisiblePost(id);
  if (visible.response) return visible.response;

  const comments = await listComments(id, toViewer(session.data));
  return ok({ comments });
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  const session = await requireCommunityProfile();
  if (session.response) return session.response;

  const visible = await requireVisiblePost(id);
  if (visible.response) return visible.response;
  if (!canInteract(visible.data.state)) {
    return fail("CONFLICT", blockedReason(visible.data.state, "POST"));
  }

  const parsed = await parseJson(request, createCommentSchema);
  if (parsed.response) return parsed.response;

  const row = await prisma.comment.create({
    data: {
      postId: id,
      authorProfileId: session.data.profile.id,
      body: parsed.data.body,
    },
  });

  const viewer = toViewer(session.data);
  const [comments, post] = await Promise.all([listComments(id, viewer), getPostDetail(id, viewer)]);
  const comment = comments.find((item) => item.id === row.id);
  if (!comment || !post) return fail("INTERNAL_ERROR", "댓글을 저장하지 못했습니다.");

  return created({ comment, post });
}
