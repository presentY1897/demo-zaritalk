import { expect, test, type Page } from "@playwright/test";
import { queryTestDb } from "./db";

/**
 * T1.7 · T1.8 통합(E2E) — **그로스 여정**.
 *
 * 발송 → 비로그인 열람 → CTA → 가입 → 수락 화면, 그리고 D2 퍼널
 * `notice_view → notice_cta_click → signup_start → signup_complete` 가 그 순서로 적재됐는지.
 *
 * 시드(`packages/db/prisma/seed.ts`) 기반이며 `e2e/global-setup.ts` 가 매 실행 전에 시드를 돌린다.
 */

/** 202호 PENDING_TENANT 계약의 미가입 세입자(홍미가) — 이 번호로 가입하면 수락 화면으로 간다 */
const SIGNUP_PHONE = "01055555555";

/** 시드에 들어 있는 공개 고지서 토큰(홍미가 앞으로 발송, 아직 열람 전) */
const SEED_TOKEN = "demo-notice-hong";

/**
 * `e2e/auth.spec.ts` 가 먼저 돌면서 같은 번호로 가입해 두므로(파일 순서상 auth < notice)
 * 이 여정이 "신규 가입" 이 되도록 계정을 지운다. 시드를 다시 돌리지 않는 이유는
 * 다른 스펙이 만든 상태(건물·호실)를 지우지 않기 위해서다.
 *
 * T1.3 이 붙은 뒤로는 **계약 상태까지** 되돌린다 — 수락하면 계약이 `ACTIVE` 가 되므로
 * 그대로 두면 다음 실행에서 대기 계약을 못 찾는다.
 */
async function resetSignupPhone(phone: string): Promise<void> {
  await queryTestDb(
    `UPDATE "Lease"
        SET "tenantProfileId" = NULL, "tenantAcceptedAt" = NULL,
            status = 'PENDING_TENANT'::"LeaseStatus"
      WHERE "tenantPhone" = $1 AND status <> 'ENDED'::"LeaseStatus"`,
    [phone],
  );
  await queryTestDb('DELETE FROM "OtpCode" WHERE phone = $1', [phone]);
  await queryTestDb('DELETE FROM "User" WHERE phone = $1', [phone]);
}

/** 임대인(김임대)으로 로그인한 별도 브라우저 컨텍스트 — 공개 고지서는 비로그인으로 봐야 한다 */
async function loginAsLandlord(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("demo-login-landlord").click();
  await expect(page).toHaveURL("/landlord");
}

async function noticeOpenedAt(token: string): Promise<string | null> {
  const rows = await queryTestDb<{ openedAt: string | null }>(
    'SELECT "openedAt" FROM "MessageLog" WHERE token = $1',
    [token],
  );
  return rows[0]?.openedAt ?? null;
}

/** 한 방문자(anonId)의 퍼널 이벤트를 적재 순서대로. `page_view` 는 자동 수집이라 뺀다. */
async function funnelEvents(anonId: string): Promise<string[]> {
  const rows = await queryTestDb<{ name: string }>(
    `SELECT name FROM "TrackingEvent"
       WHERE "anonId" = $1 AND name <> 'page_view'
       ORDER BY "createdAt" ASC, id ASC`,
    [anonId],
  );
  // 같은 단계가 연속으로 두 번 잡혀도(재시도 등) 순서 검증이 흔들리지 않게 접는다
  return rows.map((row) => row.name).filter((name, index, all) => name !== all[index - 1]);
}

async function anonIdOf(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const anon = cookies.find((cookie) => cookie.name === "zari_anon")?.value;
  expect(anon, "anonId 쿠키(zari_anon)가 있어야 퍼널을 이을 수 있다").toBeTruthy();
  return anon as string;
}

test("E2E① 그로스 여정 — 발송 → 비로그인 열람 → CTA → 가입 → 수락 화면", async ({
  page,
  browser,
}) => {
  await resetSignupPhone(SIGNUP_PHONE);

  // ── ① 임대인: 202호(미가입 세입자) 계약에 월세 고지서를 보낸다
  const landlordContext = await browser.newContext();
  const landlord = await landlordContext.newPage();
  await loginAsLandlord(landlord);
  await landlord.goto("/landlord/messages");

  await landlord.getByTestId("notice-send-open-202호").click();
  // 미리보기는 원장 엔진이 계산한 금액을 그대로 보여 준다(202호 8월분 580,000원)
  await expect(landlord.getByTestId("notice-preview-body")).toContainText("580,000원");
  // 실제 SMS·알림톡이 나가지 않는다는 것을 화면이 분명히 말한다
  await expect(landlord.getByTestId("notice-preview")).toContainText(
    "실제 알림톡·SMS 는 발송되지 않습니다",
  );
  await landlord.getByTestId("notice-send-submit").click();

  const sentLink = landlord.getByTestId("notice-sent-link");
  await expect(sentLink).toBeVisible();
  const noticePath = (await sentLink.getAttribute("href")) ?? "";
  expect(noticePath).toMatch(/^\/notice\/[0-9a-f]{32}$/);
  const token = noticePath.replace("/notice/", "");

  // ── ② 미가입 세입자: **비로그인**으로 공개 고지서를 연다
  await page.goto(noticePath);
  await expect(page).toHaveURL(noticePath); // /login 으로 튕기지 않는다
  await expect(page.getByTestId("notice-public")).toBeVisible();
  await expect(page.getByTestId("notice-total")).toContainText("580,000원");
  await expect(page.getByTestId("notice-account")).toContainText("자리은행");
  await expect(page.getByTestId("notice-message")).toContainText("행당해피빌 202호");

  const me = await page.request.get("/api/me");
  expect(me.status(), "공개 고지서는 세션 없이 열린다").toBe(401);

  // ── ③ 임대인 이력에 "열람"이 반영된다
  await expect.poll(() => noticeOpenedAt(token), { timeout: 10_000 }).not.toBeNull();
  await landlord.reload();
  const sentRow = landlord
    .getByTestId("message-row")
    .filter({ has: landlord.locator(`a[href="${noticePath}"]`) });
  await expect(sentRow.getByTestId("message-opened")).toBeVisible();

  // ── ④ 하단 가입 CTA → /login (어디서 왔는지가 쿼리에 남는다)
  await page.getByTestId("notice-cta").click();
  await expect(page).toHaveURL(new RegExp(`/login\\?from=notice&notice=${token}`));

  // ── ⑤ 가입 (미가입 세입자 홍미가)
  await page.getByTestId("login-phone").fill(SIGNUP_PHONE);
  await page.getByTestId("login-request-otp").click();
  const code = (await page.getByTestId("otp-code").innerText()).trim();
  await page.getByTestId("login-code").fill(code);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/onboarding\?ticket=/);

  await page.getByTestId("onboarding-name").fill("홍미가");
  await page.getByTestId("profile-type-TENANT").click();
  await page.getByTestId("onboarding-submit").click();

  // ── ⑥ 내 번호로 등록된 대기 계약 수락 화면(T1.3)까지 도달
  await expect(page).toHaveURL("/tenant/leases/accept");
  await expect(page.getByRole("heading", { name: "세입자 계약 수락" })).toBeVisible();
  await expect(page.getByText("행당해피빌 202호")).toBeVisible();

  // ── ⑦ D2 퍼널이 한 방문자(anonId)로 이어지고, 순서대로 적재됐는가
  const anonId = await anonIdOf(page);
  await expect
    .poll(() => funnelEvents(anonId), { timeout: 15_000 })
    .toEqual(["notice_view", "notice_cta_click", "signup_start", "signup_complete"]);

  // CTA 클릭 이벤트에는 A/B 변형이 실려 있다(T6.2 퍼널이 이 값으로 실험을 읽는다).
  // **T6.1 부터 변형은 anonId 해시로 배정된다** — 이 컨텍스트의 anonId 는 매 실행 새로 발급되므로
  // 값을 A 로 못 박을 수 없다. 대신 "배정된 변형과 이벤트에 실린 변형이 같은가" 를 본다.
  const ctaRows = await queryTestDb<{ props: { variant: string; experiment: string } }>(
    `SELECT props FROM "TrackingEvent" WHERE "anonId" = $1 AND name = 'notice_cta_click'`,
    [anonId],
  );
  expect(ctaRows[0]?.props.experiment).toBe("notice_cta");
  expect(["A", "B"]).toContain(ctaRows[0]?.props.variant);

  const assignment = await queryTestDb<{ variant: string; userId: string | null }>(
    `SELECT variant, "userId" FROM "AbAssignment"
      WHERE "anonId" = $1 AND "experimentKey" = 'notice_cta'`,
    [anonId],
  );
  expect(assignment, "고지서를 열면 배정이 한 줄 생긴다").toHaveLength(1);
  expect(ctaRows[0]?.props.variant).toBe(assignment[0]?.variant);

  // ── ⑧ 수락까지 (T1.3) — 그로스 여정의 마지막 구간.
  //    D2 퍼널 검증(⑦)을 먼저 끝내고 이어 붙인다. 수락은 같은 anonId 로 T1.3 이벤트를
  //    더 쌓으므로 순서를 바꾸면 ⑦ 의 `toEqual` 이 깨진다.
  await page.getByTestId("pending-accept").click();

  // 수락하면 세입자 홈으로 — 202호 계약이 내 계정에 연결되고 ACTIVE 가 된다
  await expect(page).toHaveURL("/tenant");
  await expect(page.getByTestId("tenant-lease-card")).toContainText("행당해피빌 202호");
  await expect(page.getByTestId("tenant-lease-card")).toContainText("계약중");

  // 이번 달 납부 예정 — 월세 550,000 + 관리비 30,000 = 580,000원, 납부일 25일
  await expect(page.getByTestId("tenant-charge-amount")).toContainText("580,000원");
  await expect(page.getByTestId("tenant-charge-status")).toHaveText("예정");

  // 수락 대기 배너는 사라진다
  await expect(page.getByTestId("tenant-pending-banner")).toHaveCount(0);

  // 계약이 실제로 연결됐는지 DB 로 확인 (화면으로 드러나지 않는 필드)
  const accepted = await queryTestDb<{
    status: string;
    tenantProfileId: string | null;
    tenantAcceptedAt: string | null;
  }>(
    `SELECT status, "tenantProfileId", "tenantAcceptedAt" FROM "Lease" WHERE "tenantPhone" = $1`,
    [SIGNUP_PHONE],
  );
  expect(accepted[0]?.status).toBe("ACTIVE");
  expect(accepted[0]?.tenantProfileId).not.toBeNull();
  expect(accepted[0]?.tenantAcceptedAt).not.toBeNull();

  await landlordContext.close();
});

test("E2E② 시드 토큰 비로그인 열람 → 임대인 이력에 열람 반영 · 잘못된 토큰 404 · 변형 B 배치", async ({
  page,
  browser,
}) => {
  // 잘못된 토큰은 404 (형식은 맞지만 없는 토큰)
  const missing = await page.goto("/notice/demo-notice-nope-0001");
  expect(missing?.status()).toBe(404);

  // 시드 토큰을 비로그인으로 연다 — T1.8 완료 기준
  await page.goto(`/notice/${SEED_TOKEN}`);
  await expect(page.getByTestId("notice-public")).toBeVisible();
  await expect(page.getByTestId("notice-title")).toContainText("8월 월세 고지서");
  await expect(page.getByTestId("notice-total")).toContainText("580,000원");
  await expect(page.getByTestId("notice-cta")).toBeVisible();
  await expect.poll(() => noticeOpenedAt(SEED_TOKEN), { timeout: 10_000 }).not.toBeNull();

  // 임대인 이력에서 "열람"으로 보인다
  const landlordContext = await browser.newContext();
  const landlord = await landlordContext.newPage();
  await loginAsLandlord(landlord);
  await landlord.goto("/landlord/messages");
  const seedRow = landlord
    .getByTestId("message-row")
    .filter({ has: landlord.locator(`a[href="/notice/${SEED_TOKEN}"]`) });
  await expect(seedRow.getByTestId("message-opened")).toBeVisible();
  await landlordContext.close();

  // 변형 B 는 금액 위에 배너가 하나 더 붙는다(D2 의 "배치" 안) — T6.1 이 이 자리를 배정으로 채운다
  await page.goto(`/notice/${SEED_TOKEN}?variant=B`);
  await expect(page.getByTestId("notice-cta-banner")).toBeVisible();
  await expect(page.getByTestId("notice-cta-banner")).toHaveAttribute("data-variant", "B");
});
