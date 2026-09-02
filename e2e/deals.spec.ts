import { expect, test, type Page } from "@playwright/test";
import { queryTestDb } from "./db";

/**
 * T4.3·T4.4 통합(E2E) — **실거래가 조회 · 필터 · 추이 · 알림 구독**.
 *
 * - E2E① 비로그인으로 조회 → 유형 탭 전환 → 단지 검색 → 단지 추이 차트 → 알림은 로그인 유도
 * - E2E② 로그인 후 구독 → 목록 반영 → 같은 조건 재구독은 «이미 구독» → 해제
 *
 * ## 국토부 API 를 **실호출하지 않는다**
 *
 * `/deals` 는 "그 지역에 수집분이 한 줄도 없을 때만" 국토부를 부른다(캐시 우선). 그래서
 * **테스트 DB 에 수집분을 미리 넣어 두면 외부 호출 경로가 아예 열리지 않는다.**
 * route mock 은 쓸 수 없다 — 수집은 서버(Route Handler)에서 일어나므로 브라우저 요청을
 * 가로채는 Playwright route 로는 잡히지 않는다. 그래서 **DB 적재**를 택했다.
 * (쿼터·네트워크에 의존하지 않고, 화면·API·커서·차트·구독은 전부 그대로 지나간다.)
 *
 * 같은 이유로 **이 스펙은 지역 셀렉트를 바꾸지 않는다** — 수집분이 없는 지역으로 옮기면
 * 서버가 온디맨드 수집을 시도한다. 지역 전환은 API 테스트가 덮는다.
 *
 * 시드에는 실거래가가 없다(시드: 김임대 01011111111 · 박세입 01022222222).
 */

const LAWD_CD = "11200";
const PARK_XI = "신금호파크자이";
const CENTRAS = "센트라스";

type SeedDeal = {
  dealType: "SALE" | "JEONSE" | "WOLSE";
  aptName: string;
  areaM2: number;
  floor: number;
  dealDate: string;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
};

/** 성동구 매매·전세·월세 수집분 — 추이 차트가 그려지도록 3개월에 걸쳐 둔다 */
const SEED: SeedDeal[] = [
  // 매매 — 센트라스 3개월 추이 + 신금호파크자이 1건
  { dealType: "SALE", aptName: CENTRAS, areaM2: 84.96, floor: 9, dealDate: "2026-07-29", price: 249_000, deposit: null, monthlyRent: null },
  { dealType: "SALE", aptName: CENTRAS, areaM2: 84.96, floor: 12, dealDate: "2026-08-11", price: 252_000, deposit: null, monthlyRent: null },
  { dealType: "SALE", aptName: CENTRAS, areaM2: 59.98, floor: 4, dealDate: "2026-09-01", price: 198_000, deposit: null, monthlyRent: null },
  { dealType: "SALE", aptName: PARK_XI, areaM2: 84.9, floor: 15, dealDate: "2026-08-20", price: 231_500, deposit: null, monthlyRent: null },
  // 전세
  { dealType: "JEONSE", aptName: PARK_XI, areaM2: 59.98, floor: 11, dealDate: "2026-07-14", price: null, deposit: 85_000, monthlyRent: 0 },
  { dealType: "JEONSE", aptName: CENTRAS, areaM2: 84.96, floor: 7, dealDate: "2026-08-03", price: null, deposit: 92_000, monthlyRent: 0 },
  // 월세
  { dealType: "WOLSE", aptName: PARK_XI, areaM2: 49.5, floor: 3, dealDate: "2026-08-05", price: null, deposit: 10_000, monthlyRent: 120 },
];

async function seedDeals() {
  await queryTestDb('DELETE FROM "RealTransaction" WHERE "lawdCd" = $1', [LAWD_CD]);
  for (const [index, deal] of SEED.entries()) {
    await queryTestDb(
      `INSERT INTO "RealTransaction"
         (id, "lawdCd", "dealType", "aptName", "areaM2", floor, "dealDate", price, deposit, "monthlyRent", "builtYear", "fetchedAt")
       VALUES ($1, $2, $3::"RealDealType", $4, $5, $6, $7::date, $8, $9, $10, $11, now())`,
      [
        `e2edeal${index}${Date.now()}`,
        LAWD_CD,
        deal.dealType,
        deal.aptName,
        deal.areaM2,
        deal.floor,
        deal.dealDate,
        deal.price,
        deal.deposit,
        deal.monthlyRent,
        2016,
      ],
    );
  }
}

async function loginAsTenant(page: Page) {
  await page.goto("/login");
  await page.getByTestId("demo-login-tenant").click();
  await expect(page).toHaveURL("/tenant");
}

test.beforeEach(async () => {
  await seedDeals();
  await queryTestDb('DELETE FROM "TransactionAlert"');
});

test("E2E① 비로그인 조회 — 유형 탭 · 단지 검색 · 단지 추이", async ({ page }) => {
  await page.goto(`/deals?lawdCd=${LAWD_CD}&type=SALE`);

  // 매매 4건이 최신 거래순으로 뜬다
  await expect(page.getByTestId("deals-card")).toHaveCount(4);
  await expect(page.getByTestId("deals-card-amount").first()).toHaveText("19억 8,000만원");
  await expect(page.getByTestId("deals-card-date").first()).toHaveText("2026.09.01 거래");
  // 외부 호출을 하지 않았으므로 «수집 실패» 안내가 뜨지 않는다
  await expect(page.getByTestId("deals-sync-notice")).toHaveCount(0);

  // 지역 전체 추이 — 7·8·9월 세 점
  await expect(page.getByTestId("deals-trend-row")).toHaveCount(3);

  // 전세 탭 — 2건, 금액은 보증금이다
  await page.getByTestId("deals-tab-JEONSE").click();
  await expect(page.getByTestId("deals-card")).toHaveCount(2);
  await expect(page.getByTestId("deals-card-amount").first()).toHaveText("9억 2,000만원");

  // 월세 탭 — 보증금 / 월세가 함께 보인다
  await page.getByTestId("deals-tab-WOLSE").click();
  await expect(page.getByTestId("deals-card")).toHaveCount(1);
  await expect(page.getByTestId("deals-card-amount").first()).toHaveText(
    "1억원 / 월 120만원",
  );

  // 매매로 돌아가 단지 검색
  await page.getByTestId("deals-tab-SALE").click();
  await page.getByTestId("deals-search-input").fill("파크자이");
  await page.getByTestId("deals-search-submit").click();
  await expect(page.getByTestId("deals-card")).toHaveCount(1);
  await expect(page.getByTestId("deals-filter-label")).toContainText("파크자이");

  // 검색 해제 후 단지를 눌러 추이 보기
  await page.getByTestId("deals-filter-clear").click();
  await expect(page.getByTestId("deals-card")).toHaveCount(4);
  await page.getByTestId("deals-card-apt").first().click();
  await expect(page.getByTestId("deals-filter-label")).toContainText(CENTRAS);
  // 센트라스 매매만 3건 → 추이도 3점
  await expect(page.getByTestId("deals-card")).toHaveCount(3);
  await expect(page.getByTestId("deals-trend-row")).toHaveCount(3);
  // 주소에 반영돼 새로고침해도 유지된다
  await expect(page).toHaveURL(new RegExp(`apt=${encodeURIComponent(CENTRAS)}`));
  await page.reload();
  await expect(page.getByTestId("deals-card")).toHaveCount(3);

  // 알림은 로그인이 필요하다
  await page.getByTestId("deals-alert-open").click();
  await expect(page.getByTestId("deals-alert-login-required")).toBeVisible();
  await expect(page.getByTestId("deals-alert-submit")).toHaveCount(0);
});

test("E2E② 로그인 후 알림 구독 — 생성 · 중복 · 해제", async ({ page }) => {
  await loginAsTenant(page);
  await page.goto(`/deals?lawdCd=${LAWD_CD}&type=JEONSE`);
  await expect(page.getByTestId("deals-card")).toHaveCount(2);

  await page.getByTestId("deals-alert-open").click();
  await expect(page.getByTestId("deals-alert-empty")).toBeVisible();

  // 단지 + 유형을 골라 구독
  await page.getByTestId("deals-alert-apt").selectOption(PARK_XI);
  await page.getByTestId("deals-alert-type").selectOption("JEONSE");
  await page.getByTestId("deals-alert-submit").click();

  await expect(page.getByTestId("deals-alert-message")).toContainText("알려 드립니다");
  await expect(page.getByTestId("deals-alert-item")).toHaveCount(1);
  await expect(page.getByTestId("deals-alert-item")).toContainText(
    `서울 성동구 · ${PARK_XI} · 전세`,
  );

  const rows = await queryTestDb<{ lawdCd: string; aptName: string; dealType: string }>(
    'SELECT "lawdCd", "aptName", "dealType" FROM "TransactionAlert"',
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ lawdCd: LAWD_CD, aptName: PARK_XI, dealType: "JEONSE" });

  // 같은 조건을 다시 누르면 새로 만들지 않는다
  await page.getByTestId("deals-alert-submit").click();
  await expect(page.getByTestId("deals-alert-message")).toContainText("이미 같은 조건");
  await expect(page.getByTestId("deals-alert-item")).toHaveCount(1);
  expect(await queryTestDb('SELECT id FROM "TransactionAlert"')).toHaveLength(1);

  // 지역 전체 구독을 하나 더
  await page.getByTestId("deals-alert-apt").selectOption("__ALL__");
  await page.getByTestId("deals-alert-type").selectOption("__ANY__");
  await page.getByTestId("deals-alert-submit").click();
  await expect(page.getByTestId("deals-alert-item")).toHaveCount(2);

  // 해제
  await page.getByTestId("deals-alert-remove").first().click();
  await expect(page.getByTestId("deals-alert-item")).toHaveCount(1);
  expect(await queryTestDb('SELECT id FROM "TransactionAlert"')).toHaveLength(1);
});
