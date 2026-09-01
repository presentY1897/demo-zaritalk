/**
 * 임대인 자산(건물·호실) API 응답 타입 (T1.1).
 *
 * **`@zari/db` 를 import 하지 않는다** — 이 타입은 클라이언트 컴포넌트(그리드·폼)도 쓴다.
 * Prisma 타입을 그대로 끌어오면 Prisma 클라이언트가 브라우저 번들에 섞여 빌드가 깨진다
 * (T0.4 가 `features/auth/types.ts` 에서 쓴 미러 타입 패턴과 같다).
 *
 * 날짜는 JSON 직렬화를 거치므로 전부 문자열(ISO)이다. 서버 컴포넌트가 초기 데이터를
 * 내려줄 때도 `features/landlord/queries.ts` 가 같은 모양(문자열)으로 맞춰 준다 —
 * 그래야 Tanstack Query 의 `initialData` 와 API 응답이 한 타입으로 이어진다.
 */

/** 계약 상태 — Prisma `LeaseStatus` 미러 */
export type LeaseStatusValue = "PENDING_TENANT" | "ACTIVE" | "ENDED" | "CANCELLED";
/** 매물 상태 — Prisma `ListingStatus` 미러 */
export type ListingStatusValue = "OPEN" | "RESERVED" | "CLOSED";
/** 거래 유형 — Prisma `DealType` 미러 */
export type DealTypeValue = "JEONSE" | "WOLSE";

/**
 * 호실 그리드 상태 — 계약 상태에서 **파생**한다(DB 컬럼이 아니다).
 * 판정 규칙은 `unit-status.ts` 의 `deriveUnitStatus` 한 곳에만 있다.
 */
export type UnitStatus = "OCCUPIED" | "PENDING" | "OVERDUE" | "VACANT";

/** 건물 목록 카드 1장 — 호실 수·상태별 수 요약 포함 */
export type BuildingSummaryDto = {
  id: string;
  name: string;
  address: string;
  roadAddress: string | null;
  lat: number;
  lng: number;
  note: string | null;
  createdAt: string;
  unitCount: number;
  /** 상태별 호실 수 — 목록에서 "공실 n" 을 바로 그린다 */
  statusCounts: Record<UnitStatus, number>;
};

/** 계약 요약 — 호실 카드·상세의 계약 카드가 쓴다 */
export type LeaseSummaryDto = {
  id: string;
  status: LeaseStatusValue;
  tenantName: string;
  tenantPhone: string;
  /** 세입자 계정 연결 전이면 null (PENDING_TENANT) */
  tenantProfileId: string | null;
  deposit: number;
  monthlyRent: number;
  maintenanceFee: number;
  paymentDay: number;
  /** `YYYY-MM-DD` */
  startDate: string;
  endDate: string;
};

/** 그리드 셀 1개 */
export type UnitSummaryDto = {
  id: string;
  buildingId: string;
  label: string;
  floor: number | null;
  areaM2: number | null;
  rooms: number | null;
  note: string | null;
  createdAt: string;
  status: UnitStatus;
  /** 진행 중(ACTIVE) 또는 대기(PENDING_TENANT) 계약. 공실이면 null */
  currentLease: LeaseSummaryDto | null;
};

/** 건물 상세 = 요약 + 호실 그리드 */
export type BuildingDetailDto = BuildingSummaryDto & {
  units: UnitSummaryDto[];
};

/** 매물 요약 — 공실 화면에서 "이미 매물이 올라가 있음"을 보여 준다 (T3.1 이 채운다) */
export type ListingSummaryDto = {
  id: string;
  dealType: DealTypeValue;
  deposit: number;
  monthlyRent: number;
  status: ListingStatusValue;
  availableFrom: string | null;
  createdAt: string;
};

/**
 * 수납 요약 — **저장된 컬럼의 단순 집계**다.
 * 연체료·이월 같은 원장 계산은 T1.4(월세 원장 엔진) 소유이므로 여기서 만들지 않는다.
 * T1.4 머지 후 이 집계는 원장 엔진의 요약 함수로 교체한다.
 */
export type ChargeSummaryDto = {
  /** 청구 건수 */
  totalCount: number;
  /** 미납(PAID 가 아닌) 건수 */
  unpaidCount: number;
  /** 연체(OVERDUE) 건수 */
  overdueCount: number;
  /** 미납 합계 = Σ(totalDue − paidAmount), PAID 제외 */
  unpaidAmount: number;
  /** 가장 최근 청구월 `YYYY-MM` (없으면 null) */
  latestMonth: string | null;
};

/** 호실 상세 — 계약(현재·과거)·매물·수납 요약을 함께 준다 */
export type UnitDetailDto = UnitSummaryDto & {
  building: { id: string; name: string; address: string };
  /** 종료·취소된 계약 이력 (최신순) */
  pastLeases: LeaseSummaryDto[];
  /** 가장 최근 매물 1건 (없으면 null) */
  listing: ListingSummaryDto | null;
  /** 현재 계약의 수납 요약. 계약이 없으면 null */
  chargeSummary: ChargeSummaryDto | null;
};
