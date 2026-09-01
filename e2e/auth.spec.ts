import { expect, test } from "@playwright/test";

/**
 * T0.4 통합(E2E) — 로그인·온보딩 두 여정.
 *
 * 시드(`packages/db/prisma/seed.ts`) 기반이며 `e2e/global-setup.ts` 가 매 실행 전에 시드를 돌린다.
 */

/**
 * 시드에 **User 가 없는** 번호. 202호에 `PENDING_TENANT` 계약(홍미가)만 걸려 있어
 * 이 번호로 가입하면 세입자 대기 계약 판정에 걸린다 — E2E② 가 노리는 경로다.
 */
const SIGNUP_PHONE = "01055555555";

test("E2E① 원클릭 임대인 데모 로그인 → 홈 진입", async ({ page }) => {
  await page.goto("/login");

  await page.getByTestId("demo-login-landlord").click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // 세션이 실제로 발급됐는지 API 로 확인 (활성 프로필까지 임대인으로 잡힌다)
  const me = await page.request.get("/api/me");
  expect(me.status()).toBe(200);
  const body = await me.json();
  expect(body.user.name).toBe("김임대");
  expect(body.activeProfile.type).toBe("LANDLORD");
});

test("E2E② 신규 번호 OTP 가입 → 온보딩 → 세입자 프로필 → 수락 화면", async ({ page }) => {
  await page.goto("/login");

  // ① 전화번호 → 인증번호 발급(데모라 코드가 화면에 노출된다)
  await page.getByTestId("login-phone").fill(SIGNUP_PHONE);
  await page.getByTestId("login-request-otp").click();

  const code = (await page.getByTestId("otp-code").innerText()).trim();
  expect(code).toMatch(/^\d{6}$/);

  // ② 인증 → 신규 번호이므로 가입 티켓과 함께 온보딩으로
  await page.getByTestId("login-code").fill(code);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/onboarding\?ticket=/);

  // ③ 이름 + 세입자 유형
  await page.getByTestId("onboarding-name").fill("홍미가");
  await page.getByTestId("profile-type-TENANT").click();
  await page.getByTestId("onboarding-submit").click();

  // ④ 내 번호로 등록된 대기 계약이 있으므로 수락 화면(T1.3 플레이스홀더)으로
  await expect(page).toHaveURL("/tenant/leases/pending");
  await expect(page.getByRole("heading", { name: "세입자 계약 수락" })).toBeVisible();
  await expect(page.getByText("행당해피빌 202호")).toBeVisible();
  await expect(page.getByTestId("t13-placeholder")).toContainText("T1.3");

  // 가입·세션이 실제로 끝났는지 확인
  const me = await page.request.get("/api/me");
  expect(me.status()).toBe(200);
  const body = await me.json();
  expect(body.user.phone).toBe(SIGNUP_PHONE);
  expect(body.activeProfile.type).toBe("TENANT");
});
