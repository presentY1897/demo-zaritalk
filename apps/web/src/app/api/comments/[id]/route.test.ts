/**
 * `DELETE /api/comments/[id]` 테스트 (T4.1) — 내 댓글만, 소프트 삭제.
 */
import { prisma, ProfileType } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  addComment,
  blindComment,
  createAdminUser,
  createCommunityUser,
  createPost,
} from "@/features/community/testing";
import { loginAs } from "@/features/landlord/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { DELETE } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const remove = (id: string) =>
  DELETE(new Request(`http://localhost/api/comments/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

async function scene() {
  const author = await createCommunityUser("01011111111", "김임대", ProfileType.LANDLORD);
  const reader = await createCommunityUser("01022222222", "박세입", ProfileType.TENANT);
  const post = await createPost(author.profile.id);
  const comment = await addComment(post.id, reader.profile.id, "제 댓글입니다");
  return { author, reader, post, comment };
}

test("비로그인이면 401", async () => {
  const { comment } = await scene();
  expect((await remove(comment.id)).status).toBe(401);
});

test("없는 댓글은 404", async () => {
  const { reader } = await scene();
  await loginAs(reader.user.id);
  expect((await remove("no-such-comment")).status).toBe(404);
});

test("남의 댓글은 지울 수 없다 — 403 (글쓴이라도 안 된다)", async () => {
  const { author, comment } = await scene();
  await loginAs(author.user.id);
  expect((await remove(comment.id)).status).toBe(403);
});

test("내 댓글 삭제 — 스레드에서 사라지고 두 번째 요청은 404", async () => {
  const { reader, comment } = await scene();
  await loginAs(reader.user.id);

  const response = await remove(comment.id);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.post.comments).toHaveLength(0);
  expect(body.post.commentCount).toBe(0);

  const row = await prisma.comment.findUnique({ where: { id: comment.id } });
  expect(row?.deletedAt).not.toBeNull();
  expect((await remove(comment.id)).status).toBe(404);
});

test("블라인드된 댓글은 작성자도 지울 수 없다 — 409", async () => {
  const { author, reader, comment } = await scene();
  const admin = await createAdminUser();
  await blindComment(comment.id, author.profile.id, admin.user.id);

  await loginAs(reader.user.id);
  expect((await remove(comment.id)).status).toBe(409);
});
