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
  /**
   * 테스트 1건 예산. 기본값 30초는 **스펙 안의 의도적 대기보다 짧다** —
   * 결제 스펙은 토스 위젯(외부 스크립트)을 최대 30초 기다리는데,
   * 로그인·이동 시간까지 합치면 느린 CI 러너에서 예산을 넘겨 통째로 죽는다.
   * (로컬은 위젯이 1~2초에 떠서 드러나지 않았다.)
   */
  timeout: process.env.CI ? 120_000 : 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // CI 에서도 HTML 리포트를 남긴다 — 실패 시 워크플로가 아티팩트로 올려 주는데,
  // list 만 쓰면 playwright-report/ 가 없어 업로드할 것이 없었다(실제로 겪음).
  // `github` 리포터는 실패를 워크플로 annotation(::error::)으로 올려 준다 —
  // 잡 로그·아티팩트는 열람에 인증이 필요하지만 **annotation 은 공개 API 로 읽힌다**.
  // CI 실패 원인을 밖에서 확인할 수 있는 유일한 경로라 반드시 유지할 것.
  reporter: process.env.CI
    ? [
        ["github"],
        ["list"],
        ["html", { open: "never" }],
        ["json", { outputFile: "playwright-report/results.json" }],
      ]
    : "html",
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
