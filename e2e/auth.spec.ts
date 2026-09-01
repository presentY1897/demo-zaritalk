import { expect, test } from "@playwright/test";
import { queryTestDb, trackedEventCount } from "./db";

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

/**
 * Phase 0 완료 조건이 "원클릭 로그인 **4종**" 이라 역할별로 전부 돈다.
 * 이름·유형은 시드(`packages/db/prisma/seed.ts`)와 `lib/auth/demo-accounts.ts` 기준.
 */
const DEMO_ROLES = [
  { role: "landlord", name: "김임대", type: "LANDLORD", home: "/landlord" },
  { role: "tenant", name: "박세입", type: "TENANT", home: "/tenant" },
  { role: "realtor", name: "이중개", type: "REALTOR", home: "/realtor" },
  { role: "master", name: "최마스", type: "MASTER", home: "/master" },
] as const;

for (const { role, name, type, home } of DEMO_ROLES) {
  test(`E2E① 원클릭 ${name}(${role}) 데모 로그인 → 홈 진입`, async ({ page }) => {
    await page.goto("/login");

    await page.getByTestId(`demo-login-${role}`).click();

    // `/` 는 로그인 상태면 활성 프로필 홈으로 보낸다(T0.5)
    await expect(page).toHaveURL(home);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // 세션이 실제로 발급됐는지 API 로 확인 (활성 프로필까지 해당 역할로 잡힌다)
    const me = await page.request.get("/api/me");
    expect(me.status()).toBe(200);
    const body = await me.json();
    expect(body.user.name).toBe(name);
    expect(body.activeProfile.type).toBe(type);
  });
}

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

  // ④ 내 번호로 등록된 대기 계약이 있으므로 수락 화면(T1.3)으로
  //    T1.3 이 `/tenant/leases/pending` 플레이스홀더를 정식 경로 `/tenant/leases/accept` 로 통일했다
  await expect(page).toHaveURL("/tenant/leases/accept");
  await expect(page.getByRole("heading", { name: "세입자 계약 수락" })).toBeVisible();
  await expect(page.getByText("행당해피빌 202호")).toBeVisible();
  await expect(page.getByTestId("pending-lease")).toBeVisible();

  // 가입·세션이 실제로 끝났는지 확인
  const me = await page.request.get("/api/me");
  expect(me.status()).toBe(200);
  const body = await me.json();
  expect(body.user.phone).toBe(SIGNUP_PHONE);
  expect(body.activeProfile.type).toBe("TENANT");

  // T0.7 트래킹이 이 여정에서 실제로 적재됐는지 — D2 퍼널의 뒤쪽 두 단계 + 자동 page_view.
  // 전송이 배치라 폴링으로 기다린다.
  await expect.poll(() => trackedEventCount("signup_start")).toBeGreaterThan(0);
  await expect.poll(() => trackedEventCount("signup_complete")).toBe(1);
  await expect.poll(() => trackedEventCount("page_view")).toBeGreaterThan(0);

  // 가입 완료 시점엔 세션이 있으므로 이벤트에 userId 가 붙는다
  const rows = await queryTestDb<{ userId: string | null }>(
    'SELECT "userId" FROM "TrackingEvent" WHERE name = $1',
    ["signup_complete"],
  );
  expect(rows[0]?.userId).toBe(body.user.id);
});
