/**
 * Vitest 전역 셋업 — 모든 단위·API 테스트는 `zari_test` DB를 바라본다.
 * prisma 클라이언트가 import 시점에 DATABASE_URL 을 읽으므로 여기서 먼저 덮어쓴다.
 */
const base = process.env.DATABASE_URL ?? "postgresql://zari:zari@localhost:5432/zari";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? base.replace(/\/[^/?]+(\?|$)/, "/zari_test$1");
process.env.NODE_ENV ??= "test";
