import { expect, test, type Page } from "@playwright/test";
import { trackedEventCount } from "./db";

/**
 * T1.2·T1.5 통합(E2E) — 계약 등록과 수납 여정 두 개.
 *
 * ① **T1.2** 임대인 로그인 → 건물·호실 등록 → 계약 등록 → 호실 그리드에 계약 상태 표시.
 *    등록 직후 계약은 `PENDING_TENANT` 라 그리드는 **「대기」**로 그려진다(세입자 연결 전).
 *    "계약중"(OCCUPIED)은 ACTIVE 계약 + 연체 청구가 없을 때의 색이라 ②에서 확인한다.
 * ② **T1.5** 시드 8월 연체 청구(총액 **1,015,500원**)에 전액 가상 입금 → 완납 배지.
 *    연체가 사라지면서 시드 201호가 그리드에서 「연체」→ **「계약중」**으로 바뀌는 것까지 본다
 *    (`unit-status.ts`: 연체가 계약중을 덮어쓴다).
 *
 * 시드는 `e2e/global-setup.ts` 가 매 실행 전에 돌린다.
 */

async function loginAsLandlord(page: Page) {
  await page.goto("/login");
  await page.getByTestId("demo-login-landlord").click();
  await expect(page).toHaveURL("/landlord");
}

test("E2E① 건물·호실 등록 → 계약 등록 → 그리드에 계약 상태 + 당월 청구 생성", async ({
  page,
}) => {
  await loginAsLandlord(page);
  await page.locator('[data-tab="assets"]').click();
  await expect(page).toHaveURL("/landlord/buildings");

  // 건물 등록(지역 프리셋으로 좌표 채우기 — T1.1 방식)
  await page.getByTestId("building-add").click();
  await page.getByTestId("building-name").fill("왕십리스테이");
  await page.getByTestId("building-area-preset-성수").click();
  await page.getByTestId("building-submit").click();

  const card = page.getByTestId("building-card").filter({ hasText: "왕십리스테이" });
  await expect(card).toBeVisible();
  await card.click();

  // 호실 추가
  await page.getByTestId("unit-add").click();
  await page.getByTestId("unit-label").fill("401호");
  await page.getByTestId("unit-floor").fill("4");
  await page.getByTestId("unit-submit").click();

  const cell = page.locator('[data-testid="unit-cell"][data-unit-label="401호"]');
  await expect(cell).toHaveAttribute("data-unit-status", "VACANT");

  // 공실 호실 상세 → 「계약 등록」
  await cell.click();
  await expect(page).toHaveURL(/\/landlord\/units\/[a-z0-9]+$/);
  await page.getByTestId("lease-create").click();
  await expect(page).toHaveURL(/\/landlord\/leases\/new\?unitId=/);

  // 계약 조건 입력 — 호실은 링크(?unitId=)에서 미리 선택돼 있다
  const preselected = new URL(page.url()).searchParams.get("unitId") ?? "";
  await expect(page.getByTestId("lease-unit")).toHaveValue(preselected);
  await page.getByTestId("lease-tenant-name").fill("홍세입");
  await page.getByTestId("lease-tenant-phone").fill("010-7777-7777");
  await page.getByTestId("lease-deposit").fill("10000000");
  await page.getByTestId("lease-monthly-rent").fill("650000");
  await page.getByTestId("lease-maintenance-fee").fill("50000");
  await page.getByTestId("lease-payment-day").fill("5");
  await page.getByTestId("lease-late-fee-rate").fill("5");
  await page.getByTestId("lease-submit").click();

  // 계약 상세로 이동 — 등록 즉시 세입자 연결 대기
  await expect(page).toHaveURL(/\/landlord\/leases\/[a-z0-9]+$/);
  await expect(page.getByTestId("lease-status-badge")).toHaveText("세입자 연결 대기");
  await expect(page.getByTestId("lease-terms-card")).toContainText("매월 5일");
  await expect(page.getByTestId("lease-tenant-card")).toContainText("연결 대기");

  // 수납 탭 — 등록과 함께 당월 청구가 만들어져 있다
  await page.getByTestId("lease-tab-charges").click();
  const chargeRow = page.getByTestId("charge-row").first();
  await expect(chargeRow).toContainText("700,000원");
  await expect(chargeRow).toContainText("월세 650,000 + 관리비 50,000");

  // 그리드로 돌아오면 공실이 아니라 「대기」다(세입자 연결 전이므로 계약중이 아니다)
  await page.locator('[data-tab="assets"]').click();
  await page.getByTestId("building-card").filter({ hasText: "왕십리스테이" }).click();
  const leased = page.locator('[data-testid="unit-cell"][data-unit-label="401호"]');
  await expect(leased).toHaveAttribute("data-unit-status", "PENDING");
  await expect(leased).toContainText("대기");
  await expect(leased).toContainText("홍세입");

  await expect.poll(() => trackedEventCount("lease_create_complete")).toBeGreaterThan(0);
});

test("E2E② 8월 연체 청구(1,015,500원) 전액 가상 입금 → 완납 배지 → 그리드 계약중", async ({
  page,
}) => {
  await loginAsLandlord(page);
  await page.locator('[data-tab="assets"]').click();
  await page.getByTestId("building-card").filter({ hasText: "행당해피빌" }).click();

  // 시드 201호는 8월 청구가 연체라 그리드에서 「연체」로 보인다
  const unit201 = page.locator('[data-testid="unit-cell"][data-unit-label="201호"]');
  await expect(unit201).toHaveAttribute("data-unit-status", "OVERDUE");
  await unit201.click();

  // 호실 상세 → 계약 상세·수납
  await page.getByTestId("lease-detail").click();
  await expect(page).toHaveURL(/\/landlord\/leases\/[a-z0-9]+$/);
  await expect(page.getByTestId("lease-status-badge")).toHaveText("계약중");

  // 수납 탭 — 시드 6~9월 4개 상태가 모두 보인다
  await page.getByTestId("lease-tab-charges").click();
  const row = (month: string) =>
    page.locator(`[data-testid="charge-row"][data-charge-month="${month}"]`);
  await expect(row("2026-09")).toContainText("예정");
  await expect(row("2026-08")).toContainText("연체");
  await expect(row("2026-07")).toContainText("부분납");
  await expect(row("2026-06")).toContainText("완납");

  // 8월 청구 = 월세 650,000 + 관리비 50,000 + 전월 이월 300,000 + 연체료 15,500 = 1,015,500원
  await expect(row("2026-08")).toContainText("1,015,500원");
  await row("2026-08").click();

  const sheet = page.getByTestId("charge-sheet");
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId("charge-sheet-status")).toHaveText("연체");
  await expect(page.getByTestId("charge-sheet-total")).toHaveText("1,015,500원");
  await expect(page.getByTestId("charge-sheet-outstanding")).toHaveText("1,015,500원");

  // 가상 입금 시뮬레이션 — 입금액은 남은 금액으로 미리 채워져 있다
  await page.getByTestId("virtual-payer").fill("박세입");
  await expect(page.getByTestId("virtual-amount")).toHaveValue("1015500");
  await page.getByTestId("virtual-submit").click();

  // 즉시 반영 — 완납 배지 + 남은 금액 0 + 납부 타임라인
  await expect(page.getByTestId("charge-sheet-status")).toHaveText("완납");
  await expect(page.getByTestId("charge-sheet-paid")).toHaveText("1,015,500원");
  await expect(page.getByTestId("charge-settled")).toBeVisible();
  await expect(page.getByTestId("payment-row")).toContainText("박세입");

  await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
  await expect(row("2026-08")).toContainText("완납");

  // 연체가 사라지면 그리드에서 201호가 「계약중」으로 바뀐다
  await page.locator('[data-tab="assets"]').click();
  await page.getByTestId("building-card").filter({ hasText: "행당해피빌" }).click();
  const after = page.locator('[data-testid="unit-cell"][data-unit-label="201호"]');
  await expect(after).toHaveAttribute("data-unit-status", "OCCUPIED");
  await expect(after).toContainText("계약중");

  await expect.poll(() => trackedEventCount("payment_record_complete")).toBeGreaterThan(0);
  await expect.poll(() => trackedEventCount("charge_sheet_open")).toBeGreaterThan(0);
});
