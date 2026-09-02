/**
 * `POST·DELETE /api/posts/[id]/like` 테스트 (T4.1).
 *
 * task 최소 요구인 **"좋아요 토글 멱등 · likeCount 일치"** 를 여기서 못 박는다.
 * 비정규화 컬럼(`Post.likeCount`)과 `PostLike` 행 수가 **모든 경로에서 같은지** 확인한다.
 */
import { prisma, ProfileType } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  blindPost,
  createAdminUser,
  createCommunityUser,
  createPost,
} from "@/features/community/testing";
import { loginAs } from "@/features/landlord/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { DELETE, POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const like = (id: string) =>
  POST(new Request(`http://localhost/api/posts/${id}/like`, { method: "POST" }), context(id));
const unlike = (id: string) =>
  DELETE(new Request(`http://localhost/api/posts/${id}/like`, { method: "DELETE" }), context(id));

/** 비정규화 컬럼과 실제 행 수가 같은지 — 모든 검증이 이걸 통과해야 한다 */
async function assertConsistent(postId: string, expected: number) {
  const [post, rows] = await Promise.all([
    prisma.post.findUnique({ where: { id: postId } }),
    prisma.postLike.count({ where: { postId } }),
  ]);
  expect(rows).toBe(expected);
  expect(post?.likeCount).toBe(expected);
}

async function scene() {
  const author = await createCommunityUser("01011111111", "김임대", ProfileType.LANDLORD);
  const reader = await createCommunityUser("01022222222", "박세입", ProfileType.TENANT);
  const post = await createPost(author.profile.id);
  return { author, reader, post };
}

test("비로그인이면 401", async () => {
  const { post } = await scene();
  expect((await like(post.id)).status).toBe(401);
  expect((await unlike(post.id)).status).toBe(401);
});

test("없는 글은 404", async () => {
  const { reader } = await scene();
  await loginAs(reader.user.id);
  expect((await like("no-such-post")).status).toBe(404);
});

test("같은 좋아요 요청이 여러 번 와도 카운트가 어긋나지 않는다 (멱등)", async () => {
  const { reader, post } = await scene();
  await loginAs(reader.user.id);

  const first = await (await like(post.id)).json();
  expect(first).toEqual({ liked: true, likeCount: 1 });
  await assertConsistent(post.id, 1);

  const second = await (await like(post.id)).json();
  expect(second).toEqual({ liked: true, likeCount: 1 });
  await assertConsistent(post.id, 1);
});

test("취소도 멱등이다 — 안 누른 상태에서 취소해도 0 이다", async () => {
  const { reader, post } = await scene();
  await loginAs(reader.user.id);

  expect(await (await unlike(post.id)).json()).toEqual({ liked: false, likeCount: 0 });
  await assertConsistent(post.id, 0);

  await like(post.id);
  expect(await (await unlike(post.id)).json()).toEqual({ liked: false, likeCount: 0 });
  expect(await (await unlike(post.id)).json()).toEqual({ liked: false, likeCount: 0 });
  await assertConsistent(post.id, 0);
});

test("여러 사람이 눌러도 행 수와 카운트가 같다", async () => {
  const { author, reader, post } = await scene();
  const third = await createCommunityUser("01033333333", "이중개", ProfileType.REALTOR);

  await loginAs(reader.user.id);
  await like(post.id);
  resetTestCookies();
  await loginAs(third.user.id);
  await like(post.id);
  resetTestCookies();
  await loginAs(author.user.id);
  const body = await (await like(post.id)).json();

  expect(body.likeCount).toBe(3);
  await assertConsistent(post.id, 3);
});

test("어긋난 likeCount 는 다음 토글에서 스스로 고쳐진다 (증감이 아니라 다시 센다)", async () => {
  const { reader, post } = await scene();
  await prisma.post.update({ where: { id: post.id }, data: { likeCount: 99 } });

  await loginAs(reader.user.id);
  const body = await (await like(post.id)).json();
  expect(body.likeCount).toBe(1);
  await assertConsistent(post.id, 1);
});

test("동시에 들어온 같은 요청도 카운트를 어긋내지 않는다", async () => {
  const { reader, post } = await scene();
  await loginAs(reader.user.id);

  await Promise.all([like(post.id), like(post.id), like(post.id)]);
  await assertConsistent(post.id, 1);
});

test("블라인드된 글에는 좋아요를 누를 수 없다 — 409", async () => {
  const { reader, post } = await scene();
  const admin = await createAdminUser();
  await blindPost(post.id, reader.profile.id, admin.user.id);

  await loginAs(reader.user.id);
  expect((await like(post.id)).status).toBe(409);
  expect((await unlike(post.id)).status).toBe(409);
});
