/**
 * 임대장부 API 응답 타입 (T1.6).
 *
 * **`@zari/db` 를 import 하지 않는다** — 화면(클라이언트 컴포넌트)이 같은 타입을 쓴다.
 * Prisma 타입을 끌어오면 Prisma 클라이언트가 브라우저 번들에 섞여 빌드가 깨진다
 * (T1.1 `features/landlord/types.ts` 와 같은 미러 타입 패턴).
 *
 * 금액 타입은 순수 집계 모듈(`aggregate.ts`)의 것을 **타입만** 빌려 쓴다.
 * `aggregate.ts` 는 `@/lib/rent`(순수 함수)만 의존하므로 클라이언트에서도 안전하다.
 */
import type { LedgerAmounts, LedgerMonthBucket } from "./aggregate";

export type { LedgerAmounts, LedgerMonthBucket };

/** 건물 필터 선택지 — 로그인한 임대인의 건물 전부(필터를 걸어도 목록은 그대로다) */
export type LedgerBuildingOptionDto = { id: string; name: string };

/** 월×건물 matrix 의 한 행 */
export type LedgerBuildingRowDto = {
  buildingId: string;
  buildingName: string;
  /** 항상 12개(1~12월). 수입이 없는 달은 0 */
  months: LedgerMonthBucket[];
  totals: LedgerAmounts;
};

/** `GET /api/landlord/ledger?year=` 응답 */
export type LedgerYearDto = {
  /** 집계한 연도(KST 달력) */
  year: number;
  /** 적용된 건물 필터. 전체면 null */
  buildingId: string | null;
  /** 필터 선택지 */
  buildings: LedgerBuildingOptionDto[];
  /** 납부 기록이 있는 연도 + 올해 (내림차순). 연도 이동 버튼의 범위 */
  availableYears: number[];
  /** 필터 적용 후 12개월 합계 */
  months: LedgerMonthBucket[];
  /** 월×건물 matrix (필터를 걸면 그 건물 한 행) */
  matrix: LedgerBuildingRowDto[];
  /** 연간 항목별 합계 */
  totals: LedgerAmounts;
};

/** 화면·API 호출이 함께 쓰는 조회 조건 */
export type LedgerQuery = { year: number; buildingId?: string | null };
