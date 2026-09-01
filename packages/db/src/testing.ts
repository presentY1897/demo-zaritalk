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
 * DB 이름에 `test` 토큰이 들어 있어야 통과한다(`zari_test`, `zari_test_ui`, `zari_ui_test` 모두 허용).
 * 병렬 작업 시 워크트리마다 다른 이름을 쓰므로 접미사 고정은 두지 않는다.
 */
export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  let dbName = "";
  try {
    dbName = new URL(url).pathname.slice(1);
  } catch {
    dbName = "";
  }
  if (!/(^|_)test(_|$)/.test(dbName)) {
    throw new Error(
      `테스트는 이름에 test 가 들어간 DB에서만 실행한다. 현재: ${url || "(미설정)"}`,
    );
  }
}

export { prisma };
