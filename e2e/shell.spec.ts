import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";

/**
 * T0.5 웹 셸 · 프로필 전환 E2E.
 *
 * 여정: 데모 로그인(임대인) → 홈에 임대인 탭바 → `/me` 프로필 전환 시트 →
 * 세입자로 전환 → **새로고침 없이** 탭바가 세입자 구성으로 바뀐다.
 *
 * 시드(`packages/db/prisma/seed.ts`)는 계정마다 프로필이 유형별 1개씩이라 전환 대상이 없다.
 * `POST /api/profiles`(프로필 추가)는 T0.4 가 만드는 중이라 아직 없으므로,
 * **테스트 DB 에 직접 프로필 한 줄을 넣어** 전환 대상을 만든다(테스트가 끝나면 지운다).
 * 전환 대상이 없을 때의 빈 상태 UI 도 함께 확인한다.
 */

const base = process.env.DATABASE_URL ?? "postgresql://zari:zari@localhost:5432/zari";
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? base.replace(/\/[^/?]+(\?|$)/, "/zari_test$1");

/** 시드의 임대인 계정(김임대) */
const LANDLORD_PHONE = "01011111111";

const LANDLORD_TABS = ["홈", "자산", "중개요청", "커뮤니티", "마이"];
const TENANT_TABS = ["홈", "매물", "환급", "커뮤니티", "마이"];

async function withDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/** 시드 계정에 프로필을 한 개 더 붙인다(Prisma 의 cuid 대신 테스트용 id 를 직접 만든다). */
async function addProfile(phone: string, type: string): Promise<string> {
  return withDb(async (client) => {
    const user = await client.query<{ id: string }>('SELECT id FROM "User" WHERE phone = $1', [
      phone,
    ]);
    const userId = user.rows[0]?.id;
    if (!userId) throw new Error(`시드 계정을 찾지 못했다: ${phone} (pnpm db:seed 확인)`);

    const id = `e2e${randomBytes(10).toString("hex")}`;
    await client.query(
      'INSERT INTO "Profile" (id, "userId", type, "createdAt") VALUES ($1, $2, $3::"ProfileType", NOW())',
      [id, userId, type],
    );
    return id;
  });
}

async function removeProfile(id: string): Promise<void> {
  await withDb(async (client) => {
    await client.query('DELETE FROM "Profile" WHERE id = $1', [id]);
  });
}

/** 하단 탭바의 라벨 목록 */
function tabLabels(page: import("@playwright/test").Page) {
  return page.locator('nav[aria-label="주요 메뉴"] [data-tab]');
}

test("비로그인으로 보호 라우트에 들어가면 /login 으로 보낸다", async ({ page }) => {
  await page.goto("/me");
  // /login 화면 자체는 T0.4 담당이라 아직 404 일 수 있다 — URL 이 바뀌는 것까지만 본다
  await expect(page).toHaveURL(/\/login$/);
});

test("비로그인 홈(/)은 랜딩을 그대로 보여 준다", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // 프로필이 없으면 탭바를 그리지 않는다
  await expect(page.locator('nav[aria-label="주요 메뉴"]')).toHaveCount(0);
});

test("데모 로그인(임대인) → 임대인 탭바 → 프로필 전환 시 새로고침 없이 탭바가 바뀐다", async ({
  page,
}) => {
  const extraProfileId = await addProfile(LANDLORD_PHONE, "TENANT");

  try {
    // 로그인 화면은 T0.4 담당이라 API 로 세션을 만든다(page.request 는 브라우저 쿠키를 공유한다)
    const login = await page.request.post("/api/auth/demo-login", {
      data: { role: "landlord" },
    });
    expect(login.status()).toBe(200);

    // `/` 는 로그인 상태면 활성 프로필의 홈 탭으로 보낸다
    await page.goto("/");
    await expect(page).toHaveURL(/\/landlord$/);
    await expect(tabLabels(page)).toHaveText(LANDLORD_TABS);
    await expect(page.locator('nav[aria-label="주요 메뉴"]')).toHaveAttribute(
      "data-profile-type",
      "LANDLORD",
    );

    // 마이 탭 → /me
    await page.locator('[data-tab="me"]').click();
    await expect(page).toHaveURL(/\/me$/);

    // 지금 문서에 표시를 남겨 두고, 전환 뒤에도 살아 있으면 새로고침이 없었다는 뜻이다
    // (`window` 대신 `globalThis` — e2e 는 DOM 타입이 없는 node tsconfig 로 타입 검사한다)
    await page.evaluate(() => {
      (globalThis as unknown as { __zariNoReload?: boolean }).__zariNoReload = true;
    });

    await page.getByRole("button", { name: "프로필 전환" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.locator('[data-profile-option="TENANT"]').click();

    // 탭바가 세입자 구성으로 바뀐다
    await expect(tabLabels(page)).toHaveText(TENANT_TABS);
    await expect(page.locator('nav[aria-label="주요 메뉴"]')).toHaveAttribute(
      "data-profile-type",
      "TENANT",
    );
    // 페이지 전체 새로고침이 아니었다
    expect(
      await page.evaluate(
        () => (globalThis as unknown as { __zariNoReload?: boolean }).__zariNoReload,
      ),
    ).toBe(true);
    await expect(page).toHaveURL(/\/me$/);

    // 홈 탭의 목적지도 세입자 홈으로 바뀐다
    // (클릭 대신 href 를 본다 — next dev 오버레이가 화면 좌하단을 덮어 탭 클릭을 가로챈다)
    await expect(page.locator('[data-tab="home"]')).toHaveAttribute("href", "/tenant");
  } finally {
    await removeProfile(extraProfileId);
  }
});

test("전환할 프로필이 하나뿐이면 빈 상태와 유형 추가 안내를 보여 준다", async ({ page }) => {
  const login = await page.request.post("/api/auth/demo-login", { data: { role: "realtor" } });
  expect(login.status()).toBe(200);

  await page.goto("/me");
  await page.getByRole("button", { name: "프로필 전환" }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("전환할 다른 프로필이 없습니다.")).toBeVisible();
  // 새 유형 추가는 T0.4 의 /onboarding 으로 보낸다(머지 전이면 404 가 정상)
  await expect(sheet.getByRole("link", { name: /새 유형 추가/ })).toHaveAttribute(
    "href",
    "/onboarding",
  );
});
