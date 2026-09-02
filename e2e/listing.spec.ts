import { expect, test } from "@playwright/test";
import { mockAddressSearch, pickAddress } from "./address";
import { trackedEventCount } from "./db";

/**
 * T3.1·T3.4 통합(E2E).
 *
 * ① 임대인 → 공실 호실(101호) → 매물 등록 → OPEN 표시 → 예약 → 종료(되돌리기 불가까지)
 * ② 세입자 → 근무지 등록(주소 검색) → 목록에 통근 기준점으로 표시
 *
 * **카카오 주소 검색은 `e2e/address.ts` 가 우리 프록시 앞에서 가로챈다** — 이유는 그 파일 주석.
 * 시드는 `e2e/global-setup.ts` 가 매 실행 전에 돌린다(101호는 공실, 매물 없음).
 */

async function loginAs(page: import("@playwright/test").Page, role: "landlord" | "tenant") {
  await page.goto("/login");
  await page.getByTestId(`demo-login-${role}`).click();
  await expect(page).toHaveURL(role === "landlord" ? "/landlord" : "/tenant");
}

test("E2E① 임대인 공실 호실 → 매물 등록 → OPEN → 예약 → 종료", async ({ page }) => {
  await loginAs(page, "landlord");

  // 자산 → 시드 건물 → 공실 101호
  await page.locator('[data-tab="assets"]').click();
  await page.getByTestId("building-card").filter({ hasText: "행당해피빌" }).click();
  const vacant = page.locator('[data-testid="unit-cell"][data-unit-label="101호"]');
  await expect(vacant).toHaveAttribute("data-unit-status", "VACANT");
  await vacant.click();

  // 공실 카드의 「매물 등록」 → 매물 관리 화면
  await page.getByTestId("listing-create").click();
  await expect(page).toHaveURL(/\/landlord\/units\/[a-z0-9]+\/listing$/);
  await expect(page.getByTestId("listing-unit-status")).toHaveText("공실");

  // 월세 매물 등록
  await page.getByTestId("listing-deal-WOLSE").click();
  await page.getByTestId("listing-deposit").fill("10000000");
  await page.getByTestId("listing-monthly-rent").fill("500000");
  await page.getByTestId("listing-available-from").fill("2026-11-01");
  await page.getByTestId("listing-description").fill("역까지 도보 5분, 채광 좋음");
  await page.getByTestId("listing-submit").click();

  // 등록 직후 OPEN
  const summary = page.getByTestId("listing-summary");
  await expect(summary).toBeVisible();
  await expect(page.getByTestId("listing-status-badge")).toHaveText("공개 중");
  await expect(summary).toContainText("1,000만원");
  await expect(summary).toContainText("2026.11.01");

  // 같은 호실에 또 못 올린다 — 등록 폼이 사라지고 사유가 뜬다
  await expect(page.getByTestId("listing-create-card")).toHaveCount(0);

  // 상태 변경: 공개 중 → 예약
  await page.getByTestId("listing-status-RESERVED").click();
  await expect(page.getByTestId("listing-status-badge")).toHaveText("예약");

  // 예약 → 종료. 종료는 되돌릴 수 없으므로 공개·예약 버튼이 모두 비활성이 된다
  await page.getByTestId("listing-status-CLOSED").click();
  await expect(page.getByTestId("listing-status-badge")).toHaveText("종료");
  await expect(page.getByTestId("listing-status-OPEN")).toBeDisabled();
  await expect(page.getByTestId("listing-status-RESERVED")).toBeDisabled();

  // 종료했으니 다시 등록할 수 있다(공실이므로)
  await expect(page.getByTestId("listing-create-card")).toBeVisible();

  // 호실 상세에도 매물이 보인다
  await page.goBack();
  await expect(page.getByTestId("listing-card")).toContainText("종료");

  // 트래킹(T0.7) — 전송이 배치라 폴링으로 기다린다
  await expect.poll(() => trackedEventCount("listing_create_complete")).toBeGreaterThan(0);
  await expect.poll(() => trackedEventCount("listing_status_change")).toBeGreaterThan(1);
});

test("E2E② 세입자 근무지 등록(주소 검색) → 통근 기준점으로 표시", async ({ page }) => {
  await mockAddressSearch(page);
  await loginAs(page, "tenant");

  // 홈 → 근무지 관리 (T3.5 통근시간의 기준점)
  await page.getByTestId("tenant-workplace-link").click();
  await expect(page).toHaveURL("/tenant/workplaces");
  // 시드 세입자(박세입)는 근무지 1곳(강남역)을 이미 가지고 있다
  await expect(page.getByTestId("workplace-card")).toHaveCount(1);

  await page.getByTestId("workplace-add").click();
  await pickAddress(page, "workplace-address", "왕십리");

  // 장소 검색 결과를 고르면 라벨이 비어 있을 때 장소명으로 채워진다
  await expect(page.getByTestId("workplace-label")).toHaveValue("왕십리역");
  await expect(page.getByTestId("workplace-address-selected")).toContainText("왕십리로 300");

  await page.getByTestId("workplace-label").fill("본가");
  await page.getByTestId("workplace-submit").click();

  const cards = page.getByTestId("workplace-card");
  await expect(cards).toHaveCount(2);
  const added = cards.filter({ hasText: "본가" });
  await expect(added).toContainText("통근 기준점");
  await expect(added).toContainText("서울 성동구 왕십리로 300");
  await expect(added).toContainText("127.03782");

  // 같은 이름을 또 넣으면 409 문구가 시트에 뜬다
  await page.getByTestId("workplace-add").click();
  await page.getByTestId("workplace-label").fill("본가");
  await pickAddress(page, "workplace-address", "강남");
  await page.getByTestId("workplace-submit").click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("alert")).toContainText("이미 있는 근무지");
  await sheet.getByRole("button", { name: "닫기" }).click();

  // 수정 시트에서 삭제까지 — 등록·수정·삭제 완주
  await added.getByTestId("workplace-edit").click();
  await page.getByTestId("workplace-label").fill("본가(수정)");
  await page.getByTestId("workplace-submit").click();
  await expect(cards.filter({ hasText: "본가(수정)" })).toBeVisible();

  await cards.filter({ hasText: "본가(수정)" }).getByTestId("workplace-edit").click();
  await page.getByTestId("workplace-delete").click();
  await expect(page.getByTestId("workplace-card")).toHaveCount(1);

  await expect.poll(() => trackedEventCount("workplace_create_complete")).toBeGreaterThan(0);
});
