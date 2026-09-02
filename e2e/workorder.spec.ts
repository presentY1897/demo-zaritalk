import { expect, test, type Page } from "@playwright/test";
import { queryTestDb } from "./db";

/**
 * T5.1·T5.2 통합(E2E) — **작업 의뢰 + 마스터 피드(pull) · 유료 push 추천**.
 * 두 task 문서의 완료 기준 그대로다.
 *
 * E2E① 임대인이 의뢰를 등록 → **PRO 마스터(최마스) 추천 탭에 즉시 노출** →
 *      **FREE 마스터(한마스) 추천 탭은 비어 있고 업그레이드 안내** → 같은 의뢰가
 *      한마스의 **전체 피드에는 보인다**(pull) → 플랜을 PRO 로 토글하면 **추천 탭이 즉시 채워진다**
 * E2E② 세입자 민원 → 임대인이 **작업 의뢰로 전환** → 민원 「진행중」 + 의뢰 생성 →
 *      같은 민원을 다시 전환하면 **409**
 *
 * 시드(`packages/db/prisma/seed.ts`) 기준:
 * - 김임대 01011111111 · 행당해피빌(201호 ACTIVE 계약) / 박세입 01022222222
 * - 최마스 01044444444 — 성수, REPAIR·CLEANING, 5km, **PRO**(추천 1건이 이미 와 있다)
 * - 한마스 01066666666 — 성수, INTERIOR·REPAIR, 5km, **FREE**(원클릭 버튼이 없어 OTP 로 로그인한다)
 *
 * 파일명 순서상 **마지막**에 돈다 — 여기서 만든 의뢰·전환·플랜 변경은 앞 스펙에 영향을 주지 않는다.
 */

const ORDER_DESCRIPTION = "201호 세면대 배관에서 물이 샙니다. 방문 점검 부탁드립니다.";
const COMPLAINT_TITLE = "현관문이 잠기지 않습니다";

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
 * E2E① 이 마지막에 한마스를 PRO 로 켜므로, **재시도(CI `retries: 1`)로 같은 스펙이 다시 돌면**
 * 시작 조건이 달라져 "FREE 는 추천이 없다" 가 거짓이 된다. 그래서 스펙 첫머리에서 되돌린다.
 */
async function resetFreeMaster() {
  const profileIds = `SELECT p.id FROM "Profile" p JOIN "User" u ON u.id = p."userId" WHERE u.name = '한마스'`;
  await queryTestDb(`DELETE FROM "WorkOrderTarget" WHERE "masterProfileId" IN (${profileIds})`);
  await queryTestDb(
    `UPDATE "MasterDetail" SET plan = 'FREE', "planUntil" = NULL WHERE "profileId" IN (${profileIds})`,
  );
}

test("E2E① 임대인 의뢰 등록 → PRO 추천 노출 → FREE 는 피드만 → 플랜 토글로 추천 채움", async ({
  page,
}) => {
  await resetFreeMaster();

  // ── ① 임대인이 201호 수리 의뢰를 등록한다
  await loginAsLandlord(page);
  await page.goto("/landlord/workorders");

  await page.getByTestId("workorder-new").click();
  await page.getByTestId("workorder-category-REPAIR").click();
  await page.locator('[data-testid^="workorder-unit-"]').filter({ hasText: "201호" }).click();
  await page.getByTestId("workorder-description").fill(ORDER_DESCRIPTION);
  await page.getByTestId("workorder-submit").click();

  // 등록 직후 화면이 "몇 명에게 추천이 갔는지" 를 알려 준다 (시드 PRO 마스터 = 최마스 1명)
  await expect(page.getByTestId("workorder-dispatched")).toContainText("1명");

  const card = page.getByTestId("workorder-card").filter({ hasText: ORDER_DESCRIPTION });
  await expect(card).toBeVisible();
  await expect(card).toContainText("요청");
  await expect(card).toContainText("행당해피빌 201호");
  await expect(card).toContainText("추천 1명");

  // DB — 타겟이 PRO 마스터(최마스)에게만 생겼다
  const targets = await queryTestDb<{ name: string; plan: string }>(
    `SELECT u.name, d.plan
       FROM "WorkOrderTarget" t
       JOIN "WorkOrder" w ON w.id = t."workOrderId"
       JOIN "Profile" p ON p.id = t."masterProfileId"
       JOIN "User" u ON u.id = p."userId"
       JOIN "MasterDetail" d ON d."profileId" = p.id
      WHERE w.description = $1`,
    [ORDER_DESCRIPTION],
  );
  expect(targets.map((target) => target.name)).toEqual(["최마스"]);
  expect(targets[0]?.plan).toBe("PRO");

  // ── ② PRO 마스터(최마스)의 추천 탭에 그 의뢰가 있다
  await page.goto("/login");
  await page.getByTestId("demo-login-master").click();
  await expect(page).toHaveURL("/master");
  await expect(page.getByTestId("master-plan-badge")).toHaveText("PRO");

  const proRecommended = page
    .getByTestId("master-order-card")
    .filter({ hasText: ORDER_DESCRIPTION });
  await expect(proRecommended).toBeVisible();
  await expect(proRecommended).toHaveAttribute("data-recommended", "true");

  // 상세도 열린다 (견적 제안 자리는 T5.3 이 열었다 — 여정 자체는 quote.spec.ts 가 본다)
  await proRecommended.click();
  await expect(page).toHaveURL(/\/master\/orders\//);
  await expect(page.getByTestId("master-order-recommended")).toBeVisible();
  await expect(page.getByTestId("master-quote-cta")).toBeEnabled();

  // ── ③ FREE 마스터(한마스)는 추천 탭이 비어 있다 — 대신 업그레이드 안내
  await loginWithPhone(page, "01066666666");
  await expect(page).toHaveURL("/master");
  await expect(page.getByTestId("master-plan-badge")).toHaveText("무료");
  await expect(page.getByTestId("master-upgrade")).toBeVisible();
  await expect(
    page.getByTestId("master-order-card").filter({ hasText: ORDER_DESCRIPTION }),
  ).toHaveCount(0);

  // ── ④ 그래도 전체 피드(pull)에는 같은 의뢰가 보인다 — 무료가 일감에 닿는 길
  await page.getByTestId("master-tab-feed").click();
  const freeFeedCard = page.getByTestId("master-order-card").filter({ hasText: ORDER_DESCRIPTION });
  await expect(freeFeedCard).toBeVisible();
  await expect(freeFeedCard).toHaveAttribute("data-recommended", "false");

  // ── ⑤ 플랜을 PRO 로 토글하면 추천 탭이 그 자리에서 채워진다(데모 시연)
  await page.getByTestId("master-tab-recommended").click();
  await page.getByTestId("master-plan-toggle").click();
  await expect(page.getByTestId("master-plan-badge")).toHaveText("PRO");
  await expect(page.getByTestId("master-upgrade")).toHaveCount(0);
  await expect(
    page.getByTestId("master-order-card").filter({ hasText: ORDER_DESCRIPTION }),
  ).toBeVisible();

  const backfilled = await queryTestDb<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM "WorkOrderTarget" t
       JOIN "Profile" p ON p.id = t."masterProfileId"
       JOIN "User" u ON u.id = p."userId"
      WHERE u.name = '한마스'`,
  );
  expect(Number(backfilled[0]?.count ?? 0)).toBeGreaterThan(0);
});

test("E2E② 민원 → 작업 의뢰 전환 (재전환은 409)", async ({ page }) => {
  // ── ① 세입자가 민원을 접수한다
  await loginAsTenant(page);
  await page.goto("/tenant/complaints");
  await page.getByTestId("complaint-new").click();
  await page.getByTestId("complaint-title").fill(COMPLAINT_TITLE);
  await page
    .getByTestId("complaint-body")
    .fill("현관문 도어록이 헛돌아 잠기지 않습니다. 확인 부탁드립니다.");
  await page.getByTestId("complaint-submit").click();
  await expect(
    page.getByTestId("complaint-card").filter({ hasText: COMPLAINT_TITLE }),
  ).toBeVisible();

  // ── ② 임대인이 스레드를 열어 작업 의뢰로 전환한다
  await loginAsLandlord(page);
  await page.goto("/landlord/complaints");
  await page.getByTestId("complaint-card").filter({ hasText: COMPLAINT_TITLE }).click();
  await expect(page.getByTestId("complaint-status")).toHaveText("접수");

  await page.getByTestId("complaint-workorder-cta").click();
  await page.getByTestId("complaint-convert-category-REPAIR").click();
  await page.getByTestId("complaint-convert-submit").click();

  // 전환하면 민원은 「진행중」이 되고 같은 자리가 의뢰 링크로 바뀐다
  await expect(page.getByTestId("complaint-status")).toHaveText("진행중");
  await expect(page.getByTestId("complaint-workorder-cta")).toContainText("전환된 작업 의뢰 보기");

  // ── ③ 링크를 따라가면 의뢰 상세다 — 민원으로 되돌아가는 길도 있다
  await page.getByTestId("complaint-workorder-cta").click();
  await expect(page).toHaveURL(/\/landlord\/workorders\//);
  await expect(page.getByTestId("workorder-status")).toHaveText("요청");
  await expect(page.getByTestId("workorder-complaint-link")).toContainText(COMPLAINT_TITLE);
  // 몇 명인지는 그때 PRO 인 마스터 수에 달렸다 — 여기서 볼 것은 "추천이 나갔다" 는 사실이다
  await expect(page.getByTestId("workorder-target-count")).toContainText("PRO 마스터");
  // 갓 전환된 의뢰라 받은 견적이 없다(T5.3 이 연 자리 — 여정은 quote.spec.ts 가 본다)
  await expect(page.getByTestId("workorder-quote-empty")).toBeVisible();

  // ── ④ DB — 민원 1건 : 의뢰 1건, 민원 상태는 IN_PROGRESS
  const rows = await queryTestDb<{ status: string; work_order_id: string }>(
    `SELECT c.status, w.id AS work_order_id
       FROM "Complaint" c
       JOIN "WorkOrder" w ON w."complaintId" = c.id
      WHERE c.title = $1`,
    [COMPLAINT_TITLE],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]?.status).toBe("IN_PROGRESS");

  const dispatched = await queryTestDb<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM "WorkOrderTarget" t
       JOIN "WorkOrder" w ON w.id = t."workOrderId"
       JOIN "Complaint" c ON c.id = w."complaintId"
      WHERE c.title = $1`,
    [COMPLAINT_TITLE],
  );
  expect(Number(dispatched[0]?.count ?? 0)).toBeGreaterThan(0);

  // ── ⑤ 같은 민원을 다시 전환하면 409 — 의뢰가 둘 생기지 않는다
  const complaintId = await queryTestDb<{ id: string }>(
    'SELECT id FROM "Complaint" WHERE title = $1',
    [COMPLAINT_TITLE],
  );
  const again = await page.request.post(`/api/complaints/${complaintId[0]!.id}/convert`, {
    data: { category: "REPAIR" },
  });
  expect(again.status()).toBe(409);

  const count = await queryTestDb<{ count: string }>(
    `SELECT count(*)::text AS count FROM "WorkOrder" w
       JOIN "Complaint" c ON c.id = w."complaintId"
      WHERE c.title = $1`,
    [COMPLAINT_TITLE],
  );
  expect(count[0]?.count).toBe("1");
});
