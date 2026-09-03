import { expect, test, type Page } from "@playwright/test";
import { queryTestDb, trackedEventCount } from "./db";

/**
 * T3.6·T3.7 통합(E2E) — **중개 요청·반경 매칭 + 중개인 수신함·수락**.
 *
 * 여정 하나로 두 task 의 완료 기준을 함께 지난다:
 * 임대인이 공실 101호에서 **반경 안 중개인 미리보기 → 발송** →
 * 중개인 수신함에 **거리와 함께** 도착 → **열람(VIEWED)** → **수락** →
 * 요청 **MATCHED** + 임대인에게 **연락처 카드** → 수락 중개인이 **그 호실에 매물 등록** →
 * `/realtor/listings` 에 내 매물로 보인다.
 *
 * ## `/search` 노출은 여기서 검증하지 않는다
 *
 * T3.7 문서의 통합 시나리오는 「… → 매물 등록 → `/search` 노출」 이지만 `/search`(T3.2)는
 * **아직 플레이스홀더**다(동시 작업 중). 매물이 `OPEN` 으로 올라간 것까지 여기서 확인하고,
 * `/search` 노출 확인은 **T3.2 머지 후**로 남긴다 — 두 문서에도 같은 내용을 적어 뒀다.
 *
 * ## 지도는 단언하지 않는다
 *
 * 카카오 지도 JS 키는 도메인 등록제라 E2E 포트가 등록돼 있지 않다. 미리보기 검증은
 * **인원 수(`brokerage-preview-count`)와 목록(`brokerage-preview-realtor`)** 으로만 한다.
 *
 * 시드(`packages/db/prisma/seed.ts`) 기준:
 * - 김임대 01011111111 · 행당해피빌(**101호 공실**) / 이중개 01033333333 — 왕십리부동산, 반경 3km
 *   (행당해피빌에서 약 0.12km — 반경 안이다)
 */

/** 101호는 여러 스펙이 함께 쓰는 유일한 공실이라, 이 스펙이 남긴 것을 앞뒤로 지운다 */
async function resetBrokerageState() {
  await queryTestDb(`DELETE FROM "BrokerageTarget"`);
  await queryTestDb(`DELETE FROM "BrokerageRequest"`);
  await queryTestDb(
    `DELETE FROM "Listing" WHERE "unitId" IN (
       SELECT u.id FROM "Unit" u JOIN "Building" b ON b.id = u."buildingId"
        WHERE u.label = '101호' AND b.name = '행당해피빌')`,
  );
  await queryTestDb(`DELETE FROM "MessageLog" WHERE kind = 'BROKERAGE_REQUEST'`);
}

test.beforeAll(resetBrokerageState);
// 매물이 남으면 뒤에 도는 `listing.spec.ts` 가 101호에 등록 폼을 못 본다
test.afterAll(resetBrokerageState);

async function loginAs(page: Page, role: "landlord" | "realtor") {
  await page.goto("/login");
  await page.getByTestId(`demo-login-${role}`).click();
  await expect(page).toHaveURL(role === "landlord" ? "/landlord" : "/realtor");
}

test("E2E① 임대인 중개 요청 → 중개인 수신함·열람 → 수락 → 매칭 + 매물 등록", async ({ page }) => {
  // ── ① 임대인: 공실 101호 상세에서 「중개 요청」 — 그 호실이 골라진 채 시트가 열린다
  await loginAs(page, "landlord");
  await page.locator('[data-tab="assets"]').click();
  await page.getByTestId("building-card").filter({ hasText: "행당해피빌" }).click();
  const vacant = page.locator('[data-testid="unit-cell"][data-unit-label="101호"]');
  await expect(vacant).toHaveAttribute("data-unit-status", "VACANT");
  await vacant.click();
  await page.getByTestId("brokerage-request").click();
  await expect(page).toHaveURL(/\/landlord\/brokerage\?unitId=/);

  // ── ② 발송 전 미리보기 — 반경 안 중개인은 시드의 이중개 1명이다
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId("brokerage-preview-count")).toHaveText("1명");
  const previewRealtors = page.getByTestId("brokerage-preview-realtor");
  await expect(previewRealtors).toHaveCount(1);
  await expect(previewRealtors.first()).toContainText("왕십리부동산");
  // 발송 전에는 연락처가 없다 — 수락한 중개인만 열린다
  await expect(sheet).not.toContainText("010-3333-3333");
  await expect(sheet).not.toContainText("01033333333");

  await page.getByTestId("brokerage-message").fill("즉시 입주 가능합니다. 월세 50만원 선입니다.");
  await page.getByTestId("brokerage-submit").click();

  // ── ③ 발송 결과 — 몇 명에게 갔는지 화면이 말해 준다
  await expect(page.getByTestId("brokerage-dispatched")).toContainText("1명");
  const card = page.getByTestId("brokerage-card").filter({ hasText: "행당해피빌 101호" });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-request-status", "OPEN");
  await expect(card).toContainText("응답 대기");
  await expect(card.getByTestId("brokerage-counts")).toContainText("대상 1명");
  await expect(card.getByTestId("brokerage-count-VIEWED")).toContainText("열람 0");
  await expect(card.getByTestId("brokerage-count-ACCEPTED")).toContainText("수락 0");

  // 알림톡 시뮬(T1.7 패턴)이 중개인 번호로 남는다
  const sent = await queryTestDb<{ title: string }>(
    `SELECT title FROM "MessageLog" WHERE kind = 'BROKERAGE_REQUEST' AND "toPhone" = '01033333333'`,
  );
  expect(sent).toHaveLength(1);
  expect(sent[0]?.title).toContain("행당해피빌 101호");

  // ── ④ 중개인 수신함 — 거리와 메시지가 함께 온다
  await loginAs(page, "realtor");
  const inboxCard = page.getByTestId("realtor-request-card");
  await expect(inboxCard).toHaveCount(1);
  await expect(inboxCard).toHaveAttribute("data-target-status", "SENT");
  await expect(inboxCard).toContainText("행당해피빌 101호");
  await expect(inboxCard).toContainText("즉시 입주 가능합니다");
  await expect(inboxCard.getByTestId("realtor-request-distance")).toContainText("km");

  // ── ⑤ 열람 — 상세를 여는 순간 VIEWED 로 올라간다
  await inboxCard.click();
  await expect(page).toHaveURL(/\/realtor\/requests\/[a-z0-9]+$/);
  await expect(page.getByTestId("realtor-request-status")).toHaveText("열람");
  await expect.poll(async () => {
    const rows = await queryTestDb<{ status: string }>(`SELECT status FROM "BrokerageTarget"`);
    return rows[0]?.status;
  }).toBe("VIEWED");
  // 수락 전에는 임대인 연락처가 없다
  await expect(page.getByTestId("realtor-landlord-phone")).toHaveCount(0);

  // ── ⑥ 수락 — 요청이 MATCHED 로 넘어가고 임대인 알림이 나간다
  await page.getByTestId("realtor-accept").click();
  await expect(page.getByTestId("realtor-responded")).toBeVisible();
  await expect(page.getByTestId("realtor-request-status")).toHaveText("수락");
  await expect(page.getByTestId("realtor-landlord-phone")).toBeVisible();

  await expect.poll(async () => {
    const rows = await queryTestDb<{ status: string }>(`SELECT status FROM "BrokerageRequest"`);
    return rows[0]?.status;
  }).toBe("MATCHED");
  const accepted = await queryTestDb<{ title: string }>(
    `SELECT title FROM "MessageLog" WHERE kind = 'BROKERAGE_REQUEST' AND "toPhone" = '01011111111'`,
  );
  expect(accepted).toHaveLength(1);
  expect(accepted[0]?.title).toContain("수락");

  // ── ⑦ 수락 중개인이 그 호실에 매물을 올린다 (T3.1 이 열어 둔 권한이 여기서 실제로 쓰인다)
  await page.getByTestId("realtor-listing-manage").click();
  await expect(page).toHaveURL(/\/landlord\/units\/[a-z0-9]+\/listing$/);
  await page.getByTestId("listing-deal-WOLSE").click();
  await page.getByTestId("listing-deposit").fill("10000000");
  await page.getByTestId("listing-monthly-rent").fill("500000");
  await page.getByTestId("listing-submit").click();
  await expect(page.getByTestId("listing-status-badge")).toHaveText("공개 중");

  // 등록자가 중개인으로 남는다.
  // 시드에도 매물이 있으므로(지도 화면용) **이 여정이 만든 101호 매물로 좁혀서** 확인한다 —
  // `Listing` 전체를 세면 시드가 늘 때마다 깨진다.
  const listedBy = await queryTestDb<{ name: string; type: string }>(
    `SELECT u.name, p.type FROM "Listing" l
       JOIN "Unit" un ON un.id = l."unitId"
       JOIN "Building" b ON b.id = un."buildingId"
       JOIN "Profile" p ON p.id = l."listedByProfileId"
       JOIN "User" u ON u.id = p."userId"
      WHERE un.label = '101호' AND b.name = '행당해피빌'`,
  );
  expect(listedBy).toHaveLength(1);
  expect(listedBy[0]).toMatchObject({ name: "이중개", type: "REALTOR" });

  // ── ⑧ 중개인 「매물」 탭 — 내가 맡은 매물로 보인다
  await page.goto("/realtor");
  await page.locator('[data-tab="listings"]').click();
  await expect(page).toHaveURL("/realtor/listings");
  const myListing = page.getByTestId("realtor-listing-card");
  await expect(myListing).toHaveCount(1);
  await expect(myListing).toContainText("행당해피빌 101호");
  await expect(myListing).toContainText("공개 중");

  // ⚠️ `/search`(T3.2) 노출 확인은 그 화면이 아직 플레이스홀더라 여기서 하지 않는다 — T3.2 머지 후.

  // ── ⑨ 임대인으로 돌아오면 매칭 + 수락 중개인 연락 카드가 보인다
  await loginAs(page, "landlord");
  await page.locator('[data-tab="brokerage"]').click();
  await expect(page).toHaveURL("/landlord/brokerage");
  const matched = page.getByTestId("brokerage-card").filter({ hasText: "행당해피빌 101호" });
  await expect(matched).toHaveAttribute("data-request-status", "MATCHED");
  await expect(matched).toContainText("매칭");
  await expect(matched.getByTestId("brokerage-count-ACCEPTED")).toContainText("수락 1");

  const contact = matched.getByTestId("brokerage-accepted");
  await expect(contact).toContainText("왕십리부동산");
  await expect(contact).toContainText("이중개");
  await expect(contact.getByTestId("brokerage-accepted-phone")).toHaveAttribute(
    "href",
    "tel:01033333333",
  );
  // 중개인이 올린 매물도 임대인 카드에서 보인다
  await expect(matched).toContainText("매물 공개 중");

  // ── ⑩ 트래킹(T0.7) — 전송이 배치라 폴링으로 기다린다
  await expect.poll(() => trackedEventCount("brokerage_request_complete")).toBeGreaterThan(0);
  await expect.poll(() => trackedEventCount("brokerage_inbox_view")).toBeGreaterThan(0);
  await expect.poll(() => trackedEventCount("brokerage_respond_complete")).toBeGreaterThan(0);
});
