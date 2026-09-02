import { expect, test, type Page } from "@playwright/test";
import { queryTestDb } from "./db";

/**
 * T5.3 통합(E2E) — **견적 제안·수락. 3역할 관통 여정.**
 *
 * 세입자 민원 → 임대인 전환 → **마스터 피드 → 견적**(추천/피드 두 갈래) →
 * 임대인 **비교·수락**(나머지 자동 거절 + 배정) → **완료** → 세입자 화면에 **해결** 표시.
 *
 * Phase 5 의 마지막 조각이고, 이 스펙이 통과하면 세입자·임대인·마스터 셋이 한 줄로 이어진다.
 *
 * 시드(`packages/db/prisma/seed.ts`) 기준:
 * - 김임대 01011111111 · 행당해피빌(201호 ACTIVE 계약) / 박세입 01022222222
 * - 최마스 01044444444 — 성수, REPAIR·CLEANING, 5km, **PRO**(추천을 받는 쪽 = push)
 * - 한마스 01066666666 — 성수, INTERIOR·REPAIR, 5km, **FREE**(피드에서 찾는 쪽 = pull)
 *
 * 파일명 순서상 `pay` 다음, `workorder` 앞에서 돈다. 여기서 만든 민원·의뢰·견적은 제목이
 * 달라 `complaint`·`workorder` 스펙의 단언과 겹치지 않는다.
 */

const COMPLAINT_TITLE = "보일러가 자꾸 꺼집니다";
const COMPLAINT_BODY = "난방을 켜면 10분 만에 보일러가 꺼집니다. 점검 부탁드립니다.";
/** 추천(push)으로 받은 최마스가 낸 견적 — 비싼 쪽 */
const PUSH_AMOUNT = 220000;
/** 전체 피드(pull)에서 찾은 한마스가 낸 견적 — 임대인이 고를 싼 쪽 */
const PULL_AMOUNT = 180000;

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

async function loginAsProMaster(page: Page) {
  await page.goto("/login");
  await page.getByTestId("demo-login-master").click();
  await expect(page).toHaveURL("/master");
}

/** 원클릭 데모 로그인은 4종뿐이라(최마스) 한마스는 OTP 로 들어간다 — 데모라 코드가 화면에 뜬다 */
async function loginWithPhone(page: Page, phone: string) {
  await page.goto("/login");
  await page.getByTestId("login-phone").fill(phone);
  await page.getByTestId("login-request-otp").click();
  const code = (await page.getByTestId("otp-code").innerText()).trim();
  expect(code).toMatch(/^\d{6}$/);
  await page.getByTestId("login-code").fill(code);
  await page.getByTestId("login-submit").click();
}

/**
 * 한마스를 시드 상태(FREE · 받은 추천 없음)로 되돌린다.
 *
 * 이 스펙은 한마스가 **pull 로만** 의뢰를 찾는다는 전제 위에 서 있다(견적의 `source` 가 `PULL`).
 * CI 재시도나 다른 스펙이 플랜을 켜 둔 채로 들어오면 그 전제가 깨지므로 첫머리에서 되돌린다.
 */
async function resetFreeMaster() {
  const profileIds = `SELECT p.id FROM "Profile" p JOIN "User" u ON u.id = p."userId" WHERE u.name = '한마스'`;
  await queryTestDb(`DELETE FROM "WorkOrderTarget" WHERE "masterProfileId" IN (${profileIds})`);
  await queryTestDb(
    `UPDATE "MasterDetail" SET plan = 'FREE', "planUntil" = NULL WHERE "profileId" IN (${profileIds})`,
  );
}

/** 이 스펙이 만든 민원·의뢰·견적을 지운다 — 재시도해도 같은 조건에서 시작한다 */
async function resetScenario() {
  const orderIds = `SELECT w.id FROM "WorkOrder" w JOIN "Complaint" c ON c.id = w."complaintId" WHERE c.title = '${COMPLAINT_TITLE}'`;
  await queryTestDb(`DELETE FROM "WorkOrderQuote" WHERE "workOrderId" IN (${orderIds})`);
  await queryTestDb(`DELETE FROM "WorkOrderTarget" WHERE "workOrderId" IN (${orderIds})`);
  await queryTestDb(`DELETE FROM "WorkOrder" WHERE id IN (${orderIds})`);
  await queryTestDb(
    `DELETE FROM "ComplaintMessage" WHERE "complaintId" IN (SELECT id FROM "Complaint" WHERE title = $1)`,
    [COMPLAINT_TITLE],
  );
  await queryTestDb('DELETE FROM "Complaint" WHERE title = $1', [COMPLAINT_TITLE]);
}

/** 마스터 홈의 두 탭 중 한 곳에서 이 의뢰 카드를 찾아 상세로 들어간다 */
async function openOrderFromMaster(page: Page, tab: "recommended" | "feed") {
  await page.goto("/master");
  await page.getByTestId(`master-tab-${tab}`).click();
  const card = page.getByTestId("master-order-card").filter({ hasText: COMPLAINT_BODY });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute(
    "data-recommended",
    tab === "recommended" ? "true" : "false",
  );
  await card.click();
  await expect(page).toHaveURL(/\/master\/orders\//);
}

/** 의뢰 상세에서 금액·메시지로 견적을 보낸다 */
async function sendQuote(page: Page, amount: number, message: string) {
  await expect(page.getByTestId("master-quote-cta")).toBeEnabled();
  await page.getByTestId("master-quote-cta").click();
  await page.getByTestId("master-quote-amount").fill(String(amount));
  await page.getByTestId("master-quote-message").fill(message);
  await page.getByTestId("master-quote-submit").click();
  // 의뢰당 1회다 — 보내고 나면 버튼 자리가 내가 낸 견적 카드로 바뀐다
  await expect(page.getByTestId("master-my-quote")).toBeVisible();
  await expect(page.getByTestId("master-quote-status")).toHaveText("제안");
}

test("E2E 3역할 관통 — 민원 → 전환 → 견적 2건(추천·피드) → 수락 → 완료 → 세입자 해결", async ({
  page,
}) => {
  await resetScenario();
  await resetFreeMaster();

  // ── ① 세입자가 민원을 접수한다
  await loginAsTenant(page);
  await page.goto("/tenant/complaints");
  await page.getByTestId("complaint-new").click();
  await page.getByTestId("complaint-title").fill(COMPLAINT_TITLE);
  await page.getByTestId("complaint-body").fill(COMPLAINT_BODY);
  await page.getByTestId("complaint-submit").click();
  await expect(
    page.getByTestId("complaint-card").filter({ hasText: COMPLAINT_TITLE }),
  ).toHaveAttribute("data-complaint-status", "OPEN");

  // ── ② 임대인이 스레드에서 작업 의뢰로 전환한다
  await loginAsLandlord(page);
  await page.goto("/landlord/complaints");
  await page.getByTestId("complaint-card").filter({ hasText: COMPLAINT_TITLE }).click();
  await page.getByTestId("complaint-workorder-cta").click();
  await page.getByTestId("complaint-convert-category-REPAIR").click();
  await page.getByTestId("complaint-convert-submit").click();
  await expect(page.getByTestId("complaint-status")).toHaveText("진행중");

  await page.getByTestId("complaint-workorder-cta").click();
  await expect(page).toHaveURL(/\/landlord\/workorders\//);
  const orderUrl = page.url();
  await expect(page.getByTestId("workorder-status")).toHaveText("요청");
  // 아직 견적이 없다 — T5.3 이 열어 둔 자리가 실제로 비어 있다
  await expect(page.getByTestId("workorder-quote-empty")).toBeVisible();

  // ── ③ PRO 마스터(최마스)는 **추천(push)** 으로 받은 의뢰에 견적을 낸다
  await loginAsProMaster(page);
  await openOrderFromMaster(page, "recommended");
  await expect(page.getByTestId("master-order-recommended")).toBeVisible();
  await sendQuote(page, PUSH_AMOUNT, "출장 점검 후 부품 확정. 당일 시공 가능합니다.");

  // 「내 견적」 목록에 **추천으로 받은 건**이라고 표시된다
  await page.goto("/master/quotes");
  const pushCard = page.getByTestId("master-quote-card").filter({ hasText: "220,000원" });
  await expect(pushCard).toBeVisible();
  await expect(pushCard).toHaveAttribute("data-quote-source", "PUSH");
  await expect(pushCard).toHaveAttribute("data-quote-status", "PROPOSED");
  await expect(pushCard).toContainText("추천");

  // ── ④ FREE 마스터(한마스)는 **전체 피드(pull)** 에서 같은 의뢰를 찾아 견적을 낸다
  await loginWithPhone(page, "01066666666");
  await expect(page).toHaveURL("/master");
  await expect(page.getByTestId("master-plan-badge")).toHaveText("무료");
  await openOrderFromMaster(page, "feed");
  await sendQuote(page, PULL_AMOUNT, "부품 포함 정액입니다. 방문일 협의 가능합니다.");

  await page.goto("/master/quotes");
  const pullCard = page.getByTestId("master-quote-card").filter({ hasText: "180,000원" });
  await expect(pullCard).toHaveAttribute("data-quote-source", "PULL");
  await expect(pullCard).toContainText("피드");

  // ── ⑤ 임대인이 두 견적을 나란히 비교하고 **싼 쪽을 수락**한다
  await loginAsLandlord(page);
  await page.goto(orderUrl);
  const quoteCards = page.getByTestId("quote-card");
  await expect(quoteCards).toHaveCount(2);
  // 금액이 싼 순으로 놓인다 — 비교의 첫 기준이 금액이다
  await expect(quoteCards.first().getByTestId("quote-amount")).toHaveText("180,000원");

  const cheapCard = quoteCards.filter({ hasText: "180,000원" });
  const priceyCard = quoteCards.filter({ hasText: "220,000원" });
  await cheapCard.getByTestId("quote-accept").click();

  // 수락 1 + 나머지 자동 거절 + 의뢰 배정이 **한 번에** 화면에 반영된다
  await expect(cheapCard.getByTestId("quote-status")).toHaveText("수락");
  await expect(priceyCard.getByTestId("quote-status")).toHaveText("거절");
  await expect(page.getByTestId("workorder-status")).toHaveText("배정");
  // 배정된 뒤에는 수락 버튼이 사라진다
  await expect(page.getByTestId("quote-accept")).toHaveCount(0);

  const orderId = orderUrl.split("/").pop()!;

  // ── ⑥ 밀린 마스터 쪽에서 본 결과 — 「내 견적」은 거절이고, **배정된 의뢰는 새 견적을 안 받는다**
  //     (견적 API 는 마스터 전용이라 임대인 세션으로는 403 이다 — 마스터로 갈아탄 뒤 확인한다)
  await loginAsProMaster(page);
  await page.goto("/master/quotes");
  const rejectedCard = page.getByTestId("master-quote-card").filter({ hasText: "220,000원" });
  await expect(rejectedCard).toHaveAttribute("data-quote-status", "REJECTED");
  await expect(rejectedCard).toContainText("거절");

  await page.goto(`/master/orders/${orderId}`);
  await expect(page.getByTestId("master-quote-status")).toHaveText("거절");

  const rejectedPost = await page.request.post(`/api/work-orders/${orderId}/quotes`, {
    data: { amount: 100000 },
  });
  expect(rejectedPost.status()).toBe(409);
  expect((await rejectedPost.json()).error.message).toContain("배정");

  // ── ⑦ 임대인이 작업을 완료하면 **연결된 민원도 해결로 닫힌다**
  await loginAsLandlord(page);
  await page.goto(orderUrl);
  await page.getByTestId("workorder-status-DONE").click();
  await expect(page.getByTestId("workorder-status")).toHaveText("완료");
  await expect(page.getByTestId("workorder-complaint-resolved")).toBeVisible();

  // ── ⑧ 세입자 화면에 「해결」이 떠 있다 — 여기서 3역할이 한 줄로 닫힌다
  await loginAsTenant(page);
  await page.goto("/tenant/complaints");
  const tenantCard = page.getByTestId("complaint-card").filter({ hasText: COMPLAINT_TITLE });
  await expect(tenantCard).toHaveAttribute("data-complaint-status", "RESOLVED");
  await tenantCard.click();
  await expect(page.getByTestId("complaint-status")).toHaveText("해결");

  // ── ⑨ DB — 견적 2건(수락 1 · 거절 1) · 의뢰 완료 · 민원 해결
  const quotes = await queryTestDb<{ amount: number; status: string; company: string }>(
    `SELECT q.amount, q.status, d."companyName" AS company
       FROM "WorkOrderQuote" q
       JOIN "MasterDetail" d ON d."profileId" = q."masterProfileId"
      WHERE q."workOrderId" = $1
      ORDER BY q.amount ASC`,
    [orderId],
  );
  expect(quotes.map((quote) => [quote.amount, quote.status])).toEqual([
    [PULL_AMOUNT, "ACCEPTED"],
    [PUSH_AMOUNT, "REJECTED"],
  ]);

  const closing = await queryTestDb<{ order_status: string; complaint_status: string }>(
    `SELECT w.status AS order_status, c.status AS complaint_status
       FROM "WorkOrder" w
       JOIN "Complaint" c ON c.id = w."complaintId"
      WHERE w.id = $1`,
    [orderId],
  );
  expect(closing[0]?.order_status).toBe("DONE");
  expect(closing[0]?.complaint_status).toBe("RESOLVED");
});
