/**
 * 실거래가 화면 DTO (T4.3·T4.4).
 *
 * **`@zari/db` 를 import 하지 않는다** — `/deals` 화면·알림 시트가 클라이언트 컴포넌트라
 * Prisma 타입을 끌어오면 번들이 깨진다(T1.1 `features/landlord/types.ts`, T4.1 미러 패턴).
 *
 * ## 금액 단위 — 이 도메인만 **만원**이다
 *
 * 스키마 주석(`packages/db/prisma/schema.prisma` 머리말)이 못 박은 대로 프로젝트의 모든 금액은
 * 원(KRW)인데 **`RealTransaction` 만 국토부 API 원본 단위인 만원**을 그대로 쓴다. 여기 DTO 의
 * `price`·`deposit`·`monthlyRent` 도 전부 **만원**이고, 화면에 찍을 때만 `formatManwonAmount`
 * 로 "12억 4,900만원" 처럼 편다. 원으로 환산해 저장하지 않는 이유는 ① API 원본과 대조가 되고
 * ② 만원 단위로도 Int 상한을 한참 밑돌아 큰 금액이 안전하기 때문이다.
 */

/** `RealDealType` 미러 — 스키마 enum 과 값이 같아야 한다 */
export type RealDealTypeValue = "SALE" | "JEONSE" | "WOLSE";

/** 화면 탭 순서 = 이 순서 */
export const REAL_DEAL_TYPES: readonly RealDealTypeValue[] = ["SALE", "JEONSE", "WOLSE"];

/** 거래 1건 — 목록 카드가 그리는 값 전부 */
export type RealDealDto = {
  id: string;
  lawdCd: string;
  dealType: RealDealTypeValue;
  aptName: string;
  /** 전용면적 ㎡ */
  areaM2: number;
  /** 층. 국토부가 비워 보내면 null */
  floor: number | null;
  /** "2026-07-14" (KST 달력 날짜) */
  dealDate: string;
  /** 매매가 — **만원**. 전월세면 null */
  price: number | null;
  /** 보증금 — **만원**. 매매면 null */
  deposit: number | null;
  /** 월세 — **만원**. 매매면 null, 전세면 0 */
  monthlyRent: number | null;
  builtYear: number | null;
};

/** 지역 선택 항목 — `features/community/regions.ts` 상수표에서 온다(T4.1 재사용) */
export type DealRegionDto = { code: string; name: string; label: string };

/** 단지 검색 셀렉트·구독 시트가 쓰는 단지 목록 */
export type DealApartmentDto = { name: string; count: number };

/** 추이 차트 한 점 = 한 달 */
export type DealTrendPointDto = {
  /** "2026-07" */
  ym: string;
  /** "7월" · 해가 바뀌면 "26.1월" */
  label: string;
  count: number;
  /** 대표 금액 평균 — **만원**(매매=매매가, 전월세=보증금). 정수로 내림 */
  avgAmount: number;
  minAmount: number;
  maxAmount: number;
  /** 월세 평균 — **만원**. WOLSE 탭에서만 채워진다 */
  avgMonthlyRent: number | null;
};

/** 추이 차트 전체 */
export type DealTrendDto = {
  /** 단지를 고르면 그 단지, 아니면 null(= 지역 전체 추이) */
  apartmentName: string | null;
  points: DealTrendPointDto[];
};

/** 온디맨드 수집이 이 요청에서 무엇을 했는지 — 화면 안내 문구가 이 값을 읽는다 */
export type DealSyncHintDto = {
  triggered: boolean;
  reason:
    /** 이미 수집분이 있어 부르지 않았다 */
    | "CACHE_HIT"
    /** 방금 수집했다 */
    | "SYNCED"
    /** 최근에 시도했다 — 잠시 뒤 다시 */
    | "COOLDOWN"
    /** 서버에 `DATA_GO_KR_API_KEY` 가 없다 */
    | "NO_KEY"
    /** 국토부 API 가 실패했다 */
    | "FAILED";
  created: number;
  months: string[];
};

/** `GET /api/deals` 응답 */
export type DealListResult = {
  region: DealRegionDto;
  dealType: RealDealTypeValue;
  deals: RealDealDto[];
  /** 다음 페이지 커서. `null` 이면 끝 */
  nextCursor: string | null;
  /** 이 지역·유형에서 수집된 단지 목록(거래 수 내림차순) */
  apartments: DealApartmentDto[];
  trend: DealTrendDto;
  sync: DealSyncHintDto;
};

/** 알림 구독 1건 */
export type TransactionAlertDto = {
  id: string;
  lawdCd: string;
  regionLabel: string;
  /** null 이면 그 지역 전체 */
  aptName: string | null;
  /** null 이면 모든 유형 */
  dealType: RealDealTypeValue | null;
  createdAt: string;
  /** 사람이 읽는 한 줄 — "서울 성동구 · 신금호파크자이 · 전세" */
  summary: string;
};

/** `GET /api/transaction-alerts` 응답 */
export type TransactionAlertListResult = { alerts: TransactionAlertDto[] };

/** `POST /api/transaction-alerts` 응답 — 이미 있던 구독이면 `duplicated: true` 로 그것을 돌려준다 */
export type TransactionAlertResult = { alert: TransactionAlertDto; duplicated: boolean };

/** `DELETE /api/transaction-alerts?id=` 응답 */
export type TransactionAlertDeleteResult = { deleted: true; alertId: string };

/** `POST /api/deals/sync` 한 (지역·월·엔드포인트) 조각의 실패 기록 */
export type DealSyncFailureDto = {
  lawdCd: string;
  dealYm: string;
  endpoint: "TRADE" | "RENT";
  reason: string;
  status: number | null;
};

/** `POST /api/deals/sync` 응답 — 어드민 패널이 이 표를 그대로 그린다 */
export type DealSyncResultDto = {
  ok: true;
  ranAt: string;
  /** 훑은 (지역, 월) 조합 */
  targets: { lawdCd: string; regionLabel: string; dealYm: string }[];
  regionsScanned: number;
  monthsScanned: number;
  /** 국토부 API 호출 횟수(페이지 포함) */
  requests: number;
  /** 파싱에 성공한 거래 행 수 */
  fetched: number;
  /** 새로 저장한 행 수 */
  created: number;
  /** 이미 있어 건너뛴 행 수 = 멱등의 증거 */
  skipped: number;
  /** 파싱 단계에서 버린 행 수(해제 거래·필수값 누락) */
  discarded: number;
  failures: DealSyncFailureDto[];
  /** 구독자에게 남긴 알림톡 시뮬(MessageLog) 건수 */
  alertsSent: number;
  durationMs: number;
};
