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
        // `next dev` 를 직접 부르면 web 의 dev 스크립트를 건너뛰어 panda codegen 이 빠진다 —
        // 클린 체크아웃(CI)에서 styled-system 이 없으므로 여기서 함께 돌린다.
        command: `pnpm --filter @zari/web exec panda codegen && pnpm --filter @zari/web exec next dev -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        // CI 클린 체크아웃에서는 codegen + Turbopack 최초 컴파일까지 포함되므로 넉넉히 준다
        timeout: 300_000,
        env: { DATABASE_URL: testDatabaseUrl },
      },
});
