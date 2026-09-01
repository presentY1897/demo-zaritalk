import { Client } from "pg";

/**
 * E2E 에서 결과를 DB로 직접 확인할 때 쓴다(예: 트래킹 이벤트 적재).
 * 화면으로 드러나지 않는 부수효과만 여기서 본다 — 화면으로 볼 수 있는 건 화면으로 본다.
 */
const base = process.env.DATABASE_URL ?? "postgresql://zari:zari@localhost:5432/zari";
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? base.replace(/\/[^/?]+(\?|$)/, "/zari_test$1");

export async function queryTestDb<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(sql, params);
    return rows as T[];
  } finally {
    await client.end();
  }
}

/** 특정 이벤트 이름이 적재된 개수 */
export async function trackedEventCount(name: string): Promise<number> {
  const rows = await queryTestDb<{ count: string }>(
    'SELECT count(*)::text AS count FROM "TrackingEvent" WHERE name = $1',
    [name],
  );
  return Number(rows[0]?.count ?? 0);
}
