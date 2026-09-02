/**
 * `POST·DELETE /api/posts/[id]/like` — 좋아요 토글 (T4.1).
 *
 * `POST` 는 "좋아요 상태로 만든다", `DELETE` 는 "안 누른 상태로 만든다" 다.
 * **토글이 아니라 목표 상태를 지정하는 두 동사**라 같은 요청이 몇 번 와도 결과가 같다(멱등).
 * 화면의 하트는 현재 상태를 보고 둘 중 하나를 부른다 — 더블클릭·재전송으로 카운트가 어긋나지 않는다.
 *
 * ## `likeCount` 정합성을 어떻게 보장하나
 *
 * `Post.likeCount` 는 `PostLike` 행 수의 비정규화 사본이라 둘이 어긋나면 인기 탭 정렬이 거짓말을 한다.
 * 그래서 증감(`increment: 1`)이 아니라 **한 트랜잭션 안에서**
 *
 * 1. 글 행을 `SELECT … FOR UPDATE` 로 잠그고 (같은 글의 동시 요청을 줄 세운다)
 * 2. `PostLike` 를 만들거나(`skipDuplicates`) 지우고
 * 3. **남은 행을 다시 세어** `likeCount` 에 **덮어쓴다**
 *
 * 셋을 함께 한다. 증감식은 중복 요청·경합에서 한 번 더 더해질 수 있지만, 다시 세어 덮어쓰면
 * `likeCount` 는 **언제나 `PostLike` 행 수와 같다** — 어긋난 값이 있어도 다음 토글에서 스스로 고쳐진다.
 * `updatedAt` 을 건드리지 않으려고 마지막 갱신은 raw UPDATE 다.
 *
 * ## 좋아요의 주인은 **계정**이다
 *
 * 누를 때는 활성 프로필로 행을 만들지만(`@@unique([postId, profileId])`), 이미 **내 다른 프로필로**
 * 눌러 뒀으면 새로 만들지 않고, 취소는 내 프로필 전체의 행을 지운다. 목록의 「좋아요 눌렀음」 표시도
 * 계정 단위라 프로필을 전환해도 하트가 흔들리지 않는다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 글 · 작성자가 지운 글 | 404 `NOT_FOUND` |
 * | **블라인드된 글** | 409 `CONFLICT` |
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
import { prisma } from "@zari/db";
import { blockedReason, canInteract } from "@/features/community/moderation";
import {
  requireCommunityProfile,
  requireVisiblePost,
  type CommunitySession,
} from "@/features/community/ownership";
import { fail, ok } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

/**
 * 목표 상태로 맞춘다. 반환값은 **다시 센** 좋아요 수라 응답이 곧 진실이다.
 */
async function setLiked(
  postId: string,
  session: CommunitySession,
  liked: boolean,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    // 같은 글의 동시 요청을 줄 세운다 — 세는 동안 행이 늘거나 줄지 않게
    await tx.$queryRaw`SELECT id FROM "Post" WHERE id = ${postId} FOR UPDATE`;

    if (liked) {
      const existing = await tx.postLike.count({
        where: { postId, profileId: { in: session.profileIds } },
      });
      if (existing === 0) {
        await tx.postLike.createMany({
          data: [{ postId, profileId: session.profile.id }],
          skipDuplicates: true,
        });
      }
    } else {
      await tx.postLike.deleteMany({ where: { postId, profileId: { in: session.profileIds } } });
    }

    const likeCount = await tx.postLike.count({ where: { postId } });
    await tx.$executeRaw`UPDATE "Post" SET "likeCount" = ${likeCount} WHERE id = ${postId}`;
    return likeCount;
    // 같은 글에 요청이 몰리면 행 잠금 대기가 길어질 수 있어 기본 5초보다 넉넉히 준다
  }, { timeout: 15_000, maxWait: 10_000 });
}

async function handle(id: string, liked: boolean): Promise<Response> {
  const session = await requireCommunityProfile();
  if (session.response) return session.response;

  const visible = await requireVisiblePost(id);
  if (visible.response) return visible.response;
  if (!canInteract(visible.data.state)) {
    return fail("CONFLICT", blockedReason(visible.data.state, "POST"));
  }

  const likeCount = await setLiked(id, session.data, liked);
  return ok({ liked, likeCount });
}

export async function POST(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return handle(id, true);
}

export async function DELETE(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return handle(id, false);
}
