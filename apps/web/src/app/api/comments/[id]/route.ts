/**
 * `DELETE /api/comments/[id]` — 내 댓글 삭제 (T4.1).
 *
 * 글과 마찬가지로 **소프트 삭제**(`deletedAt`)다 — 신고 이력이 참조하고 있어 하드 삭제가 안 되고,
 * 작성자가 지운 댓글은 스레드에서 완전히 사라진다(블라인드와 다른 점).
 * 응답에는 갱신된 스레드가 실려 화면이 왕복 한 번으로 목록·댓글 수를 맞춘다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 댓글 · 이미 지운 댓글 | 404 `NOT_FOUND` |
 * | **남의 댓글** | 403 `FORBIDDEN` |
 * | **블라인드된 댓글** | 409 `CONFLICT` |
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
import { prisma } from "@zari/db";
import { blockedReason, canInteract } from "@/features/community/moderation";
import {
  requireCommunityProfile,
  requireOwnComment,
  toViewer,
} from "@/features/community/ownership";
import { getPostDetail } from "@/features/community/queries";
import { fail, ok } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  const session = await requireCommunityProfile();
  if (session.response) return session.response;

  const owned = await requireOwnComment(session.data, id);
  if (owned.response) return owned.response;
  if (!canInteract(owned.data.state)) {
    return fail("CONFLICT", blockedReason(owned.data.state, "COMMENT"));
  }

  await prisma.comment.update({ where: { id }, data: { deletedAt: new Date() } });

  const post = await getPostDetail(owned.data.comment.postId, toViewer(session.data));
  if (!post) return fail("INTERNAL_ERROR", "댓글을 삭제하지 못했습니다.");
  return ok({ post });
}
