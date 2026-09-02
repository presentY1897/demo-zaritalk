import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { queryTestDb } from "./db";

/**
 * T4.1·T4.2 통합(E2E) — **커뮤니티 보드 + 신고·모더레이션**.
 *
 * 두 task 문서가 요구한 여정 그대로다:
 *
 * - E2E① 글 작성 → **다른 계정**이 좋아요·댓글 → **인기 탭 반영**
 * - E2E② 신고 → 어드민 블라인드 → **일반 사용자 화면에서 본문 숨김**
 *
 * ## 어드민 화면을 브라우저로 몰지 않은 이유 (T2.5 와 같은 판단)
 *
 * 어드민은 **별도 Next 앱(포트 3001)** 이고 `playwright.config.ts` 의 `webServer` 는 web 앱
 * 하나만 띄운다 — 그 설정 파일은 이 task 소유가 아니라 손대지 않았다. 게다가 신고 큐 화면은
 * 규칙을 하나도 들고 있지 않다(버튼은 API 가 준 `availableActions` 를 그대로 그린다).
 * 즉 **위험은 전부 web API 쪽에 있으므로** 사용자 여정은 화면으로, 처리는 web API 로 친다.
 * 어드민 화면 렌더링은 `pnpm build` 와 타입체크가 지킨다.
 *
 * 처리 요청은 **어드민 세션 쿠키**로 보낸다(시크릿 헤더가 아니라). 시드의 관리자 계정
 * (`isAdmin: true`)에 세션 한 줄을 직접 만들어 쓰므로, 실제로 검증되는 것은
 * "`User.isAdmin` 기반 판정" 이라는 본선 경로다. 시크릿 경로는 단위 테스트가 따로 지킨다.
 * 끝나면 그 세션을 지운다.
 *
 * 시드에는 커뮤니티 글이 없다 — **화면에서 직접 쓰며 시작한다**
 * (시드: 김임대 01011111111 · 박세입 01022222222 · 관리자 01000000000).
 */

const FIRST_TITLE = "관리비가 갑자기 두 배가 됐어요";
const SECOND_TITLE = "행당동 분리수거 요일 아시는 분";
const AD_TITLE = "초특급 대출 상담 받으세요";
const AD_BODY = "지금 바로 010-0000-0000 으로 전화 주세요. 누구나 당일 승인.";

async function loginAsLandlord(page: Page) {
  await page.goto("/login");
  await page.getByTestId("demo-login-landlord").click();
  await expect(page).toHaveURL("/landlord");
}

async function loginAsTenant(page: Page) {
  await page.goto("/login");
  await page.getByTestId("demo-login-tenant").click();
  await expect(page).toHaveURL("/tenant");
}

/** 글쓰기 화면에서 한 편 쓰고, 만들어진 글의 id 를 돌려준다 */
async function writePost(page: Page, title: string, body: string): Promise<string> {
  await page.goto("/community");
  await page.getByTestId("community-write-link").click();
  await expect(page).toHaveURL(/\/community\/write/);

  await page.getByTestId("community-write-title").fill(title);
  await page.getByTestId("community-write-body").fill(body);
  await page.getByTestId("community-write-submit").click();

  // `write` 를 배제해 화면 전환 전에 통과하지 않게 한다
  await expect(page).toHaveURL(/\/community\/(?!write)[^/]+$/);
  await expect(page.getByTestId("community-detail-title")).toHaveText(title);
  return new URL(page.url()).pathname.split("/").pop()!;
}

/** 시드 관리자 계정으로 세션을 한 줄 만들어 어드민 API 컨텍스트를 연다 */
async function openAdminApi(baseURL: string): Promise<{ api: APIRequestContext; token: string }> {
  const admins = await queryTestDb<{ id: string }>(
    'SELECT id FROM "User" WHERE "isAdmin" = true ORDER BY "createdAt" ASC LIMIT 1',
  );
  const adminId = admins[0]?.id;
  expect(adminId, "시드에 관리자 계정(isAdmin)이 있어야 한다").toBeTruthy();

  const token = `e2ereport${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
  await queryTestDb(
    `INSERT INTO "Session" (id, token, "userId", "expiresAt", "createdAt")
     VALUES ($1, $2, $3, $4, $5)`,
    [token, token, adminId, new Date(Date.now() + 60 * 60 * 1000), new Date()],
  );

  const api = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { cookie: `zari_session=${token}` },
  });
  return { api, token };
}

async function closeAdminApi(api: APIRequestContext, token: string) {
  await api.dispose();
  await queryTestDb('DELETE FROM "Session" WHERE token = $1', [token]);
}

test("E2E① 글 작성 → 다른 계정이 좋아요·댓글 → 인기 탭에 반영", async ({ page }) => {
  // ── ① 임대인이 두 편을 쓴다 (시드에 글이 없으므로 빈 상태에서 시작)
  await loginAsLandlord(page);
  await page.goto("/community");
  await expect(page.getByTestId("community-empty")).toBeVisible();

  const firstId = await writePost(
    page,
    FIRST_TITLE,
    "지난달보다 관리비가 두 배가 나왔습니다. 다들 어떠신가요?",
  );
  const secondId = await writePost(page, SECOND_TITLE, "분리수거 요일이 바뀐 것 같은데 아시는 분?");

  // 최신 탭은 나중에 쓴 글이 위
  await page.goto("/community");
  const cards = page.getByTestId("community-post-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveAttribute("data-post-id", secondId);

  // 글쓴이 유형 배지가 보인다
  await expect(cards.first()).toContainText("임대인");

  // ── ② 다른 계정(세입자)이 **먼저 쓴 글**에 좋아요와 댓글을 남긴다
  await loginAsTenant(page);
  await page.goto(`/community/${firstId}`);
  await expect(page.getByTestId("community-detail-title")).toHaveText(FIRST_TITLE);

  const likeButton = page.getByTestId("community-like-button");
  await expect(likeButton).toHaveAttribute("data-liked", "false");
  await likeButton.click();
  await expect(likeButton).toHaveAttribute("data-liked", "true");
  await expect(likeButton).toContainText("좋아요 1");

  await page.getByTestId("community-comment-input").fill("저희 라인도 두 배 나왔어요.");
  await page.getByTestId("community-comment-submit").click();
  await expect(page.getByTestId("community-comment")).toHaveCount(1);
  await expect(page.getByTestId("community-comment").first()).toContainText("세입자");

  // ── ③ 인기 탭에서 좋아요 받은 글이 맨 위로 올라온다
  await page.goto("/community");
  await expect(page.getByTestId("community-post-card").first()).toHaveAttribute(
    "data-post-id",
    secondId,
  );

  await page.getByTestId("community-sort-popular").click();
  const popularCards = page.getByTestId("community-post-card");
  await expect(popularCards.first()).toHaveAttribute("data-post-id", firstId);
  await expect(popularCards.first()).toContainText("좋아요 1");
  await expect(popularCards.first()).toContainText("댓글 1");

  // 주소에도 반영돼 새로고침·공유가 된다
  await expect(page).toHaveURL(/sort=popular/);
  await page.reload();
  await expect(page.getByTestId("community-post-card").first()).toHaveAttribute(
    "data-post-id",
    firstId,
  );

  // 좋아요 정합성 — 비정규화 컬럼과 PostLike 행 수가 같다
  const rows = await queryTestDb<{ likeCount: number; likes: string }>(
    `SELECT p."likeCount", (SELECT count(*) FROM "PostLike" l WHERE l."postId" = p.id)::text AS likes
     FROM "Post" p WHERE p.id = $1`,
    [firstId],
  );
  expect(rows[0]?.likeCount).toBe(1);
  expect(Number(rows[0]?.likes)).toBe(1);
});

test("E2E② 신고 → 어드민 블라인드 → 일반 사용자 화면에서 본문 숨김", async ({ page, baseURL }) => {
  // ── ① 임대인이 광고성 글을 올린다
  await loginAsLandlord(page);
  const postId = await writePost(page, AD_TITLE, AD_BODY);

  // ── ② 세입자가 그 글을 신고한다 (사유 선택 + 상세 사유)
  await loginAsTenant(page);
  await page.goto(`/community/${postId}`);
  await expect(page.getByTestId("community-detail-body")).toContainText("010-0000-0000");

  await page.getByTestId("community-report-post").click();
  await page.getByTestId("community-report-reason-0").click(); // 광고·홍보성 글
  await page.getByTestId("community-report-detail").fill("대출 광고입니다.");
  await page.getByTestId("community-report-submit").click();
  await expect(page.getByTestId("community-report-done")).toContainText("신고가 접수");

  // 같은 사람이 또 신고해도 큐가 늘지 않는다 — "이미 접수" 로 돌아온다
  await page.getByTestId("community-report-post").click();
  await page.getByTestId("community-report-submit").click();
  await expect(page.getByTestId("community-report-done")).toContainText("이미 접수");

  const openRows = await queryTestDb<{ count: string }>(
    `SELECT count(*)::text AS count FROM "Report" WHERE "postId" = $1`,
    [postId],
  );
  expect(Number(openRows[0]?.count)).toBe(1);

  // ── ③ 어드민이 큐에서 블라인드한다 (web API — 어드민 앱은 별도 포트라 화면으로 몰지 않는다)
  const { api, token } = await openAdminApi(baseURL!);
  try {
    const queue = await api.get("/api/reports?status=OPEN");
    expect(queue.status()).toBe(200);
    const body = await queue.json();
    const target = body.reports.find(
      (report: { targetId: string }) => report.targetId === postId,
    );
    expect(target, "신고가 어드민 큐에 보여야 한다").toBeTruthy();
    // 어드민은 대상 원문을 미리 본다
    expect(target.target.body).toContain("010-0000-0000");
    expect(target.availableActions.map((action: { action: string }) => action.action)).toContain(
      "BLIND",
    );

    const acted = await api.post(`/api/reports/${target.id}/action`, {
      data: { action: "BLIND" },
    });
    expect(acted.status()).toBe(200);
    const actedBody = await acted.json();
    expect(actedBody.report.status).toBe("ACTIONED");
    expect(actedBody.report.handledByName).toBeTruthy();
    expect(actedBody.report.handledAt).toBeTruthy();
  } finally {
    await closeAdminApi(api, token);
  }

  // 처리자·시각이 DB 에 남는다
  const handled = await queryTestDb<{ status: string; handledById: string; handledAt: Date }>(
    `SELECT status, "handledById", "handledAt" FROM "Report" WHERE "postId" = $1`,
    [postId],
  );
  expect(handled[0]?.status).toBe("ACTIONED");
  expect(handled[0]?.handledById).toBeTruthy();
  expect(handled[0]?.handledAt).toBeTruthy();

  // ── ④ 일반 사용자(세입자) 화면에서 본문이 숨겨진다
  await page.goto(`/community/${postId}`);
  await expect(page.getByTestId("community-post-blinded")).toBeVisible();
  await expect(page.getByTestId("community-detail-blind-notice")).toBeVisible();
  await expect(page.getByTestId("community-detail-title")).toHaveText("블라인드 처리된 글입니다");
  await expect(page.locator("body")).not.toContainText("010-0000-0000");
  await expect(page.getByTestId("community-like-button")).toBeDisabled();
  await expect(page.getByTestId("community-comment-locked")).toBeVisible();

  // 목록에서도 자리는 남고 내용만 가려진다
  await page.goto("/community");
  const blindedCard = page.locator(
    `[data-testid="community-post-card"][data-post-id="${postId}"]`,
  );
  await expect(blindedCard).toHaveAttribute("data-blinded", "true");
  await expect(blindedCard).toContainText("블라인드 처리된 글입니다");

  // ── ⑤ 작성자 본인에게는 원문이 그대로 보인다 (다시 쓰려면 원문이 필요하다)
  await loginAsLandlord(page);
  await page.goto(`/community/${postId}`);
  await expect(page.getByTestId("community-post-blinded")).toBeVisible();
  await expect(page.getByTestId("community-detail-title")).toHaveText(AD_TITLE);
  await expect(page.getByTestId("community-detail-body")).toContainText("010-0000-0000");
  await expect(page.getByTestId("community-delete-post")).toBeDisabled();
});
