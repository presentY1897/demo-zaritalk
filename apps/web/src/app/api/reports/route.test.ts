/**
 * `POST /api/reports`(신고 접수) · `GET /api/reports`(어드민 큐) 테스트 (T4.2).
 *
 * task 최소 요구인 **"중복 신고 처리"** 와 어드민 인증(비어드민 403·서비스 시크릿)을 못 박는다.
 */
import { prisma, ProfileType, ReportStatus } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  addComment,
  addPostReport,
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
  process.env.ADMIN_API_SECRET = "test-admin-secret";
});

const report = (body: unknown) =>
  POST(new Request("http://localhost/api/reports", { method: "POST", body: JSON.stringify(body) }));
const queue = (query = "", headers: Record<string, string> = {}) =>
  GET(new Request(`http://localhost/api/reports${query}`, { headers }));

async function scene() {
  const author = await createCommunityUser("01011111111", "김임대", ProfileType.LANDLORD);
  const reporter = await createCommunityUser("01022222222", "박세입", ProfileType.TENANT);
  const post = await createPost(author.profile.id, { title: "광고 글", body: "010-0000-0000" });
  return { author, reporter, post };
}

// ── 접수 ────────────────────────────────────────────────────────────────────

test("비로그인이면 401", async () => {
  const { post } = await scene();
  expect(
    (await report({ targetType: "POST", targetId: post.id, reason: "광고·홍보성 글" })).status,
  ).toBe(401);
});

test("신고 사유는 필수다 — 없거나 공백뿐이면 400", async () => {
  const { reporter, post } = await scene();
  await loginAs(reporter.user.id);

  expect((await report({ targetType: "POST", targetId: post.id })).status).toBe(400);
  expect((await report({ targetType: "POST", targetId: post.id, reason: "   " })).status).toBe(400);
  expect((await report({ targetType: "POST", targetId: post.id, reason: "가" })).status).toBe(400);
});

test("없는 대상·모르는 유형은 404·400", async () => {
  const { reporter } = await scene();
  await loginAs(reporter.user.id);
  expect(
    (await report({ targetType: "POST", targetId: "no-such", reason: "광고·홍보성 글" })).status,
  ).toBe(404);
  expect(
    (await report({ targetType: "PROFILE", targetId: "x", reason: "광고·홍보성 글" })).status,
  ).toBe(400);
});

test("내 글은 신고할 수 없다 — 403", async () => {
  const { author, post } = await scene();
  await loginAs(author.user.id);
  expect(
    (await report({ targetType: "POST", targetId: post.id, reason: "광고·홍보성 글" })).status,
  ).toBe(403);
});

test("신고 접수 — 201 로 대기 상태의 신고가 생긴다", async () => {
  const { reporter, post } = await scene();
  await loginAs(reporter.user.id);

  const response = await report({
    targetType: "POST",
    targetId: post.id,
    reason: "광고·홍보성 글",
  });
  expect(response.status).toBe(201);

  const body = await response.json();
  expect(body).toMatchObject({
    duplicated: false,
    report: { targetType: "POST", targetId: post.id, status: "OPEN", reason: "광고·홍보성 글" },
  });
  expect(await prisma.report.count()).toBe(1);
});

test("댓글도 신고할 수 있다", async () => {
  const { author, reporter, post } = await scene();
  const comment = await addComment(post.id, author.profile.id, "욕설이 담긴 댓글");
  await loginAs(reporter.user.id);

  const body = await (
    await report({ targetType: "COMMENT", targetId: comment.id, reason: "욕설·비방" })
  ).json();
  expect(body.report).toMatchObject({ targetType: "COMMENT", targetId: comment.id });
});

test("같은 사람이 같은 대상을 또 신고하면 새 행 없이 기존 건을 돌려준다", async () => {
  const { reporter, post } = await scene();
  await loginAs(reporter.user.id);

  const first = await (
    await report({ targetType: "POST", targetId: post.id, reason: "광고·홍보성 글" })
  ).json();

  const again = await report({ targetType: "POST", targetId: post.id, reason: "또 신고" });
  expect(again.status).toBe(200);
  const body = await again.json();
  expect(body.duplicated).toBe(true);
  expect(body.report.id).toBe(first.report.id);
  expect(body.report.reason).toBe("광고·홍보성 글"); // 처음 사유가 남는다
  expect(await prisma.report.count()).toBe(1);
});

test("다른 사람이 신고하면 큐에 나란히 쌓인다 (몇 명이 신고했는지가 판단 재료다)", async () => {
  const { reporter, post } = await scene();
  const third = await createCommunityUser("01033333333", "이중개", ProfileType.REALTOR);

  await loginAs(reporter.user.id);
  await report({ targetType: "POST", targetId: post.id, reason: "광고·홍보성 글" });
  resetTestCookies();
  await loginAs(third.user.id);
  const response = await report({ targetType: "POST", targetId: post.id, reason: "욕설·비방" });

  expect(response.status).toBe(201);
  expect(await prisma.report.count()).toBe(2);
});

test("내 지난 신고가 이미 처리됐으면 다시 신고할 수 있다 (새 사건)", async () => {
  const { author, reporter, post } = await scene();
  const admin = await createAdminUser();
  await addPostReport(post.id, reporter.profile.id, {
    status: ReportStatus.DISMISSED,
    handledById: admin.user.id,
    handledAt: new Date(),
  });

  await loginAs(reporter.user.id);
  const response = await report({ targetType: "POST", targetId: post.id, reason: "또 광고합니다" });
  expect(response.status).toBe(201);
  expect(await prisma.report.count()).toBe(2);
});

test("이미 블라인드된 글은 신고할 수 없다 — 409", async () => {
  const { reporter, post } = await scene();
  const admin = await createAdminUser();
  const other = await createCommunityUser("01033333333", "이중개", ProfileType.REALTOR);
  await blindPost(post.id, other.profile.id, admin.user.id);

  await loginAs(reporter.user.id);
  expect(
    (await report({ targetType: "POST", targetId: post.id, reason: "광고·홍보성 글" })).status,
  ).toBe(409);
});

// ── 어드민 큐 ────────────────────────────────────────────────────────────────

test("세션도 시크릿도 없으면 401", async () => {
  expect((await queue()).status).toBe(401);
});

test("비어드민 세션은 403 (신고한 본인이라도 큐는 못 본다)", async () => {
  const { reporter, post } = await scene();
  await addPostReport(post.id, reporter.profile.id);
  await loginAs(reporter.user.id);
  expect((await queue()).status).toBe(403);
});

test("어드민 세션 — 대기 신고와 대상 미리보기가 온다", async () => {
  const { author, reporter, post } = await scene();
  const admin = await createAdminUser();
  await addPostReport(post.id, reporter.profile.id, { reason: "광고·홍보성 글" });

  await loginAs(admin.user.id);
  const response = await queue();
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body.reports).toHaveLength(1);
  expect(body.reports[0]).toMatchObject({
    status: "OPEN",
    statusLabel: "대기",
    reason: "광고·홍보성 글",
    reporterName: "박세입",
    reporterProfileType: "TENANT",
    handledByName: null,
    openSiblingCount: 0,
  });
  // 대상 미리보기 — 어드민은 원문을 본다
  expect(body.reports[0].target).toMatchObject({
    type: "POST",
    postTitle: "광고 글",
    body: "010-0000-0000",
    authorName: "김임대",
    authorProfileType: "LANDLORD",
    regionName: "서울 성동구",
    moderation: "VISIBLE",
  });
  expect(body.reports[0].availableActions.map((action: { action: string }) => action.action)).toEqual(
    ["BLIND", "DISMISS"],
  );
  expect(body.counts).toEqual({ OPEN: 1, ACTIONED: 0, DISMISSED: 0 });
});

test("상태 필터 — 처리된 건만 골라 본다. 모르는 값은 버린다", async () => {
  const { reporter, post } = await scene();
  const admin = await createAdminUser();
  await addPostReport(post.id, reporter.profile.id);
  await addPostReport(post.id, admin.profile.id, {
    status: ReportStatus.DISMISSED,
    handledById: admin.user.id,
    handledAt: new Date(),
  });

  await loginAs(admin.user.id);
  const dismissed = await (await queue("?status=DISMISSED")).json();
  expect(dismissed.reports).toHaveLength(1);
  expect(dismissed.reports[0].status).toBe("DISMISSED");
  expect(dismissed.reports[0].availableActions).toHaveLength(0);

  const fallback = await (await queue("?status=NOPE")).json();
  expect(fallback.reports.map((row: { status: string }) => row.status)).toEqual(["OPEN"]);
});

test("같은 대상의 다른 대기 신고 수가 함께 온다", async () => {
  const { reporter, post } = await scene();
  const admin = await createAdminUser();
  const third = await createCommunityUser("01033333333", "이중개", ProfileType.REALTOR);
  await addPostReport(post.id, reporter.profile.id);
  await addPostReport(post.id, third.profile.id);

  await loginAs(admin.user.id);
  const body = await (await queue()).json();
  expect(body.reports).toHaveLength(2);
  expect(body.reports.map((row: { openSiblingCount: number }) => row.openSiblingCount)).toEqual([
    1, 1,
  ]);
});

test("서비스 시크릿(어드민 앱 서버 액션)으로도 큐를 읽는다", async () => {
  const { reporter, post } = await scene();
  await createAdminUser();
  await addPostReport(post.id, reporter.profile.id);

  const response = await queue("", { "x-admin-secret": "test-admin-secret" });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.reports).toHaveLength(1);
});

test("시크릿이 틀리거나 isAdmin 계정이 없으면 403", async () => {
  await scene();
  expect((await queue("", { "x-admin-secret": "wrong" })).status).toBe(403);
  // 시크릿은 맞지만 DB 에 관리자 계정이 없다
  expect((await queue("", { "x-admin-secret": "test-admin-secret" })).status).toBe(403);
});
