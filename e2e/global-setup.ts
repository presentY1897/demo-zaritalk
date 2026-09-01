import { execFileSync } from "node:child_process";

/** E2E 는 시드 데이터 기반(D8) — 매 실행 전 zari_test 를 시드 상태로 되돌린다. */
export default function globalSetup() {
  const base = process.env.DATABASE_URL ?? "postgresql://zari:zari@localhost:5432/zari";
  const url =
    process.env.TEST_DATABASE_URL ?? base.replace(/\/[^/?]+(\?|$)/, "/zari_test$1");
  execFileSync("pnpm", ["--filter", "@zari/db", "run", "db:seed"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
