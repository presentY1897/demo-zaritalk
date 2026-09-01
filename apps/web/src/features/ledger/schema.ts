/**
 * 임대장부 쿼리 스키마 (T1.6) — `GET /api/landlord/ledger?year=&buildingId=` 가 쓴다.
 *
 * `@zari/db` 를 import 하지 않는다(화면에서도 같은 규칙으로 미리 막을 수 있게).
 * 쿼리스트링은 전부 문자열이라 `z.coerce.number()` 를 쓰면 `year=`(빈 값)이 0 으로 변해
 * 범위 오류로 새는데, 그 400 은 이유를 알아보기 어렵다. 4자리 숫자 형식을 먼저 보고
 * 그다음 범위를 본다 — 두 실패 모두 400 `VALIDATION_ERROR` 지만 메시지가 구분된다.
 */
import { z } from "zod";

/** 연도 하한 — 데모 데이터(2026년) 기준으로 넉넉히 잡되 오타(`20265`·`0`)는 막는다 */
export const LEDGER_MIN_YEAR = 2000;
export const LEDGER_MAX_YEAR = 2100;

export const ledgerYearSchema = z
  .string()
  .regex(/^\d{4}$/, "연도는 네 자리 숫자여야 합니다.")
  .transform((value) => Number(value))
  .refine(
    (year) => year >= LEDGER_MIN_YEAR && year <= LEDGER_MAX_YEAR,
    `연도는 ${LEDGER_MIN_YEAR}~${LEDGER_MAX_YEAR} 사이여야 합니다.`,
  );

export const ledgerQuerySchema = z.object({
  /** 생략하면 KST 기준 올해 */
  year: ledgerYearSchema.optional(),
  /** 생략하면 내 건물 전체 */
  buildingId: z.string().trim().min(1, "건물 id 가 비었습니다.").optional(),
});

export type LedgerQueryInput = z.infer<typeof ledgerQuerySchema>;

/** 화면(서버 컴포넌트)의 `searchParams` 처럼 검증 실패를 400 대신 무시해야 하는 곳에서 쓴다. */
export function parseYearParam(value: string | string[] | undefined): number | null {
  if (typeof value !== "string") return null;
  const parsed = ledgerYearSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
