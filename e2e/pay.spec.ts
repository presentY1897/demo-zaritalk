import { expect, test, type Page } from "@playwright/test";
import { queryTestDb, trackedEventCount } from "./db";

/**
 * T2.1·T2.2 통합(E2E) — **자리페이(토스 결제위젯)**.
 *
 * ① 세입자 로그인 → `/tenant/pay/[chargeId]` 에서 청구 확인 + 위젯 자리 + 결제 금액(잔액)
 * ② 결제 API 방어선 — checkout 금액은 서버가 정하고, **금액 위변조 confirm 은 400** 이다
 * ③ 카드 납부가 원장에 들어간 뒤 세입자 납부 이력·임대인 수납 화면에 「자리페이」로 보인다
 *
 * ## 왜 위젯 결제를 끝까지 자동화하지 않나
 * 토스 결제위젯은 카드사 인증 iframe 안에서 사용자가 직접 입력해야 유효한 `paymentKey` 가
 * 나온다. 그 iframe 을 스크립트로 통과시키려 들면 토스 UI 가 바뀔 때마다 깨지는 불안정한
 * 테스트가 된다. 그래서 **결제 직전까지(위젯 렌더·금액 표시)는 브라우저로**, **승인 이후는
 * API·단위 테스트로** 나눠 검증한다:
 * - 승인 성공/실패/재승인/금액 위변조: `apps/web/src/app/api/toss/confirm/route.test.ts`
 * - 취소 웹훅 동기화: `apps/web/src/app/api/toss/webhook/route.test.ts`
 * - 실제 토스 API 인증·엔드포인트: `apps/web/src/features/pay/toss.test.ts`(키 없으면 skip)
 *
 * 시드는 `e2e/global-setup.ts` 가 매 실행 전에 돌린다.
 */

/** 시드 세입자(박세입) — 행당해피빌 201호 ACTIVE 계약 */
const TENANT_PHONE = "01022222222";
/** 결제 대상: 9월 청구(월세 650,000 + 관리비 50,000 = 700,000원) */
const TARGET = { year: 2026, month: 9, amount: 700_000 };

/**
 * 앞선 스펙(`landlord-lease.spec.ts`)이 시드 청구에 납부를 남기므로, 이 스펙이 쓰는 9월 청구만
 * 결제 전 상태로 되돌린다. 시드를 다시 돌리지 않는 이유는 다른 스펙이 만든 데이터를 지우지
 * 않기 위해서다(`tenant.spec.ts` 와 같은 방식).
 */
async function resetTargetCharge(): Promise<string> {
  const rows = await queryTestDb<{ id: string }>(
    `SELECT c.id
       FROM "RentCharge" c
       JOIN "Lease" l ON l.id = c."leaseId"
      WHERE l."tenantPhone" = $1 AND c.year = $2 AND c.month = $3`,
    [TENANT_PHONE, TARGET.year, TARGET.month],
  );
  const chargeId = rows[0]?.id;
  if (!chargeId) throw new Error("시드 9월 청구를 찾지 못했습니다.");

  // RentPayment 가 TossPayment 를 참조하므로 납부부터 지운다
  await queryTestDb('DELETE FROM "RentPayment" WHERE "chargeId" = $1', [chargeId]);
  await queryTestDb('DELETE FROM "TossPayment" WHERE "chargeId" = $1', [chargeId]);
  await queryTestDb(
    `UPDATE "RentCharge" SET "paidAmount" = 0, status = 'SCHEDULED'::"ChargeStatus" WHERE id = $1`,
    [chargeId],
  );
  return chargeId;
}

/**
 * 이 스펙이 9월 청구를 완납 상태로 만들어 두면 뒤따르는 `tenant.spec.ts` 가 "예정" 을 못 본다
 * (Playwright 는 파일명 순서로 직렬 실행된다). 끝나면 시드 상태(SCHEDULED · 0원)로 되돌린다.
 */
test.afterAll(async () => {
  await resetTargetCharge();
});

async function loginAsTenant(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("demo-login-tenant").click();
  await expect(page).toHaveURL("/tenant");
}

async function cardPaymentCount(chargeId: string): Promise<number> {
  const rows = await queryTestDb<{ count: string }>(
    `SELECT count(*)::text AS count FROM "RentPayment" WHERE "chargeId" = $1 AND method = 'CARD'`,
    [chargeId],
  );
  return Number(rows[0]?.count ?? 0);
}

test("E2E① 세입자 결제 화면 — 청구 확인 + 결제위젯 자리 + 결제 금액은 잔액", async ({ page }) => {
  const chargeId = await resetTargetCharge();
  await loginAsTenant(page);

  await page.goto(`/tenant/pay/${chargeId}`);

  // ── 청구 확인: 금액은 서버(원장 엔진)가 계산한 잔액이다
  await expect(page.getByTestId("pay-amount")).toHaveText("700,000원");
  const chargeCard = page.getByTestId("pay-charge");
  await expect(chargeCard).toContainText("2026년 9월분");
  await expect(chargeCard).toContainText("월세");
  await expect(chargeCard).toContainText("650,000원");
  await expect(chargeCard).toContainText("관리비");

  // ── 결제위젯 자리 + 테스트모드 안내 + 결제 버튼(금액이 라벨에 박힌다)
  await expect(page.getByTestId("pay-widget")).toBeVisible();
  await expect(page.getByTestId("pay-widget")).toContainText("테스트 모드");
  await expect(page.getByTestId("pay-submit")).toContainText("700,000원 결제하기");

  // ── 토스 위젯이 실제로 그려진다(결제수단 UI + 약관 UI 각각 iframe 1개).
  //    `js.tosspayments.com` 스크립트를 받아 오므로 네트워크가 필요하다.
  await expect(page.locator("#toss-payment-method iframe")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#toss-payment-agreement iframe")).toBeAttached();
  await expect(page.getByTestId("pay-error")).toHaveCount(0);
  // 위젯 준비가 끝나야 결제 버튼이 열린다(여기까지가 E2E 로 검증할 수 있는 마지막 지점)
  await expect(page.getByTestId("pay-submit")).toBeEnabled({ timeout: 30_000 });

  await expect.poll(() => trackedEventCount("pay_checkout_view")).toBeGreaterThan(0);
});

test("E2E② 결제 API — 금액은 서버가 정하고 위변조 승인은 거부한다", async ({ page, request }) => {
  const chargeId = await resetTargetCharge();
  await loginAsTenant(page);

  // ── checkout: 금액을 보내지 않아도(보내도) 서버가 청구 잔액으로 확정한다
  const checkout = await page.request.post("/api/toss/checkout", {
    data: { chargeId, amount: 1 },
  });
  expect(checkout.status()).toBe(201);
  const order = await checkout.json();
  expect(order.amount).toBe(TARGET.amount);
  expect(order.orderId).toMatch(/^[A-Za-z0-9_=-]{6,64}$/);

  // ── 금액 위변조 승인 → 400. 토스를 부르기도 전에 막힌다
  const tampered = await page.request.post("/api/toss/confirm", {
    data: { paymentKey: "tampered_key", orderId: order.orderId, amount: 1000 },
  });
  expect(tampered.status()).toBe(400);
  expect((await tampered.json()).error.code).toBe("VALIDATION_ERROR");

  // ── 없는 주문번호 → 404
  const missing = await page.request.post("/api/toss/confirm", {
    data: { paymentKey: "tampered_key", orderId: "zari_nosuchorder", amount: TARGET.amount },
  });
  expect(missing.status()).toBe(404);

  // ── 원장은 한 푼도 움직이지 않았다
  expect(await cardPaymentCount(chargeId)).toBe(0);
  const charge = await queryTestDb<{ paidAmount: number; status: string }>(
    'SELECT "paidAmount", status FROM "RentCharge" WHERE id = $1',
    [chargeId],
  );
  expect(Number(charge[0]?.paidAmount)).toBe(0);

  // ── 비로그인은 401 (`request` 픽스처는 페이지와 쿠키를 공유하지 않는 별도 컨텍스트다)
  const unauthorized = await request.post("/api/toss/checkout", { data: { chargeId } });
  expect(unauthorized.status()).toBe(401);
});

test("E2E②-b 실패 콜백 화면 — 사유를 우리 말로 보여 주고 같은 청구로 재시도한다", async ({
  page,
}) => {
  const chargeId = await resetTargetCharge();
  await loginAsTenant(page);

  // 결제창을 닫으면 토스가 `failUrl?code=..&message=..&orderId=..` 로 되돌려 보낸다
  const checkout = await page.request.post("/api/toss/checkout", { data: { chargeId } });
  const { orderId } = await checkout.json();
  await page.goto(
    `/tenant/pay/fail?code=PAY_PROCESS_CANCELED&message=${encodeURIComponent(
      "사용자가 결제를 취소하였습니다.",
    )}&orderId=${orderId}`,
  );

  await expect(page.getByTestId("pay-fail-reason")).toHaveText("결제를 취소했습니다.");
  await expect(page.getByTestId("pay-fail-code")).toContainText("PAY_PROCESS_CANCELED");
  // 주문번호로 청구를 찾아 같은 결제 화면으로 되돌려 준다
  await page.getByTestId("pay-retry").click();
  await expect(page).toHaveURL(`/tenant/pay/${chargeId}`);

  // 성공 콜백에 값이 빠져 있으면 승인하지 않고 안내한다
  await page.goto("/tenant/pay/success");
  await expect(page.getByTestId("pay-success-error")).toBeVisible();
  expect(await cardPaymentCount(chargeId)).toBe(0);
});

test("E2E③ 카드 납부는 세입자 납부 이력과 임대인 수납 화면에 「자리페이」로 보인다", async ({
  page,
}) => {
  const chargeId = await resetTargetCharge();

  // 승인까지 끝난 상태를 만든다 — 위젯 iframe 을 자동으로 통과시킬 수 없어 DB 로 재현한다.
  // (승인 → 원장 반영 경로 자체는 `api/toss/confirm/route.test.ts` 가 DB 로 검증한다)
  const orderId = `zari_e2e_${Date.now()}`;
  const toss = await queryTestDb<{ id: string }>(
    `INSERT INTO "TossPayment" ("id", "chargeId", "orderId", "paymentKey", "amount", "status", "raw", "approvedAt", "createdAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'DONE'::"TossPaymentStatus", $5::jsonb, now(), now())
     RETURNING id`,
    [
      chargeId,
      orderId,
      `${orderId}_key`,
      TARGET.amount,
      JSON.stringify({ payment: { receipt: { url: "https://dashboard.tosspayments.com/receipt/e2e" } } }),
    ],
  );
  await queryTestDb(
    `INSERT INTO "RentPayment" ("id", "chargeId", "amount", "method", "paidAt", "memo", "tossPaymentId")
     VALUES (gen_random_uuid()::text, $1, $2, 'CARD'::"PaymentMethod", now(), '자리페이 카드', $3)`,
    [chargeId, TARGET.amount, toss[0]!.id],
  );
  await queryTestDb(
    `UPDATE "RentCharge" SET "paidAmount" = $2, status = 'PAID'::"ChargeStatus" WHERE id = $1`,
    [chargeId, TARGET.amount],
  );

  // ── 세입자 납부 이력
  await loginAsTenant(page);
  await page.goto("/tenant/payments");
  const cardRow = page.locator('[data-testid="payment-row"][data-payment-method="CARD"]').first();
  await expect(cardRow).toBeVisible();
  await expect(cardRow).toContainText("자리페이");
  await expect(cardRow).toContainText("700,000원");
  await expect(cardRow.getByRole("link", { name: "영수증" })).toBeVisible();
  await expect(page.getByTestId("payments-card-total")).toContainText("1건");
  await expect.poll(() => trackedEventCount("pay_history_view")).toBeGreaterThan(0);

  // ── 완납이 된 청구는 결제 화면에서 결제할 게 없다고 알린다
  await page.goto(`/tenant/pay/${chargeId}`);
  await expect(page.getByTestId("pay-settled")).toBeVisible();

  // ── 임대인 수납 화면(T1.5)에도 같은 납부가 곧바로 보인다
  await page.goto("/login");
  await page.getByTestId("demo-login-landlord").click();
  await expect(page).toHaveURL("/landlord");
  await page.locator('[data-tab="assets"]').click();
  await page.getByTestId("building-card").filter({ hasText: "행당해피빌" }).click();
  await page.locator('[data-testid="unit-cell"][data-unit-label="201호"]').click();
  await page.getByTestId("lease-detail").click();
  await page.getByTestId("lease-tab-charges").click();

  const row = page.locator('[data-testid="charge-row"][data-charge-month="2026-09"]');
  await expect(row).toContainText("완납");
  await row.click();
  await expect(page.getByTestId("charge-sheet-status")).toHaveText("완납");
  await expect(page.getByTestId("payment-row")).toContainText("자리페이");
});
