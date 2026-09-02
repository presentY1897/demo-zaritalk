/**
 * `POST /api/reports/[id]/action` 테스트 (T4.2) — 블라인드·기각 + 처리자·시각 기록.
 */
import { prisma, ProfileType, ReportStatus } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import {
  addComment,
  addCommentReport,
  addPostReport,
  createAdminUser,
  createCommunityUser,
  createPost,
} from "@/features/community/testing";
import { loginAs } from "@/features/landlord/testing";
import { resetTestCookies } from "@/lib/auth/testing";
import { POST } from "./route";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
  process.env.ADMIN_API_SECRET = "test-admin-secret";
});

const act = (id: string, body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request(`http://localhost/api/reports/${id}/action`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

async function scene() {
  const author = await createCommunityUser("01011111111", "김임대", ProfileType.LANDLORD);
  const reporter = await createCommunityUser("01022222222", "박세입", ProfileType.TENANT);
  const admin = await createAdminUser();
  const post = await createPost(author.profile.id, { title: "광고 글" });
  const report = await addPostReport(post.id, reporter.profile.id);
  return { author, reporter, admin, post, report };
}

test("세션도 시크릿도 없으면 401", async () => {
  const { report } = await scene();
  expect((await act(report.id, { action: "BLIND" })).status).toBe(401);
});

test("비어드민은 403 — 신고한 본인도 못 처리한다", async () => {
  const { reporter, report } = await scene();
  await loginAs(reporter.user.id);
  expect((await act(report.id, { action: "BLIND" })).status).toBe(403);
});

test("없는 신고는 404, 모르는 액션은 400", async () => {
  const { admin, report } = await scene();
  await loginAs(admin.user.id);
  expect((await act("no-such-report", { action: "BLIND" })).status).toBe(404);
  expect((await act(report.id, { action: "DELETE_FOREVER" })).status).toBe(400);
});

test("블라인드 — 대상이 가려지고 처리자·시각이 기록된다", async () => {
  const { admin, post, report } = await scene();
  await loginAs(admin.user.id);

  const before = Date.now();
  const response = await act(report.id, { action: "BLIND" });
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body.report).toMatchObject({
    status: "ACTIONED",
    statusLabel: "블라인드",
    handledByName: "관리자",
  });
  expect(new Date(body.report.handledAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  expect(body.report.availableActions).toHaveLength(0);

  const row = await prisma.report.findUnique({ where: { id: report.id } });
  expect(row?.status).toBe(ReportStatus.ACTIONED);
  expect(row?.handledById).toBe(admin.user.id);
  expect(row?.handledAt).not.toBeNull();

  const blinded = await prisma.post.findUnique({ where: { id: post.id } });
  expect(blinded?.deletedAt).not.toBeNull();
});

test("블라인드는 같은 대상의 다른 대기 신고도 함께 종결한다", async () => {
  const { admin, post, report } = await scene();
  const third = await createCommunityUser("01033333333", "이중개", ProfileType.REALTOR);
  const sibling = await addPostReport(post.id, third.profile.id, { reason: "욕설·비방" });

  await loginAs(admin.user.id);
  const body = await (await act(report.id, { action: "BLIND" })).json();
  expect(body.alsoClosedReportIds).toEqual([sibling.id]);

  const row = await prisma.report.findUnique({ where: { id: sibling.id } });
  expect(row?.status).toBe(ReportStatus.ACTIONED);
  expect(row?.handledById).toBe(admin.user.id);
});

test("기각 — 대상은 그대로고, 다른 사람의 신고는 큐에 남는다", async () => {
  const { admin, post, report } = await scene();
  const third = await createCommunityUser("01033333333", "이중개", ProfileType.REALTOR);
  const sibling = await addPostReport(post.id, third.profile.id, { reason: "욕설·비방" });

  await loginAs(admin.user.id);
  const body = await (await act(report.id, { action: "DISMISS" })).json();
  expect(body.report.status).toBe("DISMISSED");
  expect(body.alsoClosedReportIds).toEqual([]);

  const target = await prisma.post.findUnique({ where: { id: post.id } });
  expect(target?.deletedAt).toBeNull();
  const remaining = await prisma.report.findUnique({ where: { id: sibling.id } });
  expect(remaining?.status).toBe(ReportStatus.OPEN);
});

test("댓글 신고도 블라인드된다", async () => {
  const { admin, author, reporter, post } = await scene();
  const comment = await addComment(post.id, author.profile.id, "욕설이 담긴 댓글");
  const report = await addCommentReport(comment.id, reporter.profile.id);

  await loginAs(admin.user.id);
  const body = await (await act(report.id, { action: "BLIND" })).json();
  expect(body.report.target).toMatchObject({ type: "COMMENT", body: "욕설이 담긴 댓글" });

  const row = await prisma.comment.findUnique({ where: { id: comment.id } });
  expect(row?.deletedAt).not.toBeNull();
});

test("이미 처리된 신고는 409", async () => {
  const { admin, report } = await scene();
  await loginAs(admin.user.id);
  expect((await act(report.id, { action: "BLIND" })).status).toBe(200);
  expect((await act(report.id, { action: "DISMISS" })).status).toBe(409);
});

test("서비스 시크릿으로 처리하면 DB 의 관리자 계정이 처리자로 기록된다", async () => {
  const { admin, report } = await scene();

  const response = await act(report.id, { action: "DISMISS" }, { "x-admin-secret": "test-admin-secret" });
  expect(response.status).toBe(200);

  const row = await prisma.report.findUnique({ where: { id: report.id } });
  expect(row?.handledById).toBe(admin.user.id);
});
