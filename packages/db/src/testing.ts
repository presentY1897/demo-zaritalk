/**
 * 테스트 전용 DB 헬퍼.
 *
 * 단위·API 테스트는 `zari_test` DB를 공유하고, 테스트마다 truncate로 격리한다
 * (D8: Vitest + 테스트 전용 DB). 앱 코드에서는 절대 import 하지 않는다.
 */
import { prisma } from "./index";

/** 시스템 테이블을 뺀 public 스키마의 모든 테이블 이름 */
async function tableNames(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;
  return rows.map((r) => r.tablename);
}

let cachedTables: string[] | null = null;

/** 전 테이블 TRUNCATE — 테스트 간 격리용. beforeEach 에서 호출한다. */
export async function resetDb(): Promise<void> {
  cachedTables ??= await tableNames();
  if (cachedTables.length === 0) return;
  const list = cachedTables.map((t) => `"public"."${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/**
 * 실수로 데모 DB를 지우는 사고 방지 — 테스트 셋업에서 호출한다.
 * 병렬 작업 시 서로의 DB를 truncate 하지 않도록 `zari_test_<작업>` 처럼
 * 접미사를 붙인 전용 DB도 허용한다(예: `zari_test`, `zari_test_auth`).
 */
export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/_test(_[a-z0-9]+)*(\?|$)/.test(url)) {
    throw new Error(
      `테스트는 이름이 _test 또는 _test_<접미사> 인 DB에서만 실행한다. 현재: ${url || "(미설정)"}`,
    );
  }
}

export { prisma };
