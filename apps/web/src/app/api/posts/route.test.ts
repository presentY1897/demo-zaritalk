/**
 * `GET·POST /api/posts` 테스트 (T4.1) — 목록(지역·정렬·**커서 경계**)·작성.
 *
 * task 최소 요구인 **"커서 페이지네이션 경계·중복 없음"** 을 여기서 못 박는다.
 * 정렬 키가 전부 동점인 상황(같은 시각·같은 좋아요 수)을 일부러 만들어, 보조 키(`id`)가 없으면
 * 반드시 깨질 자리를 확인한다.
 */
import { prisma, ProfileType } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  addLike,
  createAdminUser,
  createCommunityUser,
  createPost,
  blindPost,
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

const SEONGDONG = "11200";
const GANGNAM = "11680";
const SAME_TIME = new Date("2026-09-01T12:00:00.000Z");

const list = (query = "") => GET(new Request(`http://localhost/api/posts${query}`));
const write = (body: unknown) =>
  POST(new Request("http://localhost/api/posts", { method: "POST", body: JSON.stringify(body) }));

/** 커서를 따라 끝까지 읽어 id 를 순서대로 모은다 */
async function readAll(sort: "latest" | "popular", limit: number): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page += 1) {
    const query = new URLSearchParams({ sort, limit: String(limit), region: SEONGDONG });
    if (cursor) query.set("cursor", cursor);
    const response = await list(`?${query.toString()}`);
    expect(response.status).toBe(200);
    const body = await response.json();
    ids.push(...body.posts.map((post: { id: string }) => post.id));
    cursor = body.nextCursor;
    if (!cursor) return ids;
  }
  throw new Error("커서가 끝나지 않는다");
}

// ── 인증 ────────────────────────────────────────────────────────────────────

test("비로그인이면 401", async () => {
  expect((await list()).status).toBe(401);
  expect((await write({ regionCode: SEONGDONG, title: "제목", body: "내용입니다" })).status).toBe(
    401,
  );
});

test("프로필이 없는 계정(온보딩 전)은 403", async () => {
  const user = await prisma.user.create({ data: { phone: "01055555555", name: "무프로필" } });
  await loginAs(user.id);
  expect((await list()).status).toBe(403);
});

// ── 목록 ────────────────────────────────────────────────────────────────────

test("지역 보드는 그 지역 글만 보여 준다", async () => {
  const author = await createCommunityUser("01011111111", "김임대", ProfileType.LANDLORD);
  await createPost(author.profile.id, { regionCode: SEONGDONG, title: "성동 글" });
  await createPost(author.profile.id, { regionCode: GANGNAM, title: "강남 글" });

  await loginAs(author.user.id);
  const body = await (await list(`?region=${SEONGDONG}`)).json();
  expect(body.posts.map((post: { title: string }) => post.title)).toEqual(["성동 글"]);
  expect(body.region).toEqual({ code: SEONGDONG, name: "성동구", label: "서울 성동구" });
});

test("최신 탭은 최근 글이 위, 인기 탭은 좋아요가 많은 글이 위", async () => {
  const author = await createCommunityUser("01011111111", "김임대", ProfileType.LANDLORD);
  const old = await createPost(author.profile.id, {
    title: "오래된 인기글",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    likeCount: 9,
  });
  const fresh = await createPost(author.profile.id, {
    title: "새 글",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
  });

  await loginAs(author.user.id);
  const latest = await (await list("?sort=latest")).json();
  expect(latest.posts.map((post: { id: string }) => post.id)).toEqual([fresh.id, old.id]);

  const popular = await (await list("?sort=popular")).json();
  expect(popular.posts.map((post: { id: string }) => post.id)).toEqual([old.id, fresh.id]);
});

test("글쓴이 프로필 유형이 응답에 실린다 (목록 배지)", async () => {
  const master = await createCommunityUser("01044444444", "최기사", ProfileType.MASTER);
  await createPost(master.profile.id);

  await loginAs(master.user.id);
  const body = await (await list()).json();
  expect(body.posts[0].author).toMatchObject({ name: "최기사", type: "MASTER" });
  expect(body.posts[0].mine).toBe(true);
});

// ── 커서 경계 ────────────────────────────────────────────────────────────────

test("최신 탭 — createdAt 이 전부 같아도 경계에서 중복·누락이 없다", async () => {
  const author = await createCommunityUser("01011111111", "김임대", ProfileType.LANDLORD);
  const posts = await Promise.all(
    Array.from({ length: 7 }, (_, index) =>
      createPost(author.profile.id, { title: `글 ${index}`, createdAt: SAME_TIME }),
    ),
  );

  await loginAs(author.user.id);
  const ids = await readAll("latest", 2);

  expect(new Set(ids).size).toBe(ids.length); // 중복 없음
  expect(ids.sort()).toEqual(posts.map((post) => post.id).sort()); // 누락 없음
});

test("인기 탭 — likeCount·createdAt 이 전부 동점이어도 경계에서 중복·누락이 없다", async () => {
  const author = await createCommunityUser("01011111111", "김임대", ProfileType.LANDLORD);
  const posts = await Promise.all(
    Array.from({ length: 7 }, (_, index) =>
      createPost(author.profile.id, {
        title: `동점 ${index}`,
        createdAt: SAME_TIME,
        likeCount: 5,
      }),
    ),
  );

  await loginAs(author.user.id);
  const ids = await readAll("popular", 3);

  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.sort()).toEqual(posts.map((post) => post.id).sort());
});

test("읽는 도중 새 글이 올라와도 다음 페이지가 밀리지 않는다 (offset 이었다면 한 줄이 중복된다)", async () => {
  const author = await createCommunityUser("01011111111", "김임대", ProfileType.LANDLORD);
  const older = await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      createPost(author.profile.id, {
        title: `기존 ${index}`,
        createdAt: new Date(SAME_TIME.getTime() + index * 1000),
      }),
    ),
  );
  await loginAs(author.user.id);

  const first = await (await list("?sort=latest&limit=2")).json();
  expect(first.posts).toHaveLength(2);

  // 첫 페이지를 읽은 뒤 맨 위에 글이 하나 끼어든다
  await createPost(author.profile.id, {
    title: "끼어든 글",
    createdAt: new Date(SAME_TIME.getTime() + 60_000),
  });

  const second = await (
    await list(`?sort=latest&limit=2&cursor=${encodeURIComponent(first.nextCursor)}`)
  ).json();
  const seen = [...first.posts, ...second.posts].map((post: { id: string }) => post.id);

  expect(new Set(seen).size).toBe(4);
  expect(seen.sort()).toEqual(older.map((post) => post.id).sort());
});

test("다음 페이지가 없으면 nextCursor 는 null", async () => {
  const author = await createCommunityUser("01011111111", "김임대", ProfileType.LANDLORD);
  await createPost(author.profile.id);
  await loginAs(author.user.id);

  const body = await (await list("?limit=5")).json();
  expect(body.posts).toHaveLength(1);
  expect(body.nextCursor).toBeNull();
});

test("다른 탭의 커서·깨진 커서는 400", async () => {
  const author = await createCommunityUser("01011111111", "김임대", ProfileType.LANDLORD);
  await Promise.all([createPost(author.profile.id), createPost(author.profile.id)]);
  await loginAs(author.user.id);

  const first = await (await list("?sort=latest&limit=1")).json();
  expect(first.nextCursor).toBeTruthy();

  const crossTab = await list(
    `?sort=popular&limit=1&cursor=${encodeURIComponent(first.nextCursor)}`,
  );
  expect(crossTab.status).toBe(400);

  expect((await list("?cursor=%21%21broken%21%21")).status).toBe(400);
});

test("모르는 지역·정렬은 400", async () => {
  const author = await createCommunityUser("01011111111", "김임대", ProfileType.LANDLORD);
  await loginAs(author.user.id);
  expect((await list("?region=99999")).status).toBe(400);
  expect((await list("?sort=hottest")).status).toBe(400);
  expect((await list("?limit=999")).status).toBe(400);
});

// ── 블라인드 노출 ─────────────────────────────────────────────────────────────

test("블라인드된 글은 목록에 남지만 제3자에게는 제목·본문이 가려진다", async () => {
  const author = await createCommunityUser("01011111111", "김임대", ProfileType.LANDLORD);
  const reporter = await createCommunityUser("01022222222", "박세입", ProfileType.TENANT);
  const admin = await createAdminUser();
  const post = await createPost(author.profile.id, { title: "광고 글", body: "010-0000-0000" });
  await blindPost(post.id, reporter.profile.id, admin.user.id);

  await loginAs(reporter.user.id);
  const body = await (await list()).json();
  expect(body.posts).toHaveLength(1);
  expect(body.posts[0]).toMatchObject({
    moderation: "BLINDED",
    bodyHidden: true,
    title: "블라인드 처리된 글입니다",
  });
  expect(body.posts[0].body).not.toContain("010-0000-0000");
});

test("블라인드된 글의 원문은 작성자 본인과 어드민에게만 보인다", async () => {
  const author = await createCommunityUser("01011111111", "김임대", ProfileType.LANDLORD);
  const reporter = await createCommunityUser("01022222222", "박세입", ProfileType.TENANT);
  const admin = await createAdminUser();
  const post = await createPost(author.profile.id, { title: "광고 글" });
  await blindPost(post.id, reporter.profile.id, admin.user.id);

  await loginAs(author.user.id);
  const mine = await (await list()).json();
  expect(mine.posts[0]).toMatchObject({ title: "광고 글", bodyHidden: false, moderation: "BLINDED" });

  resetTestCookies();
  await loginAs(admin.user.id);
  const asAdmin = await (await list()).json();
  expect(asAdmin.posts[0]).toMatchObject({ title: "광고 글", bodyHidden: false });
});

test("작성자가 지운 글은 목록에서 아예 빠진다", async () => {
  const author = await createCommunityUser("01011111111", "김임대", ProfileType.LANDLORD);
  await createPost(author.profile.id, { title: "살아 있는 글" });
  await createPost(author.profile.id, { title: "지운 글", deletedAt: new Date() });

  await loginAs(author.user.id);
  const body = await (await list()).json();
  expect(body.posts.map((post: { title: string }) => post.title)).toEqual(["살아 있는 글"]);
});

test("좋아요·댓글 수와 내가 눌렀는지가 목록에 실린다", async () => {
  const author = await createCommunityUser("01011111111", "김임대", ProfileType.LANDLORD);
  const reader = await createCommunityUser("01022222222", "박세입", ProfileType.TENANT);
  const post = await createPost(author.profile.id);
  await addLike(post.id, reader.profile.id);
  await prisma.comment.create({
    data: { postId: post.id, authorProfileId: reader.profile.id, body: "저도요" },
  });

  await loginAs(reader.user.id);
  const body = await (await list()).json();
  expect(body.posts[0]).toMatchObject({ likeCount: 1, commentCount: 1, liked: true, mine: false });
});

// ── 작성 ────────────────────────────────────────────────────────────────────

test("글 작성 — 활성 프로필이 글쓴이가 되고 지역 표시명이 함께 저장된다", async () => {
  const author = await createCommunityUser("01033333333", "이중개", ProfileType.REALTOR);
  await loginAs(author.user.id);

  const response = await write({
    regionCode: GANGNAM,
    title: "강남 원룸 시세 어떤가요",
    body: "요즘 강남 원룸 월세가 많이 올랐나요?",
  });
  expect(response.status).toBe(201);

  const body = await response.json();
  expect(body.post).toMatchObject({
    regionCode: GANGNAM,
    regionName: "서울 강남구",
    author: { name: "이중개", type: "REALTOR" },
    likeCount: 0,
    commentCount: 0,
    canEdit: true,
    canInteract: true,
  });

  const saved = await prisma.post.findUnique({ where: { id: body.post.id } });
  expect(saved?.authorProfileId).toBe(author.profile.id);
});

test("제목·본문·지역 형식 오류는 400", async () => {
  const author = await createCommunityUser("01011111111", "김임대", ProfileType.LANDLORD);
  await loginAs(author.user.id);

  expect((await write({ regionCode: SEONGDONG, title: "짧", body: "내용입니다" })).status).toBe(400);
  expect((await write({ regionCode: SEONGDONG, title: "제목입니다", body: "짧다" })).status).toBe(
    400,
  );
  expect((await write({ regionCode: "99999", title: "제목입니다", body: "내용입니다" })).status).toBe(
    400,
  );
});
