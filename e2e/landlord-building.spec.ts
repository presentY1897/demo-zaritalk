import { expect, test } from "@playwright/test";
import { trackedEventCount } from "./db";

/**
 * T1.1 통합(E2E) — 임대인 자산(건물·호실) 여정 두 개.
 *
 * ① 시드 건물(행당해피빌)에서 **호실 그리드의 상태 색**과 호실 상세를 확인한다.
 *    시드는 201호 ACTIVE 계약 + 8월 OVERDUE 청구 / 202호 PENDING_TENANT / 101호 공실이라
 *    그리드는 **연체·대기·공실** 로 그려진다(연체가 계약중을 덮어쓴다 — `unit-status.ts`).
 *    "계약중" 자체는 201호 상세의 현재 계약 카드에서 확인한다.
 * ② 건물 등록 → 호실 추가 → 그리드에 공실로 표시 → 호실 상세 진입. 중복 라벨 409 문구까지 본다.
 *
 * 시드는 `e2e/global-setup.ts` 가 매 실행 전에 돌린다.
 */

/** 데모 로그인(임대인) 후 자산 탭까지 */
async function loginAsLandlord(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByTestId("demo-login-landlord").click();
  await expect(page).toHaveURL("/landlord");
}

test("E2E① 자산 탭 → 시드 건물의 호실 그리드 상태 색 → 호실 상세(현재 계약·공실 CTA)", async ({
  page,
}) => {
  await loginAsLandlord(page);

  // 하단 탭바의 "자산"(T0.5 가 확정한 경로 /landlord/buildings)
  await page.locator('[data-tab="assets"]').click();
  await expect(page).toHaveURL("/landlord/buildings");

  // 건물 카드 — 호실 3, 상태별 요약 배지
  const card = page.getByTestId("building-card").filter({ hasText: "행당해피빌" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("호실 3");
  await expect(card).toContainText("공실 1");

  await card.click();
  await expect(page).toHaveURL(/\/landlord\/buildings\/[a-z0-9]+$/);

  // 그리드 상태 색 — 라벨과 data-unit-status 를 함께 본다(색만으로 뜻을 전하지 않는다)
  const cell = (label: string) => page.locator(`[data-testid="unit-cell"][data-unit-label="${label}"]`);
  await expect(cell("101호")).toHaveAttribute("data-unit-status", "VACANT");
  await expect(cell("101호")).toContainText("공실");
  await expect(cell("201호")).toHaveAttribute("data-unit-status", "OVERDUE");
  await expect(cell("201호")).toContainText("연체");
  await expect(cell("202호")).toHaveAttribute("data-unit-status", "PENDING");
  await expect(cell("202호")).toContainText("대기");

  // 201호 상세 — 현재 계약(계약중) + 수납 요약(연체)
  await cell("201호").click();
  await expect(page).toHaveURL(/\/landlord\/units\/[a-z0-9]+$/);
  const lease = page.getByTestId("current-lease-card");
  await expect(lease).toContainText("박세입");
  await expect(lease).toContainText("계약중");
  await expect(page.getByTestId("charge-summary-card")).toContainText("연체 1");

  // 공실(101호) 상세 — 매물 등록(T3.1)·중개 요청(T3.6) 진입 버튼
  await page.goBack();
  await cell("101호").click();
  await expect(page.getByTestId("vacant-card")).toBeVisible();
  await expect(page.getByTestId("listing-create")).toBeVisible();
  await expect(page.getByTestId("brokerage-request")).toBeVisible();
});

test("E2E② 건물 등록 → 호실 추가 → 그리드에 공실 표시 → 호실 상세", async ({ page }) => {
  await loginAsLandlord(page);
  await page.locator('[data-tab="assets"]').click();
  await expect(page).toHaveURL("/landlord/buildings");

  // 건물 등록 — 주소·좌표는 지역 프리셋으로 채운다(카카오 키 전 임시 입력 방식)
  await page.getByTestId("building-add").click();
  await page.getByTestId("building-name").fill("성수리버뷰");
  await page.getByTestId("building-area-preset-성수").click();
  await expect(page.getByTestId("building-lat")).toHaveValue("37.54453");
  await page.getByTestId("building-submit").click();

  const newCard = page.getByTestId("building-card").filter({ hasText: "성수리버뷰" });
  await expect(newCard).toBeVisible();
  await expect(newCard).toContainText("호실 0");

  // 호실 추가
  await newCard.click();
  await expect(page.getByRole("heading", { name: "성수리버뷰" })).toBeVisible();
  await page.getByTestId("unit-add").click();
  await page.getByTestId("unit-label").fill("301호");
  await page.getByTestId("unit-floor").fill("3");
  await page.getByTestId("unit-submit").click();

  // 그리드에 공실로 나타난다
  const cell = page.locator('[data-testid="unit-cell"][data-unit-label="301호"]');
  await expect(cell).toHaveAttribute("data-unit-status", "VACANT");
  await expect(cell).toContainText("공실");

  // 같은 라벨을 또 넣으면 409 문구가 폼에 뜬다(@@unique([buildingId,label]))
  await page.getByTestId("unit-add").click();
  await page.getByTestId("unit-label").fill("301호");
  await page.getByTestId("unit-submit").click();
  // 시트 안의 alert 만 본다 — Next 라우트 안내(`__next-route-announcer__`)도 role="alert" 다
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("alert")).toContainText("이미 있는 호실입니다");
  await sheet.getByRole("button", { name: "닫기" }).click();

  // 호실 상세로 진입
  await cell.click();
  await expect(page).toHaveURL(/\/landlord\/units\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: "301호" })).toBeVisible();
  await expect(page.getByTestId("unit-status-badge")).toHaveText("공실");
  await expect(page.getByTestId("vacant-card")).toBeVisible();

  // 트래킹(T0.7 규약) — 등록 이벤트가 실제로 적재된다. 전송이 배치라 폴링으로 기다린다
  await expect.poll(() => trackedEventCount("building_create_complete")).toBeGreaterThan(0);
  await expect.poll(() => trackedEventCount("unit_create_complete")).toBeGreaterThan(0);
});
