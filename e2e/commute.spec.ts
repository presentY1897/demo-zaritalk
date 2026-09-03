import { expect, test, type Page } from "@playwright/test";
import { mockAddressSearch, pickAddress } from "./address";
import { queryTestDb, trackedEventCount } from "./db";

/**
 * T3.5 통합(E2E) — 근무지 등록 → 매물 상세에서 「내 근무지까지」 조회 → 목록 통근 배지.
 *
 * ## 외부 API 를 어떻게 다루나 — **캐시를 미리 넣는다**
 *
 * 통근 조회는 화면 → `POST /api/commute`(우리 서버) → 카카오모빌리티 순으로 흐른다.
 * `page.route` 는 **브라우저가 보내는 요청**만 가로챈다 — 우리 서버가 서버에서 부르는
 * 카카오는 가로챌 수 없다. 그래서 브라우저 쪽에서 `/api/commute` 를 통째로 가짜 응답으로
 * 덮으면 ①우리 라우트가 한 줄도 돌지 않고 ②`CommuteCache` 가 비어 있어 **목록 배지가
 * 켜지지 않는다**(배지는 DB 캐시를 읽는다). 여정의 절반이 사라진다.
 *
 * 그래서 반대로 간다 — 조회 직전에 **`CommuteCache` 행을 미리 넣어** 라우트가 캐시 히트로
 * 응답하게 한다(task 가 허용한 "캐시 선적재"). 그러면
 *
 * - `POST /api/commute` 의 권한·조회·응답 경로가 **실제로 돈다**(외부 호출은 0건),
 * - 상세 시트가 값을 받아 그리는 것도, 목록 배지가 같은 행을 읽어 켜지는 것도 확인된다.
 *
 * 캐시 미스 → 외부 호출 → upsert 경로(부분 결과·TTL 만료·키 없음 포함)는 Vitest 가
 * `fetch` 를 mock 해 덮는다(`app/api/commute/route.test.ts` · `features/commute/*.test.ts`).
 * 모의 대중교통 산식의 결정성도 그쪽(`features/commute/transit.test.ts`)이 지킨다.
 *
 * 지도(카카오 SDK)를 막는 이유는 `e2e/search.spec.ts` 상단 주석과 같다.
 */

/** 건대입구 근처 — 다른 스펙이 쓰는 성수·강남·행당과 겹치지 않는 자리 */
const KONDAE = { lat: 37.5385, lng: 127.0823 };
/** 위 건물만 담는 영역 */
const AROUND_KONDAE = "37.52,127.07,37.55,127.10";

/** 미리 넣어 둘 캐시 값 — 화면 단언이 이 숫자를 그대로 본다 */
const CACHED_TRANSIT_MINUTES = 33;
const CACHED_DRIVING_MINUTES = 21;

async function blockKakaoSdk(page: Page): Promise<void> {
  await page.route("**/dapi.kakao.com/**", (route) => route.abort());
}

/** (호실, 근무지) 캐시 행을 직접 넣는다 — 외부 제공자가 답한 상태를 만든다 */
async function preloadCommuteCache(unitId: string, workplaceId: string): Promise<void> {
  await queryTestDb(
    `INSERT INTO "CommuteCache"
       ("id","unitId","workplaceId","transitMinutes","transitDetail","drivingMinutes","drivingDetail","fetchedAt")
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb, NOW())
     ON CONFLICT ("unitId","workplaceId") DO UPDATE SET
       "transitMinutes" = EXCLUDED."transitMinutes",
       "transitDetail"  = EXCLUDED."transitDetail",
       "drivingMinutes" = EXCLUDED."drivingMinutes",
       "drivingDetail"  = EXCLUDED."drivingDetail",
       "fetchedAt"      = NOW()`,
    [
      `e2e-commute-${unitId}-${workplaceId}`,
      unitId,
      workplaceId,
      CACHED_TRANSIT_MINUTES,
      // 대중교통은 모의 제공자에서 나왔다(D9) — 화면이 「모의」 배지를 붙이는 근거
      JSON.stringify({ provider: "mock-transit", mock: true, kind: "TRANSIT" }),
      CACHED_DRIVING_MINUTES,
      JSON.stringify({ provider: "kakao-mobility", mock: false, durationSec: 1260 }),
    ],
  );
}

test("E2E 근무지 등록 → 매물 상세에서 통근 조회 → 목록 배지에 반영", async ({ page, browser }) => {
  await blockKakaoSdk(page);

  /* ---- 임대인: 통근 조회 대상이 될 매물 하나를 만든다 ---- */
  await page.goto("/login");
  await page.getByTestId("demo-login-landlord").click();
  await expect(page).toHaveURL("/landlord");

  const buildingResponse = await page.request.post("/api/buildings", {
    data: { name: "통근뷰", address: "서울 광진구 능동로 120", ...KONDAE },
  });
  expect(buildingResponse.status()).toBe(201);
  const { building } = (await buildingResponse.json()) as { building: { id: string } };

  const unitResponse = await page.request.post(`/api/buildings/${building.id}/units`, {
    data: { label: "501호", floor: 5, areaM2: 33.1, rooms: 2 },
  });
  expect(unitResponse.status()).toBe(201);
  const { unit } = (await unitResponse.json()) as { unit: { id: string } };

  const listingResponse = await page.request.post("/api/listings", {
    data: { unitId: unit.id, dealType: "WOLSE", deposit: 20000000, monthlyRent: 700000 },
  });
  expect(listingResponse.status()).toBe(201);
  const { listing } = (await listingResponse.json()) as { listing: { id: string } };

  /* ---- 세입자: 근무지를 등록한다(T3.4) ---- */
  const tenantContext = await browser.newContext();
  const tenant = await tenantContext.newPage();
  await blockKakaoSdk(tenant);
  await mockAddressSearch(tenant);

  await tenant.goto("/login");
  await tenant.getByTestId("demo-login-tenant").click();
  await expect(tenant).toHaveURL("/tenant");

  await tenant.getByTestId("tenant-workplace-link").click();
  await expect(tenant).toHaveURL("/tenant/workplaces");
  // 시드에 「회사」 한 곳이 이미 있다
  await expect(tenant.getByTestId("workplace-card")).toHaveCount(1);

  await tenant.getByTestId("workplace-add").click();
  await pickAddress(tenant, "workplace-address", "왕십리");
  // 장소명이 라벨로 채워진다(T3.4)
  await expect(tenant.getByTestId("workplace-label")).toHaveValue("왕십리역");
  await tenant.getByTestId("workplace-submit").click();
  await expect(tenant.getByTestId("workplace-card")).toHaveCount(2);

  const workplaces = (await (await tenant.request.get("/api/workplaces")).json()) as {
    workplaces: { id: string; label: string }[];
  };
  const registered = workplaces.workplaces.find((workplace) => workplace.label === "왕십리역");
  expect(registered).toBeTruthy();

  /* ---- 매물 상세: 등록한 근무지가 통근 조회 기준점으로 나온다 ---- */
  await tenant.goto(`/listings/${listing.id}`);

  const cta = tenant.getByTestId("listing-commute-cta");
  // 로그인 + 근무지 있음 = 조회할 수 있는 상태
  await expect(cta).toHaveAttribute("data-commute-state", "ready");
  await cta.click();

  const rows = tenant.getByTestId("listing-commute-workplace");
  await expect(rows).toHaveCount(2);
  const row = rows.filter({ hasText: "왕십리역" });
  // 아직 조회 전이라 값이 없다
  await expect(row).toHaveAttribute("data-commute-loaded", "false");
  await expect(rows.filter({ hasText: "회사" })).toHaveAttribute("data-commute-loaded", "false");

  /* ---- 조회: 외부를 부르지 않도록 캐시를 미리 넣어 둔다(파일 상단 주석) ---- */
  await preloadCommuteCache(unit.id, registered!.id);
  await row.getByTestId("listing-commute-fetch").click();

  await expect(row).toHaveAttribute("data-commute-loaded", "true");
  await expect(row.getByTestId("listing-commute-transit")).toHaveText(
    `대중교통 ${CACHED_TRANSIT_MINUTES}분`,
  );
  await expect(row.getByTestId("listing-commute-driving")).toHaveText(
    `자동차 ${CACHED_DRIVING_MINUTES}분`,
  );
  // 대중교통이 모의라는 사실을 화면이 밝힌다(D9)
  await expect(row.getByTestId("listing-commute-mock")).toBeVisible();
  // 조회하지 않은 근무지는 그대로 비어 있다 — 누른 근무지만 부른다
  await expect(rows.filter({ hasText: "회사" })).toHaveAttribute("data-commute-loaded", "false");

  await tenant.getByRole("dialog").getByRole("button", { name: "확인" }).click();

  /* ---- 트래킹(T0.7) — 전송이 400ms 배치라 폴링으로 기다린다.
         **페이지를 떠나기 전에** 확인한다: 전체 새로고침(`goto`)이 끼면 아직 큐에 있던
         이벤트가 pagehide 플러시 타이밍에 걸려 유실될 수 있다. ---- */
  await expect.poll(() => trackedEventCount("listing_commute_click")).toBeGreaterThan(0);
  await expect.poll(() => trackedEventCount("commute_lookup_complete")).toBeGreaterThan(0);

  /* ---- 목록: 같은 캐시 행이 배지로 켜진다 ---- */
  await tenant.goto(`/search?bounds=${AROUND_KONDAE}`);
  const card = tenant.getByTestId("listing-card").filter({ hasText: "통근뷰" });
  await expect(card).toBeVisible();
  // 기준 근무지를 고르기 전에는 배지가 없다
  await expect(card.getByTestId("listing-commute-badge")).toHaveCount(0);

  await tenant.getByTestId("search-commute-workplace").selectOption(registered!.id);
  await expect(card.getByTestId("listing-commute-badge")).toHaveText(
    `왕십리역까지 대중교통 ${CACHED_TRANSIT_MINUTES}분 (모의)`,
  );

  /* ---- 뒷정리: 시드 상태로 되돌린다 ----
     E2E 는 시드 DB 를 **모든 스펙이 이어서** 쓴다(globalSetup 에서 한 번만 시드한다).
     `listing.spec.ts` E2E② 는 "시드 세입자의 근무지는 1곳" 을 전제하므로, 여기서 더한 근무지를
     남겨 두면 알파벳 순서상 뒤에 도는 그 스펙이 깨진다. 삭제하면 `CommuteCache` 도 cascade 로
     함께 사라진다(스키마) — 이 스펙이 만든 캐시 행까지 같이 치워진다. */
  const removed = await tenant.request.delete(`/api/workplaces/${registered!.id}`);
  expect(removed.status()).toBe(204);

  await tenantContext.close();
});

test("비로그인은 통근 조회 API 를 부를 수 없다 — 화면도 로그인으로 안내한다", async ({
  page,
}) => {
  await blockKakaoSdk(page);

  const res = await page.request.post("/api/commute", {
    data: { unitId: "cmf0nope", workplaceId: "cmf0nope" },
  });
  expect(res.status()).toBe(401);
  expect((await res.json()).error.code).toBe("UNAUTHORIZED");
});
