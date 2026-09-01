import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * 단위·API 테스트(D8). 앱/패키지별 project 로 나누고, DB가 필요한 테스트는
 * `test/setup.ts` 가 DATABASE_URL 을 zari_test 로 돌린 뒤 `resetDb()` 로 격리한다.
 * E2E 는 Playwright(`playwright.config.ts`) 담당이라 여기서 제외한다.
 */
export default defineConfig({
  test: {
    // 테스트 파일들이 같은 zari_test DB를 truncate 하므로 파일 병렬 실행을 끈다.
    // (병렬로 두면 서로의 데이터를 지우고 40P01 deadlock 이 난다)
    fileParallelism: false,
    projects: [
      {
        test: {
          name: "web",
          root: r("./apps/web"),
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: [r("./test/setup.ts")],
        },
        resolve: {
          alias: {
            "@/": `${r("./apps/web/src")}/`,
            "styled-system/": `${r("./apps/web/styled-system")}/`,
          },
        },
      },
      {
        test: {
          name: "admin",
          root: r("./apps/admin"),
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: [r("./test/setup.ts")],
        },
        resolve: {
          alias: {
            "@/": `${r("./apps/admin/src")}/`,
            "styled-system/": `${r("./apps/admin/styled-system")}/`,
          },
        },
      },
      {
        test: {
          name: "packages",
          root: r("."),
          environment: "node",
          include: ["packages/*/src/**/*.test.ts"],
          setupFiles: [r("./test/setup.ts")],
        },
      },
    ],
  },
});
