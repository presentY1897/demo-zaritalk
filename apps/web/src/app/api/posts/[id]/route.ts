/**
 * `GET·PATCH·DELETE /api/posts/[id]` — 글 상세·수정·삭제 (T4.1).
 *
 * ## `GET` 은 **조회수를 올린다**
 *
 * 상세 화면(서버 컴포넌트)도 같은 조회 함수를 `countView: true` 로 부른다 — 화면 진입 1회당
 * 정확히 1 오른다(상세는 Tanstack Query 로 다시 읽지 않는다. T2.6 스레드와 같은 방식).
 * 조회수 증가는 `@updatedAt` 을 건드리지 않는 raw UPDATE 다(`queries.ts` 참고).
 *
 * ## 삭제는 **소프트 삭제**다
 *
 * `deletedAt` 만 찍는다. 달린 댓글·좋아요·신고 이력이 남아 있어야 어드민이 지난 신고를 볼 수 있고,
 * `Report.postId` 가 참조 중이라 하드 삭제는 애초에 불가능하다. 작성자가 지운 글은 목록·상세에서
 * **완전히 사라진다**(404) — 블라인드와 다른 점이다(`features/community/moderation.ts` 규칙표).
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 글 · **작성자가 지운 글** | 404 `NOT_FOUND` |
 * | **남의 글** 수정·삭제 | 403 `FORBIDDEN` |
 * | **블라인드된 글** 수정·삭제 | 409 `CONFLICT` |
 * | 제목·본문·지역 형식 오류 | 400 `VALIDATION_ERROR` |
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
import { prisma } from "@zari/db";
import { canInteract, blockedReason } from "@/features/community/moderation";
import {
  requireCommunityProfile,
  requireOwnPost,
  requireVisiblePost,
  toViewer,
} from "@/features/community/ownership";
import { getPostDetail } from "@/features/community/queries";
import { findRegion, regionLabel } from "@/features/community/regions";
import { updatePostSchema } from "@/features/community/schema";
import { fail, ok, parseJson } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  const session = await requireCommunityProfile();
  if (session.response) return session.response;

  const visible = await requireVisiblePost(id);
  if (visible.response) return visible.response;

  const post = await getPostDetail(id, toViewer(session.data), { countView: true });
  if (!post) return fail("NOT_FOUND", "글을 찾을 수 없습니다.");
  return ok({ post });
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  const session = await requireCommunityProfile();
  if (session.response) return session.response;

  const owned = await requireOwnPost(session.data, id);
  if (owned.response) return owned.response;
  if (!canInteract(owned.data.state)) {
    return fail("CONFLICT", blockedReason(owned.data.state, "POST"));
  }

  const parsed = await parseJson(request, updatePostSchema);
  if (parsed.response) return parsed.response;

  const region = parsed.data.regionCode ? findRegion(parsed.data.regionCode) : undefined;
  if (parsed.data.regionCode && !region) {
    return fail("VALIDATION_ERROR", "지원하지 않는 지역입니다.");
  }

  await prisma.post.update({
    where: { id },
    data: {
      ...(parsed.data.title ? { title: parsed.data.title } : {}),
      ...(parsed.data.body ? { body: parsed.data.body } : {}),
      ...(region ? { regionCode: region.code, regionName: regionLabel(region) } : {}),
    },
  });

  const post = await getPostDetail(id, toViewer(session.data));
  if (!post) return fail("INTERNAL_ERROR", "글을 저장하지 못했습니다.");
  return ok({ post });
}

export async function DELETE(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  const session = await requireCommunityProfile();
  if (session.response) return session.response;

  const owned = await requireOwnPost(session.data, id);
  if (owned.response) return owned.response;
  if (!canInteract(owned.data.state)) {
    return fail("CONFLICT", blockedReason(owned.data.state, "POST"));
  }

  await prisma.post.update({ where: { id }, data: { deletedAt: new Date() } });
  return ok({ deleted: true, postId: id });
}
