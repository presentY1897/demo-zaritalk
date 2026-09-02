import { expect, test, type Page } from "@playwright/test";
import { queryTestDb } from "./db";

/**
 * T2.3 통합(E2E) — **비로그인 공개 환급 계산기**.
 *
 * 이 화면은 SEO·유입 경로다. 그래서 E2E 가 지키는 것은 두 가지:
 * ① 로그인 없이 열리고 계산된다 ② CTA 가 가입 퍼널로 이어진다.
 *
 * 금액 규칙(공제율 경계·연 한도·소급 연도·부분 연도)의 경계값은 DB 없이 도는
 * `apps/web/src/features/refund/calc.test.ts` 가 맡는다. 여기서는 **그 숫자가 화면에
 * 그대로 그려지는지**만 본다 — 화면이 다시 계산하면 안 되기 때문이다.
 *
 * 날짜는 시드가 아니라 "지금"에 달려 있으므로(소급 5년 창이 해마다 밀린다)
 * **작년 한 해**를 쓴다. 작년은 언제 돌려도 소급 범위 안이고 미래가 아니다.
 */

/** 작년 — 언제 실행해도 소급 5년 창 안이고, 미래 날짜가 아니다 */
const LAST_YEAR = new Date().getFullYear() - 1;

async function anonIdOf(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const anon = cookies.find((cookie) => cookie.name === "zari_anon")?.value;
  expect(anon, "anonId 쿠키(zari_anon)가 있어야 퍼널을 이을 수 있다").toBeTruthy();
  return anon as string;
}

/** 한 방문자(anonId)의 환급 이벤트를 적재 순서대로. `page_view` 는 자동 수집이라 뺀다. */
async function refundEvents(anonId: string): Promise<string[]> {
  const rows = await queryTestDb<{ name: string }>(
    `SELECT name FROM "TrackingEvent"
       WHERE "anonId" = $1 AND name LIKE 'refund_%'
       ORDER BY "createdAt" ASC, id ASC`,
    [anonId],
  );
  return rows.map((row) => row.name).filter((name, index, all) => name !== all[index - 1]);
}

test("E2E① 비로그인 계산 → 연도별 내역·합계 → CTA 가 가입으로 이어진다", async ({ page }) => {
  // ── ① 로그인 없이 열린다 (`(protected)` 밖 · `(app)` 아래)
  const response = await page.goto("/refund/calculator");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL("/refund/calculator"); // /login 으로 튕기지 않는다
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("월세 환급 계산기");

  const me = await page.request.get("/api/me");
  expect(me.status(), "환급 계산기는 세션 없이 열린다").toBe(401);

  // 세법 자문이 아니라는 고지가 화면에 있다(task 요구사항)
  await expect(page.getByTestId("refund-disclaimer")).toContainText("실제 세법 자문이 아니");
  // 소급 범위(5년 창)가 화면에 드러난다 — 올해가 창의 끝이다
  await expect(page.getByTestId("refund-retro-range")).toContainText(
    `${LAST_YEAR - 3}~${LAST_YEAR + 1}년분 대상`,
  );

  // ── ② 입력 → 계산
  await page.getByTestId("refund-gross-salary").fill("48000000");
  await page.getByTestId("refund-monthly-rent").fill("500000");
  await page.getByTestId("refund-start-date").fill(`${LAST_YEAR}-01-01`);
  await page.getByTestId("refund-end-date").fill(`${LAST_YEAR}-12-31`);
  await page.getByTestId("refund-submit").click();

  // ── ③ 연도별 내역 + 합계 — 12개월 × 50만원 = 600만원 × 17% = 1,020,000원
  await expect(page.getByTestId("refund-result")).toBeVisible();
  await expect(page.getByTestId("refund-rate")).toHaveText("공제율 17%");
  await expect(page.getByTestId("refund-total-credit")).toHaveText("1,020,000원");

  await expect(page.getByTestId("refund-year-row")).toHaveCount(1);
  const yearRow = page.locator(`[data-testid="refund-year-row"][data-year="${LAST_YEAR}"]`);
  await expect(yearRow).toContainText(`${LAST_YEAR}년 · 12개월`);
  await expect(yearRow).toContainText("지급 월세 6,000,000원");
  await expect(yearRow.getByTestId("refund-year-credit")).toHaveText("1,020,000원");
  await expect(page.getByTestId("refund-total-row")).toHaveText("1,020,000원");

  // ── ④ CTA — 비로그인이면 로그인(가입)으로, 어디서 왔는지가 쿼리에 남는다
  const cta = page.getByTestId("refund-cta");
  await expect(cta).toHaveAttribute("data-logged-in", "false");
  await expect(cta).toContainText("가입하고 환급 신청하기");
  await cta.click();

  await expect(page).toHaveURL(/\/login\?from=refund_calculator&next=/);
  // 로그인하면 돌아갈 곳(T2.4 신청 화면)과 계산 입력이 쿼리에 실려 있다
  expect(decodeURIComponent(page.url())).toContain("/tenant/refund/apply?grossSalary=48000000");
  await expect(page.getByTestId("login-phone")).toBeVisible();

  // ── ⑤ 트래킹 — 계산 → CTA 클릭이 한 방문자(anonId)로 이어진다
  const anonId = await anonIdOf(page);
  await expect
    .poll(() => refundEvents(anonId), { timeout: 15_000 })
    .toEqual(["refund_calc_submit", "refund_cta_click"]);

  const ctaRows = await queryTestDb<{
    props: { source: string; loggedIn: boolean; creditAmount: number };
  }>(`SELECT props FROM "TrackingEvent" WHERE "anonId" = $1 AND name = 'refund_cta_click'`, [
    anonId,
  ]);
  expect(ctaRows[0]?.props.source).toBe("refund_calculator");
  expect(ctaRows[0]?.props.loggedIn).toBe(false);
  expect(ctaRows[0]?.props.creditAmount).toBe(1_020_000);
});

test("E2E② 0원 입력 거부 · 연 1,000만원 한도 컷 · 총급여 8,000만원 초과 대상 외", async ({
  page,
}) => {
  await page.goto("/refund/calculator");

  // ── 0원은 서버까지 가지 않고 화면에서 막힌다(서버와 같은 zod 스키마)
  await page.getByTestId("refund-gross-salary").fill("48000000");
  await page.getByTestId("refund-monthly-rent").fill("0");
  await page.getByTestId("refund-submit").click();
  await expect(page.getByTestId("refund-error")).toContainText("1원 이상");
  await expect(page.getByTestId("refund-result")).toHaveCount(0);

  // ── 한도 컷 — 12개월 × 100만원 = 1,200만원이지만 공제 대상은 1,000만원까지
  await page.getByTestId("refund-monthly-rent").fill("1000000");
  await page.getByTestId("refund-start-date").fill(`${LAST_YEAR}-01-01`);
  await page.getByTestId("refund-end-date").fill(`${LAST_YEAR}-12-31`);
  await page.getByTestId("refund-submit").click();

  await expect(page.getByTestId("refund-total-credit")).toHaveText("1,700,000원");
  await expect(page.getByTestId("refund-year-capped")).toContainText("초과분 2,000,000원 제외");

  // ── 총급여 8,000만원 + 1원 → 대상 외 (경계는 단위 테스트가, 화면 문구는 여기가 지킨다)
  await page.getByTestId("refund-gross-salary").fill("80000001");
  await page.getByTestId("refund-submit").click();

  await expect(page.getByTestId("refund-rate")).toHaveText("대상 외");
  await expect(page.getByTestId("refund-total-credit")).toHaveText("0원");
  await expect(page.getByTestId("refund-ineligible")).toContainText("80,000,000원");
});
