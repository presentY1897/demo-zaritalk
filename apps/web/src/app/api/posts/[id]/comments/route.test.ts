/**
 * `GET·POST /api/posts/[id]/comments` 테스트 (T4.1) — 댓글 목록·작성 + 블라인드 노출.
 */
import { prisma, ProfileType } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  addComment,
  blindComment,
  blindPost,
  createAdminUser,
  createCommunityUser,
  createPost,
} from "@/features/community/testing";
import { loginAs } from "@/features/landlord/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { GET, POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const list = (id: string) =>
  GET(new Request(`http://localhost/api/posts/${id}/comments`), context(id));
const write = (id: string, body: unknown) =>
  POST(
    new Request(`http://localhost/api/posts/${id}/comments`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    context(id),
  );

async function scene() {
  const author = await createCommunityUser("01011111111", "김임대", ProfileType.LANDLORD);
  const reader = await createCommunityUser("01022222222", "박세입", ProfileType.TENANT);
  const post = await createPost(author.profile.id);
  return { author, reader, post };
}

test("비로그인이면 401", async () => {
  const { post } = await scene();
  expect((await list(post.id)).status).toBe(401);
  expect((await write(post.id, { body: "댓글" })).status).toBe(401);
});

test("없는 글에는 댓글을 달 수 없다 — 404", async () => {
  const { reader } = await scene();
  await loginAs(reader.user.id);
  expect((await write("no-such-post", { body: "댓글" })).status).toBe(404);
});

test("댓글 작성 — 응답에 갱신된 스레드가 함께 온다", async () => {
  const { reader, post } = await scene();
  await loginAs(reader.user.id);

  const response = await write(post.id, { body: "저희 건물도 그래요" });
  expect(response.status).toBe(201);

  const body = await response.json();
  expect(body.comment).toMatchObject({
    body: "저희 건물도 그래요",
    author: { name: "박세입", type: "TENANT" },
    mine: true,
    canDelete: true,
  });
  expect(body.post.commentCount).toBe(1);
  expect(body.post.comments).toHaveLength(1);
});

test("빈 댓글·500자 초과는 400", async () => {
  const { reader, post } = await scene();
  await loginAs(reader.user.id);
  expect((await write(post.id, { body: "   " })).status).toBe(400);
  expect((await write(post.id, { body: "가".repeat(501) })).status).toBe(400);
});

test("댓글 목록은 오래된 순", async () => {
  const { author, reader, post } = await scene();
  const first = await addComment(post.id, reader.profile.id, "첫 댓글");
  const second = await addComment(post.id, author.profile.id, "둘째 댓글");

  await loginAs(reader.user.id);
  const body = await (await list(post.id)).json();
  expect(body.comments.map((comment: { id: string }) => comment.id)).toEqual([
    first.id,
    second.id,
  ]);
});

test("블라인드된 댓글은 자리를 남기고 본문만 가려진다 (작성자 본인은 원문을 본다)", async () => {
  const { author, reader, post } = await scene();
  const admin = await createAdminUser();
  const comment = await addComment(post.id, reader.profile.id, "욕설이 담긴 댓글");
  await blindComment(comment.id, author.profile.id, admin.user.id);

  await loginAs(author.user.id);
  const asOther = await (await list(post.id)).json();
  expect(asOther.comments).toHaveLength(1);
  expect(asOther.comments[0]).toMatchObject({
    moderation: "BLINDED",
    bodyHidden: true,
    canDelete: false,
  });
  expect(asOther.comments[0].body).not.toContain("욕설");

  resetTestCookies();
  await loginAs(reader.user.id);
  const asAuthor = await (await list(post.id)).json();
  expect(asAuthor.comments[0]).toMatchObject({
    body: "욕설이 담긴 댓글",
    bodyHidden: false,
    canDelete: false,
  });
});

test("작성자가 지운 댓글은 스레드에서 빠지고 댓글 수에도 안 잡힌다", async () => {
  const { author, reader, post } = await scene();
  const alive = await addComment(post.id, reader.profile.id, "살아 있는 댓글");
  const gone = await addComment(post.id, reader.profile.id, "지운 댓글");
  await prisma.comment.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });

  await loginAs(author.user.id);
  const body = await (await list(post.id)).json();
  expect(body.comments.map((comment: { id: string }) => comment.id)).toEqual([alive.id]);
});

test("블라인드된 글에는 댓글을 달 수 없다 — 409 (읽기는 된다)", async () => {
  const { author, reader, post } = await scene();
  const admin = await createAdminUser();
  await addComment(post.id, reader.profile.id, "이전 댓글");
  await blindPost(post.id, reader.profile.id, admin.user.id);

  await loginAs(reader.user.id);
  expect((await write(post.id, { body: "새 댓글" })).status).toBe(409);
  const body = await (await list(post.id)).json();
  expect(body.comments).toHaveLength(1);
});
