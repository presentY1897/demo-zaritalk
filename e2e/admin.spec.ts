/**
 * E2E — 어드민 백오피스 (T6.3).
 *
 * ## 어드민 앱을 **브라우저로** 몰았다 — 지금까지와 다른 선택이다
 *
 * T2.5(환급 심사)·T4.2(신고 처리)는 "어드민은 별도 앱(3001)이고 `playwright.config.ts` 의
 * `webServer` 는 web 하나만 띄운다" 는 이유로 어드민 화면을 브라우저로 몰지 않고 web API 로
 * 검증했다. 그 판단은 그때 맞았다 — 어드민 화면이 **규칙을 하나도 들고 있지 않았기** 때문이다.
 *
 * T6.3 은 다르다. 이 task 가 만든 것이 바로 **어드민 앱의 문(인증 게이트)** 이고,
 * 그것은 web API 를 아무리 찔러도 검증되지 않는다. "로그인 안 한 브라우저가 어드민 주소를
 * 열었을 때 무엇이 보이는가" 가 곧 이 task 의 완료 기준이라, 화면으로 확인해야 한다.
 *
 * `playwright.config.ts` 는 이 task 소유가 아니라 손대지 않았다. 대신 **이 스펙이 어드민
 * dev 서버를 직접 띄운다**(다른 포트, 끝나면 프로세스 그룹째 종료). web 은 config 가 띄운
 * 서버를 그대로 쓰고, 어드민에게 그 주소를 `NEXT_PUBLIC_WEB_URL` 로 넘긴다.
 *
 * ## 패스코드
 * web·admin `.env.local` 에 들어 있는 `CRON_SECRET` 이 기본 패스코드다
 * (`ADMIN_PASSWORD` → `ADMIN_API_SECRET` → `CRON_SECRET` 순으로 떨어진다 — `.env.example` 참고).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { expect, test } from "@playwright/test";
import { queryTestDb } from "./db";

const WEB_PORT = Number(process.env.E2E_PORT ?? 3100);
const WEB_BASE = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${WEB_PORT}`;
const ADMIN_PORT = Number(process.env.ADMIN_E2E_PORT ?? WEB_PORT + 1);
const ADMIN_BASE = `http://127.0.0.1:${ADMIN_PORT}`;

const ADMIN_PHONE = "01000000000";
const PASSCODE =
  process.env.ADMIN_PASSWORD ??
  process.env.ADMIN_API_SECRET ??
  process.env.CRON_SECRET ??
  "local-dev-cron-secret";

let adminServer: ChildProcess | undefined;
let adminLog = "";

async function waitForAdmin(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${ADMIN_BASE}/users`, { signal: AbortSignal.timeout(10_000) });
      if (response.status < 500) return;
    } catch {
      // 아직 안 떴다 — 계속 기다린다
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`어드민 서버(${ADMIN_BASE})가 뜨지 않았습니다.\n${adminLog.slice(-4000)}`);
}

test.describe.configure({ mode: "serial" });

/**
 * 어드민은 **데스크톱 셸**이다(T0.5) — 사이드바 + 넓은 표. 전역 설정의 Pixel 5(393px)로 몰면
 * 사이드바가 위로 접혀 표·탭 위를 덮고, 실제 운영 화면과 다른 것을 검증하게 된다.
 * 그래서 이 스펙만 데스크톱 뷰포트를 쓴다.
 */
test.use({
  viewport: { width: 1440, height: 900 },
  isMobile: false,
  hasTouch: false,
  deviceScaleFactor: 1,
});

test.beforeAll(async () => {
  // 클린 체크아웃(CI)에서는 styled-system 이 없으므로 panda codegen 을 함께 돌린다
  // — `playwright.config.ts` 의 web webServer 와 같은 이유다.
  adminServer = spawn(
    `pnpm --filter @zari/admin exec panda codegen && pnpm --filter @zari/admin exec next dev -p ${ADMIN_PORT}`,
    {
      shell: true,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NEXT_PUBLIC_WEB_URL: WEB_BASE,
        CRON_SECRET: PASSCODE,
        PORT: String(ADMIN_PORT),
      },
    },
  );
  adminServer.stdout?.on("data", (chunk) => (adminLog += String(chunk)));
  adminServer.stderr?.on("data", (chunk) => (adminLog += String(chunk)));

  await waitForAdmin(300_000);
});

test.afterAll(async () => {
  if (adminServer?.pid) {
    try {
      // detached 로 띄웠으므로 프로세스 **그룹째** 죽인다(next dev 는 자식을 남긴다)
      process.kill(-adminServer.pid, "SIGTERM");
    } catch {
      adminServer.kill("SIGTERM");
    }
  }
});

/**
 * E2E① — **인증 게이트**. 이 task 가 닫은 구멍을 화면에서 확인한다.
 */
test("E2E① 어드민 앱은 로그인 없이 열리지 않는다 → 로그인 → 조회 화면 → 로그아웃", async ({
  page,
}) => {
  test.setTimeout(240_000);

  // ── 비로그인: 조회 화면 주소를 직접 열어도 로그인 폼만 나온다
  await page.goto(`${ADMIN_BASE}/users`);
  await expect(page.getByTestId("admin-login-submit")).toBeVisible();
  await expect(page.getByTestId("admin-user-row")).toHaveCount(0);
  await expect(page.getByTestId("admin-identity")).toHaveCount(0);
  // 사이드바(메뉴)조차 그리지 않는다 — 게이트가 셸 바깥에 있다
  await expect(page.getByRole("navigation", { name: "백오피스 메뉴" })).toHaveCount(0);

  // ── 기존 화면(T2.5 환급 심사·T1.4 크론)도 같은 게이트 뒤에 있다
  for (const path of ["/", "/refunds", "/reports", "/cron", "/deals"]) {
    await page.goto(`${ADMIN_BASE}${path}`);
    await expect(page.getByTestId("admin-login-submit")).toBeVisible();
  }

  // ── 서류 뷰어 프록시(라우트 핸들러)는 레이아웃을 거치지 않으므로 스스로 막는다
  const proxy = await page.request.get(
    `${ADMIN_BASE}/refunds/documents?applicationId=x&documentId=y`,
  );
  expect(proxy.status()).toBe(401);

  // ── 패스코드가 틀리면 들어가지 못한다
  await page.goto(`${ADMIN_BASE}/users`);
  await page.getByTestId("admin-login-phone").fill(ADMIN_PHONE);
  await page.getByTestId("admin-login-passcode").fill("wrong-passcode");
  await page.getByTestId("admin-login-submit").click();
  await expect(page.getByTestId("admin-login-error")).toBeVisible();
  await expect(page.getByTestId("admin-user-row")).toHaveCount(0);

  // ── 관리자가 아닌 번호도 마찬가지(패스코드가 맞아도)
  await page.getByTestId("admin-login-phone").fill("01011111111"); // 시드 임대인
  await page.getByTestId("admin-login-passcode").fill(PASSCODE);
  await page.getByTestId("admin-login-submit").click();
  await expect(page.getByTestId("admin-login-error")).toBeVisible();

  // ── 관리자 번호 + 패스코드 → 통과
  await page.getByTestId("admin-login-phone").fill(ADMIN_PHONE);
  await page.getByTestId("admin-login-passcode").fill(PASSCODE);
  await page.getByTestId("admin-login-submit").click();

  await expect(page.getByTestId("admin-identity")).toBeVisible();
  await expect(page.getByTestId("admin-identity")).toContainText("관리자");
  await expect(page.getByTestId("admin-user-row").first()).toBeVisible();
  // 전화번호는 마스킹된 채로만 화면에 나온다
  await expect(page.locator("body")).toContainText("010-****-");
  await expect(page.locator("body")).not.toContainText("01011111111");

  // 세션은 web 의 Session 레코드다 — DB 에 진짜로 한 줄이 생겼다
  const sessions = await queryTestDb<{ count: string }>(
    `SELECT count(*)::text AS count FROM "Session" s
       JOIN "User" u ON u.id = s."userId"
      WHERE u."isAdmin" = true`,
  );
  expect(Number(sessions[0]?.count ?? 0)).toBeGreaterThan(0);

  // ── 로그인한 뒤에는 기존 화면도 그대로 열린다(시크릿 경로를 깨지 않았다)
  await page.goto(`${ADMIN_BASE}/refunds`);
  await expect(page.getByTestId("admin-identity")).toBeVisible();
  await expect(page.getByRole("heading", { name: "환급 심사" })).toBeVisible();
  await page.goto(`${ADMIN_BASE}/cron`);
  await expect(page.getByRole("heading", { name: "원장 크론" })).toBeVisible();

  // ── 로그아웃하면 다시 잠긴다
  await page.goto(`${ADMIN_BASE}/users`);
  await page.getByTestId("admin-logout").click();
  await expect(page.getByTestId("admin-login-submit")).toBeVisible();
  await page.goto(`${ADMIN_BASE}/leases`);
  await expect(page.getByTestId("admin-login-submit")).toBeVisible();
});

/**
 * E2E② — 조회 화면 다섯 개의 **서버 페이지네이션·필터**가 화면에서 동작하는지.
 */
test("E2E② 조회 화면 — 필터와 서버 페이지네이션이 URL 로 동작한다", async ({ page }) => {
  test.setTimeout(240_000);

  // 이벤트 화면에 그릴 것이 있도록 트래킹 이벤트를 하나 심는다(공개 수집 API)
  const tracked = await page.request.post(`${WEB_BASE}/api/track`, {
    data: { name: "page_view", path: "/e2e-admin", props: { from: "e2e" } },
  });
  expect(tracked.ok()).toBe(true);

  await page.goto(`${ADMIN_BASE}/users`);
  await page.getByTestId("admin-login-phone").fill(ADMIN_PHONE);
  await page.getByTestId("admin-login-passcode").fill(PASSCODE);
  await page.getByTestId("admin-login-submit").click();
  await expect(page.getByTestId("admin-identity")).toBeVisible();

  // ── /users : 검색 + 페이지 크기 1로 잘라 다음 페이지로 이동
  const allUsers = await page.getByTestId("admin-user-row").count();
  expect(allUsers).toBeGreaterThan(1);

  await page.getByTestId("filter-input-q").fill("김임대");
  await page.getByRole("button", { name: "검색" }).click();
  await expect(page.getByTestId("admin-user-row")).toHaveCount(1);

  await page.goto(`${ADMIN_BASE}/users?pageSize=1&page=1`);
  await expect(page.getByTestId("admin-user-row")).toHaveCount(1);
  const firstName = await page.getByTestId("admin-user-row").first().innerText();
  await page.getByTestId("admin-page-next").click();
  await expect(page.getByTestId("admin-user-row")).toHaveCount(1);
  // 다음 페이지는 앞 페이지와 **다른 행**이다 — 경계에서 중복이 없다
  expect(await page.getByTestId("admin-user-row").first().innerText()).not.toBe(firstName);
  await expect(page.getByTestId("admin-page-info")).toContainText("2 /");

  // ── /leases : 상태 탭 + 연체 드릴다운
  await page.goto(`${ADMIN_BASE}/leases`);
  await expect(page.getByTestId("admin-lease-row").first()).toBeVisible();
  await page.getByTestId("filter-overdue").click();
  await expect(page).toHaveURL(/overdue=1/);
  await expect(page.getByTestId("admin-lease-row").first()).toContainText("연체");

  // ── /charges : 연체 탭 → 계약 드릴다운
  await page.goto(`${ADMIN_BASE}/charges`);
  await page.getByTestId("filter-OVERDUE").click();
  await expect(page).toHaveURL(/status=OVERDUE/);
  await expect(page.getByTestId("admin-charge-row").first()).toBeVisible();
  await page.getByRole("link", { name: "이 계약만" }).first().click();
  await expect(page.getByTestId("admin-charge-drilldown")).toBeVisible();

  // ── /messages : 알림톡 미리보기 + 열람 필터
  await page.goto(`${ADMIN_BASE}/messages`);
  await expect(page.getByTestId("admin-message-preview").first()).toBeVisible();
  await page.getByTestId("filter-unopened").click();
  await expect(page).toHaveURL(/opened=unopened/);

  // ── /events : 시간대 차트(24칸) + 방금 심은 이벤트
  await page.goto(`${ADMIN_BASE}/events`);
  await expect(page.getByTestId("admin-hourly-chart")).toBeVisible();
  await expect(page.getByTestId("admin-hourly-bar")).toHaveCount(24);
  await expect(page.getByTestId("admin-event-row").first()).toBeVisible();
  await page.getByTestId("filter-page_view").click();
  await expect(page).toHaveURL(/name=page_view/);
  await expect(page.getByTestId("admin-event-row").first()).toContainText("page_view");
});

/**
 * E2E③ — web 의 `/api/admin/*` 가드. 화면 뒤에 있는 마지막 방어선이다.
 */
test("E2E③ 어드민 API 는 세션 없이·비어드민 세션으로 열리지 않는다", async ({ request }) => {
  for (const path of ["/api/admin/users", "/api/admin/leases", "/api/admin/charges", "/api/admin/messages", "/api/admin/events"]) {
    const response = await request.get(`${WEB_BASE}${path}`);
    expect(response.status()).toBe(401);
  }

  // 시드 임대인으로 로그인한 뒤에는 401 이 아니라 **403** 이다(로그인은 했지만 어드민이 아니다)
  const login = await request.post(`${WEB_BASE}/api/auth/demo-login`, {
    data: { role: "landlord" },
  });
  expect(login.ok()).toBe(true);

  for (const path of ["/api/admin/users", "/api/admin/events"]) {
    const response = await request.get(`${WEB_BASE}${path}`);
    expect(response.status()).toBe(403);
  }

  await request.post(`${WEB_BASE}/api/auth/logout`);
});
