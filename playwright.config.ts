import { defineConfig, devices } from "@playwright/test";

/**
 * 통합(E2E) 테스트(D8) — 핵심 사용자 여정만, 시드 데이터 기반.
 * 웹 앱을 3100 포트로 띄우고 zari_test DB 를 바라보게 한다(`pnpm test:e2e`).
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const base = process.env.DATABASE_URL ?? "postgresql://zari:zari@localhost:5432/zari";
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? base.replace(/\/[^/?]+(\?|$)/, "/zari_test$1");

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    // 모바일 웹(앱 웹뷰 가정) 기준 — 480px 셸(D5)
    ...devices["Pixel 5"],
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm --filter @zari/web exec next dev -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { DATABASE_URL: testDatabaseUrl },
      },
});
