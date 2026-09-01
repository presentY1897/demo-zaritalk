/**
 * 테스트 전용 DB(`zari_test`)를 만들고 마이그레이션을 적용한다.
 * `pnpm test:db` 로 실행 — 로컬 최초 1회, CI는 test job에서 매번.
 */
import { execFileSync } from "node:child_process";
import { Client } from "pg";

const base = process.env.DATABASE_URL ?? "postgresql://zari:zari@localhost:5432/zari";
const testUrl = process.env.TEST_DATABASE_URL ?? base.replace(/\/[^/?]+(\?|$)/, "/zari_test$1");

const dbName = new URL(testUrl).pathname.slice(1);
const adminUrl = new URL(testUrl);
adminUrl.pathname = "/postgres";

const client = new Client({ connectionString: adminUrl.toString() });
await client.connect();
const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
if (rowCount === 0) {
  await client.query(`CREATE DATABASE "${dbName}"`);
  console.log(`created database ${dbName}`);
} else {
  console.log(`database ${dbName} already exists`);
}
await client.end();

execFileSync("pnpm", ["--filter", "@zari/db", "exec", "prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testUrl },
});
console.log(`migrations applied to ${dbName}`);
