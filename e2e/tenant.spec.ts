import { expect, test, type Page } from "@playwright/test";
import { queryTestDb, trackedEventCount } from "./db";

/**
 * T1.3 통합(E2E) — **세입자 연결**.
 *
 * E2E① 신규 세입자 가입 → 대기 계약 수락 → 세입자 홈에서 이번 달 납부 예정 확인
 * E2E② 시드 세입자(박세입) 데모 로그인 → 세입자 홈에 계약·청구가 보이는지 + Phase 2 자리 확인
 *
 * 시드(`packages/db/prisma/seed.ts`) 기반이며 `e2e/global-setup.ts` 가 매 실행 전에 시드를 돌린다.
 */

/** 202호 `PENDING_TENANT` 계약의 미가입 세입자(홍미가) */
const SIGNUP_PHONE = "01055555555";

/**
 * 같은 번호를 `auth.spec.ts`·`notice.spec.ts` 도 쓴다(파일 순서상 auth < notice < tenant).
 * 이 여정이 "신규 가입 → 수락" 이 되도록 **계정과 계약 상태를 함께** 되돌린다 —
 * `notice.spec.ts` 가 이미 수락까지 했으면 계약이 `ACTIVE` 라 대기 계약이 잡히지 않는다.
 * 시드를 다시 돌리지 않는 이유는 다른 스펙이 만든 상태(건물·호실·납부)를 지우지 않기 위해서다.
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

/** 전화번호 → OTP → 세입자 프로필까지 한 번에 (데모라 인증번호가 화면에 노출된다) */
async function signUpAsTenant(page: Page, phone: string, name: string): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-phone").fill(phone);
  await page.getByTestId("login-request-otp").click();

  const code = (await page.getByTestId("otp-code").innerText()).trim();
  await page.getByTestId("login-code").fill(code);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/onboarding\?ticket=/);

  await page.getByTestId("onboarding-name").fill(name);
  await page.getByTestId("profile-type-TENANT").click();
  await page.getByTestId("onboarding-submit").click();
}

test("E2E① 신규 세입자 가입 → 대기 계약 수락 → 홈에서 이번 달 납부 예정 확인", async ({ page }) => {
  await resetSignupPhone(SIGNUP_PHONE);

  await signUpAsTenant(page, SIGNUP_PHONE, "홍미가");

  // ── ① 가입 직후 수락 화면으로 (`resolveProfileRedirect` — T0.4 판정, T1.3 경로)
  await expect(page).toHaveURL("/tenant/leases/accept");
  const pending = page.getByTestId("pending-lease");
  await expect(pending).toBeVisible();

  // 임대인이 등록해 둔 조건이 그대로 보인다 (시드 202호: 보증금 1,000만 / 월세 55만 / 관리비 3만 / 25일)
  await expect(pending).toContainText("행당해피빌 202호");
  await expect(pending).toContainText("김임대");
  await expect(page.getByTestId("pending-monthly-rent")).toHaveText("550,000원");
  await expect(pending).toContainText("매월 25일");

  // ── ② 수락 → 세입자 홈
  await page.getByTestId("pending-accept").click();
  await expect(page).toHaveURL("/tenant");

  const card = page.getByTestId("tenant-lease-card");
  await expect(card).toContainText("행당해피빌 202호");
  await expect(card).toContainText("계약중");

  // ── ③ 이번 달 납부 예정 — 월세 550,000 + 관리비 30,000 = 580,000원
  await expect(page.getByTestId("tenant-charge-amount")).toContainText("580,000원");
  await expect(page.getByTestId("tenant-charge-status")).toHaveText("예정");
  await expect(page.getByTestId("tenant-current-charge")).toContainText("월세 550,000");
  await expect(page.getByTestId("tenant-current-charge")).toContainText("관리비 30,000");

  // 수락 대기 배너는 사라진다
  await expect(page.getByTestId("tenant-pending-banner")).toHaveCount(0);

  // ── ④ 계약이 실제로 연결됐는지 (화면으로 드러나지 않는 필드는 DB 로 본다)
  const rows = await queryTestDb<{
    status: string;
    tenantProfileId: string | null;
    tenantAcceptedAt: string | null;
  }>(
    `SELECT status, "tenantProfileId", "tenantAcceptedAt" FROM "Lease" WHERE "tenantPhone" = $1`,
    [SIGNUP_PHONE],
  );
  expect(rows[0]?.status).toBe("ACTIVE");
  expect(rows[0]?.tenantProfileId).not.toBeNull();
  expect(rows[0]?.tenantAcceptedAt).not.toBeNull();

  // ── ⑤ 임대인 화면에서도 202호가 「계약중」으로 바뀐다(수락이 ACTIVE 를 만드는 유일한 경로)
  await page.goto("/login");
  await page.getByTestId("demo-login-landlord").click();
  await expect(page).toHaveURL("/landlord");
  await page.locator('[data-tab="assets"]').click();
  await page.getByTestId("building-card").filter({ hasText: "행당해피빌" }).click();
  const unit202 = page.locator('[data-testid="unit-cell"][data-unit-label="202호"]');
  await expect(unit202).toContainText("계약중");

  // ── ⑥ 트래킹 (T0.7 규약)
  await expect.poll(() => trackedEventCount("tenant_lease_accept_view")).toBeGreaterThan(0);
  await expect.poll(() => trackedEventCount("tenant_lease_accept_complete")).toBeGreaterThan(0);
  await expect.poll(() => trackedEventCount("tenant_home_view")).toBeGreaterThan(0);
});

test("E2E② 시드 세입자(박세입) 홈 — 내 계약·이번 달 청구·Phase 2 자리", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("demo-login-tenant").click();
  await expect(page).toHaveURL("/tenant");

  // 시드 201호 ACTIVE 계약이 내 계약 카드로 보인다
  const card = page.getByTestId("tenant-lease-card");
  await expect(card).toContainText("행당해피빌 201호");
  await expect(card).toContainText("계약중");
  await expect(card).toContainText("김임대");

  // 이번 달(9월) 청구 — 월세 650,000 + 관리비 50,000 = 700,000원, 납부일 5일이라 아직 예정
  await expect(page.getByTestId("tenant-charge-amount")).toContainText("700,000원");
  await expect(page.getByTestId("tenant-charge-status")).toHaveText("예정");

  // 최근 청구에 시드 6·7월이 그대로 남아 있다(7월 부분납은 어떤 스펙도 건드리지 않는다)
  const row = (month: string) =>
    page.locator(`[data-testid="tenant-charge-row"][data-charge-month="${month}"]`);
  await expect(row("2026-07")).toContainText("부분납");
  await expect(row("2026-06")).toContainText("완납");

  // 밀린 금액 카드 — 7월 부분납 잔액이 남아 있으므로 보인다
  await expect(page.getByTestId("tenant-outstanding")).toBeVisible();

  // 수락 대기 계약이 없으므로 배너는 없다
  await expect(page.getByTestId("tenant-pending-banner")).toHaveCount(0);

  // Phase 2 자리 — 자리페이(T2.2)·민원(T2.6)은 비활성, 환급(T2.3·T2.4)은 탭 자리표로 연결
  await expect(page.getByTestId("tenant-pay-cta")).toBeDisabled();
  await expect(page.getByTestId("tenant-complaint-cta")).toContainText("곧 제공");
  await page.getByTestId("tenant-refund-banner").click();
  await expect(page).toHaveURL("/tenant/refund");

  // 옛 경로(T0.4 플레이스홀더)는 정식 경로로 리다이렉트된다
  await page.goto("/tenant/leases/pending");
  await expect(page).toHaveURL("/tenant/leases/accept");
  await expect(page.getByTestId("pending-empty")).toBeVisible();
});
