/**
 * `GET·PATCH·DELETE /api/posts/[id]` 테스트 (T4.1) — 상세(조회수)·수정·삭제.
 * 블라인드 노출 규칙(본문 가림·참여 차단)도 여기서 확인한다.
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
import { DELETE, GET, PATCH } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const read = (id: string) => GET(new Request(`http://localhost/api/posts/${id}`), context(id));
const patch = (id: string, body: unknown) =>
  PATCH(
    new Request(`http://localhost/api/posts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    context(id),
  );
const remove = (id: string) =>
  DELETE(new Request(`http://localhost/api/posts/${id}`, { method: "DELETE" }), context(id));

async function scene() {
  const author = await createCommunityUser("01011111111", "김임대", ProfileType.LANDLORD);
  const other = await createCommunityUser("01022222222", "박세입", ProfileType.TENANT);
  const post = await createPost(author.profile.id, { title: "원문 제목", body: "원문 본문입니다" });
  return { author, other, post };
}

test("비로그인이면 401", async () => {
  const { post } = await scene();
  expect((await read(post.id)).status).toBe(401);
  expect((await patch(post.id, { title: "바꾼 제목" })).status).toBe(401);
  expect((await remove(post.id)).status).toBe(401);
});

test("없는 글은 404", async () => {
  const { author } = await scene();
  await loginAs(author.user.id);
  expect((await read("no-such-post")).status).toBe(404);
});

test("조회할 때마다 viewCount 가 1씩 오른다 (updatedAt 은 그대로)", async () => {
  const { author, post } = await scene();
  await loginAs(author.user.id);

  const first = await (await read(post.id)).json();
  expect(first.post.viewCount).toBe(1);
  const second = await (await read(post.id)).json();
  expect(second.post.viewCount).toBe(2);

  const row = await prisma.post.findUnique({ where: { id: post.id } });
  expect(row?.viewCount).toBe(2);
  expect(row?.updatedAt.getTime()).toBe(post.updatedAt.getTime());
});

test("블라인드된 글은 200 이지만 제3자에게는 본문이 가려지고 참여가 막힌다", async () => {
  const { author, other, post } = await scene();
  const admin = await createAdminUser();
  await blindPost(post.id, other.profile.id, admin.user.id);

  await loginAs(other.user.id);
  const body = await (await read(post.id)).json();
  expect(body.post).toMatchObject({
    moderation: "BLINDED",
    bodyHidden: true,
    canInteract: false,
    canEdit: false,
  });
  expect(body.post.body).not.toContain("원문 본문");
});

test("블라인드된 글도 작성자 본인에게는 원문이 보인다 (수정은 막힌다)", async () => {
  const { author, other, post } = await scene();
  const admin = await createAdminUser();
  await blindPost(post.id, other.profile.id, admin.user.id);

  await loginAs(author.user.id);
  const body = await (await read(post.id)).json();
  expect(body.post).toMatchObject({ body: "원문 본문입니다", bodyHidden: false, canEdit: false });

  expect((await patch(post.id, { title: "다시 써 볼게요" })).status).toBe(409);
  expect((await remove(post.id)).status).toBe(409);
});

test("남의 글은 수정·삭제할 수 없다 — 403", async () => {
  const { other, post } = await scene();
  await loginAs(other.user.id);
  expect((await patch(post.id, { title: "남의 글 수정" })).status).toBe(403);
  expect((await remove(post.id)).status).toBe(403);
});

test("내 글 수정 — 보낸 필드만 바뀐다", async () => {
  const { author, post } = await scene();
  await loginAs(author.user.id);

  const body = await (await patch(post.id, { title: "고친 제목" })).json();
  expect(body.post).toMatchObject({ title: "고친 제목", body: "원문 본문입니다" });

  const moved = await (await patch(post.id, { regionCode: "11680" })).json();
  expect(moved.post).toMatchObject({ regionCode: "11680", regionName: "서울 강남구" });
});

test("빈 수정 요청·형식 오류는 400", async () => {
  const { author, post } = await scene();
  await loginAs(author.user.id);
  expect((await patch(post.id, {})).status).toBe(400);
  expect((await patch(post.id, { title: "짧" })).status).toBe(400);
});

test("내 글 삭제 — 소프트 삭제 뒤에는 404 로 사라진다", async () => {
  const { author, post } = await scene();
  await loginAs(author.user.id);

  const response = await remove(post.id);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ deleted: true, postId: post.id });

  const row = await prisma.post.findUnique({ where: { id: post.id } });
  expect(row?.deletedAt).not.toBeNull();
  expect((await read(post.id)).status).toBe(404);
  expect((await remove(post.id)).status).toBe(404);
});
