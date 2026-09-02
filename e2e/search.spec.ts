import { expect, test, type Page } from "@playwright/test";
import { trackedEventCount } from "./db";

/**
 * T3.2·T3.3 통합(E2E) — 매물 등록 → `/search` 핀·리스트 노출 → 상세 진입.
 *
 * ① 임대인이 매물을 등록하면 **비로그인 방문자**의 `/search` 에 보이고, 필터·영역이 리스트와
 *    동기화되며, 카드에서 공개 상세로 들어가 메타·JSON-LD 까지 확인한다.
 * ② 없는 매물 상세는 404, 종료 매물은 열리되 색인이 막힌다.
 *
 * ## 지도(카카오 SDK)를 E2E 에서 어떻게 다루나 — **일부러 막는다**
 *
 * 카카오 JS 키는 **개발자센터에 등록한 도메인에서만** 동작한다. 등록돼 있는 것은
 * `localhost:3000`·`localhost:3100`·`127.0.0.1:3100`·`demo-zaritalk.vercel.app` 이고,
 * 이 스펙이 도는 포트는 그 목록에 없을 수 있다(`E2E_PORT` 로 바뀐다). 게다가 지도 타일은
 * 외부 네트워크·쿼터에 매달린 리소스라 단언에 넣으면 여정 전체가 남의 사정에 흔들린다.
 *
 * 그래서 `dapi.kakao.com` **요청 자체를 막고**(`blockKakaoSdk`) 지도가 없는 상태로 여정을
 * 지나간다. `KakaoMap` 은 그 경우 안내 면으로 떨어지되 **컨테이너와 `data-pin-count` 는 그대로
 * 렌더**하도록 만들어져 있으므로, 검증은 ①지도 컨테이너 존재 ②핀 개수(`data-pin-count`)
 * ③리스트 카드로 한다. 실제 타일·마커 렌더는 등록된 도메인(로컬 3000·배포)에서 눈으로 본다.
 * (같은 이유로 T3.1 은 카카오 주소 검색을 프록시 앞에서 가로챈다 — `e2e/address.ts` 주석.)
 */

const SEONGSU = { lat: 37.54453, lng: 127.05599 };
const GANGNAM = { lat: 37.49794, lng: 127.02762 };

/** 성수만 담고 강남은 담지 않는 영역 */
const AROUND_SEONGSU = "37.53,127.04,37.56,127.07";
/** 성수·강남 둘 다 담고 시드 건물(행당 37.56152)은 담지 않는 영역 — 핀 개수를 셀 때 쓴다 */
const AROUND_BOTH = "37.49,127.02,37.55,127.06";

async function blockKakaoSdk(page: Page): Promise<void> {
  await page.route("**/dapi.kakao.com/**", (route) => route.abort());
}

async function loginAsLandlord(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("demo-login-landlord").click();
  await expect(page).toHaveURL("/landlord");
}

/** 좌표를 지정한 건물 + 호실 1개를 API 로 만든다(세션 쿠키는 브라우저 컨텍스트가 들고 있다) */
async function createUnit(
  page: Page,
  input: { name: string; lat: number; lng: number; label: string; rooms: number; areaM2: number },
): Promise<string> {
  const buildingResponse = await page.request.post("/api/buildings", {
    data: {
      name: input.name,
      address: `서울 테스트구 ${input.name}로 1`,
      lat: input.lat,
      lng: input.lng,
    },
  });
  expect(buildingResponse.status()).toBe(201);
  const { building } = (await buildingResponse.json()) as { building: { id: string } };

  const unitResponse = await page.request.post(`/api/buildings/${building.id}/units`, {
    data: { label: input.label, floor: 3, areaM2: input.areaM2, rooms: input.rooms },
  });
  expect(unitResponse.status()).toBe(201);
  const { unit } = (await unitResponse.json()) as { unit: { id: string } };
  return unit.id;
}

test("E2E① 매물 등록 → 비로그인 /search 노출 → 필터·영역 동기화 → 상세 진입", async ({
  page,
  browser,
}) => {
  await blockKakaoSdk(page);
  await loginAsLandlord(page);

  // 이 스펙이 쓸 호실 두 개를 직접 만든다 —
  // 시드 101호는 앞선 스펙(listing.spec)이 이미 건드리므로 상태를 빌리지 않는다
  const seongsuUnit = await createUnit(page, {
    name: "성수뷰",
    ...SEONGSU,
    label: "301호",
    rooms: 1,
    areaM2: 23.1,
  });
  const gangnamUnit = await createUnit(page, {
    name: "강남뷰",
    ...GANGNAM,
    label: "1201호",
    rooms: 2,
    areaM2: 44.2,
  });

  // ---- 등록은 화면으로 한다(T3.1 폼) ----
  await page.goto(`/landlord/units/${seongsuUnit}/listing`);
  await page.getByTestId("listing-deal-WOLSE").click();
  await page.getByTestId("listing-deposit").fill("10000000");
  await page.getByTestId("listing-monthly-rent").fill("500000");
  await page.getByTestId("listing-description").fill("성수역 도보 5분, 채광 좋음");
  await page.getByTestId("listing-submit").click();
  await expect(page.getByTestId("listing-status-badge")).toHaveText("공개 중");

  // 강남 전세는 API 로 — 필터·영역을 가르기 위한 두 번째 핀이다
  const jeonse = await page.request.post("/api/listings", {
    data: { unitId: gangnamUnit, dealType: "JEONSE", deposit: 250000000, monthlyRent: 0 },
  });
  expect(jeonse.status()).toBe(201);

  // ---- 비로그인 방문자로 /search ----
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await blockKakaoSdk(guestPage);

  await guestPage.goto("/search");
  // 로그인으로 튕기지 않는다
  await expect(guestPage).toHaveURL(/\/search/);
  expect((await guestPage.request.get("/api/me")).status()).toBe(401);

  const cards = guestPage.getByTestId("listing-card");
  await expect(cards.filter({ hasText: "성수뷰" })).toBeVisible();
  await expect(cards.filter({ hasText: "강남뷰" })).toBeVisible();

  // 카드가 서버가 만든 가격 문자열을 그대로 쓴다
  await expect(cards.filter({ hasText: "성수뷰" }).getByTestId("listing-card-price")).toHaveText(
    "월세 1,000만/50만",
  );

  // 두 매물만 담는 영역으로 들어가 핀 개수를 센다
  // (다른 스펙이 만든 매물에 개수가 흔들리지 않게 영역으로 가둔다)
  await guestPage.goto(`/search?bounds=${AROUND_BOTH}`);
  const map = guestPage.getByTestId("search-map");
  await expect(map).toBeVisible();
  // 지도 컨테이너와 핀 데이터만 본다 — 타일·마커는 단언하지 않는다(파일 상단 주석)
  await expect(map).toHaveAttribute("data-pin-count", "2");
  await expect(guestPage.getByTestId("search-result-count")).toHaveText("2개 매물");

  // ---- 필터: 전세만 ----
  await guestPage.getByTestId("search-filter-open").click();
  await guestPage.getByTestId("search-filter-deal-JEONSE").click();
  await guestPage.getByTestId("search-filter-apply").click();

  await expect(cards.filter({ hasText: "강남뷰" })).toBeVisible();
  await expect(cards.filter({ hasText: "성수뷰" })).toHaveCount(0);
  await expect(map).toHaveAttribute("data-pin-count", "1");

  // ---- 영역: 성수만 담는 bounds 로 들어가면 강남은 빠진다 ----
  await guestPage.goto(`/search?bounds=${AROUND_SEONGSU}`);
  await expect(cards.filter({ hasText: "성수뷰" })).toBeVisible();
  await expect(cards.filter({ hasText: "강남뷰" })).toHaveCount(0);
  await expect(guestPage.getByTestId("search-result-count")).toHaveText("1개 매물");

  // ---- 스냅 시트: 손잡이로 지도를 접었다 편다 ----
  const searchScreen = guestPage.getByTestId("search-page");
  await expect(searchScreen).toHaveAttribute("data-snap", "half");
  await guestPage.getByTestId("search-sheet-handle").click();
  await expect(searchScreen).toHaveAttribute("data-snap", "full");

  // ---- 상세 진입 ----
  await cards.filter({ hasText: "성수뷰" }).click();
  await expect(guestPage).toHaveURL(/\/listings\/[a-z0-9]+$/);

  await expect(guestPage.getByTestId("listing-detail-price")).toHaveText("월세 1,000만/50만");
  await expect(guestPage.getByTestId("listing-detail-title")).toContainText("성수뷰 301호");
  await expect(guestPage.getByTestId("listing-detail-status")).toHaveText("공개 중");
  await expect(guestPage.getByTestId("listing-detail-description")).toContainText("성수역 도보 5분");
  // 비로그인이라 「내 근무지까지」는 로그인 유도 자리다(T3.5 가 실제 조회를 붙인다)
  await expect(guestPage.getByTestId("listing-commute-cta")).toHaveAttribute(
    "data-commute-state",
    "anonymous",
  );

  // 문의는 더미다
  await guestPage.getByTestId("listing-inquiry").click();
  await expect(guestPage.getByTestId("listing-inquiry-dummy")).toBeVisible();
  await guestPage.getByRole("dialog").getByRole("button", { name: "확인" }).click();

  // ---- 메타·OG·JSON-LD ----
  await expect(guestPage.locator('head meta[property="og:title"]')).toHaveAttribute(
    "content",
    /성수뷰 301호 월세 1,000만\/50만/,
  );
  // 공개 중(OPEN)이면 색인을 연다 — 종료 매물의 noindex 와 대비된다(E2E②)
  await expect(guestPage.locator('head meta[name="robots"]')).toHaveAttribute("content", /^index/);

  const jsonLd = JSON.parse(
    (await guestPage.getByTestId("listing-jsonld").textContent()) ?? "null",
  ) as {
    "@type": string;
    mainEntity: { "@type": string; price: number; availability: string; itemOffered: { "@type": string } };
  };
  expect(jsonLd["@type"]).toBe("RealEstateListing");
  expect(jsonLd.mainEntity["@type"]).toBe("Offer");
  expect(jsonLd.mainEntity.price).toBe(500000);
  expect(jsonLd.mainEntity.availability).toBe("https://schema.org/InStock");
  expect(jsonLd.mainEntity.itemOffered["@type"]).toBe("Apartment");

  // ---- 트래킹(T0.7) — 전송이 배치라 폴링으로 기다린다 ----
  await expect.poll(() => trackedEventCount("listing_search_view")).toBeGreaterThan(0);
  await expect.poll(() => trackedEventCount("listing_card_click")).toBeGreaterThan(0);
  await expect.poll(() => trackedEventCount("listing_detail_view")).toBeGreaterThan(0);

  await guest.close();
});

test("E2E② 없는 매물은 404 · 종료 매물은 열리되 색인은 막힌다", async ({ page, browser }) => {
  await blockKakaoSdk(page);
  await loginAsLandlord(page);

  const unitId = await createUnit(page, {
    name: "종료뷰",
    ...SEONGSU,
    label: "401호",
    rooms: 1,
    areaM2: 20,
  });
  const created = await page.request.post("/api/listings", {
    data: { unitId, dealType: "WOLSE", deposit: 5000000, monthlyRent: 300000 },
  });
  const { listing } = (await created.json()) as { listing: { id: string } };

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await blockKakaoSdk(guestPage);

  // 없는 매물 — Next 의 404 화면
  const missing = await guestPage.goto("/listings/cmf0doesnotexist");
  expect(missing?.status()).toBe(404);

  // 아직 공개 중이면 탐색에 뜬다
  await guestPage.goto(`/search?bounds=${AROUND_SEONGSU}`);
  await expect(guestPage.getByTestId("listing-card").filter({ hasText: "종료뷰" })).toBeVisible();

  // 임대인이 매물을 종료하면
  const closed = await page.request.patch(`/api/listings/${listing.id}`, {
    data: { status: "CLOSED" },
  });
  expect(closed.status()).toBe(200);

  // 탐색에서는 사라지고
  await guestPage.goto(`/search?bounds=${AROUND_SEONGSU}`);
  await expect(guestPage.getByTestId("listing-card").filter({ hasText: "종료뷰" })).toHaveCount(0);

  // 상세는 열리되(공유된 링크가 404 가 되지 않는다) 배너 + noindex 다
  await guestPage.goto(`/listings/${listing.id}`);
  await expect(guestPage.getByTestId("listing-detail-status")).toHaveText("종료");
  await expect(guestPage.getByTestId("listing-detail-banner")).toContainText("종료된 매물");
  await expect(guestPage.locator('head meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );

  await guest.close();
});
