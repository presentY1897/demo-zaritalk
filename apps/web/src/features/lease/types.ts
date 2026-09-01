/**
 * 계약·수납 API 응답 타입 (T1.2·T1.5).
 *
 * **`@zari/db` 를 import 하지 않는다** — 이 타입은 클라이언트 컴포넌트(폼·청구 리스트·시트)도 쓴다.
 * Prisma 타입을 그대로 끌어오면 Prisma 클라이언트가 브라우저 번들에 섞여 빌드가 깨진다
 * (T1.1 `features/landlord/types.ts` 의 미러 타입 패턴 그대로다).
 *
 * 날짜는 JSON 직렬화를 거치므로 전부 문자열이다 —
 * `@db.Date` 컬럼(`startDate`·`endDate`·`dueDate`)은 `YYYY-MM-DD`,
 * 타임스탬프(`paidAt`·`createdAt`·`tenantAcceptedAt`)는 ISO 문자열.
 */
import type { LeaseStatusValue, UnitStatus } from "@/features/landlord/types";

export type { LeaseStatusValue, UnitStatus };

/** 청구 상태 — Prisma `ChargeStatus` / 원장 엔진 `ChargeStatus` 미러 */
export type ChargeStatusValue = "SCHEDULED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";

/**
 * 납부 수단 — Prisma `PaymentMethod` 미러.
 * `CARD`(자리페이·토스)는 T2.2 가 채운다. 이 task 의 API 는 앞의 둘만 받는다.
 */
export type PaymentMethodValue = "MANUAL_CHECK" | "VIRTUAL_TRANSFER" | "CARD";

/** 청구 내역 줄 — 원장 엔진 `ChargeLineKey` 미러 */
export type ChargeLineKeyValue = "RENT" | "MAINTENANCE" | "CARRY_OVER" | "LATE_FEE";

/** 계약 조건 — 등록 폼이 채우고 상세가 그대로 보여 준다 */
export type LeaseTermsDto = {
  id: string;
  unitId: string;
  status: LeaseStatusValue;
  tenantName: string;
  tenantPhone: string;
  /** 세입자 계정 연결 전이면 null (PENDING_TENANT) */
  tenantProfileId: string | null;
  /** 세입자가 계약을 수락한 시각(T1.3). 연결 전이면 null */
  tenantAcceptedAt: string | null;
  deposit: number;
  monthlyRent: number;
  maintenanceFee: number;
  paymentDay: number;
  /** `YYYY-MM-DD` */
  startDate: string;
  /** `YYYY-MM-DD` */
  endDate: string;
  /** 월 연체이율(%). null 이면 연체료 없음 */
  lateFeeRatePct: number | null;
  createdAt: string;
};

/** 계약이 걸린 호실 — 상세 헤더의 "행당해피빌 201호" */
export type LeaseUnitDto = {
  id: string;
  label: string;
  buildingId: string;
  buildingName: string;
  buildingAddress: string;
};

/** 계약 단위 수납 요약 — 미납 금액은 원장 엔진 `calcOutstanding` 합계다 */
export type LeaseChargeSummaryDto = {
  totalCount: number;
  /** 완납이 아닌 청구 건수 */
  unpaidCount: number;
  /** 연체(OVERDUE) 건수 — 부분납은 세지 않는다(원장 엔진 상태 우선순위) */
  overdueCount: number;
  /** Σ max(0, totalDue − paidAmount) */
  unpaidAmount: number;
  /** 가장 최근 청구월 `YYYY-MM` (없으면 null) */
  latestMonth: string | null;
};

/** 계약 상세 = 조건 + 호실 + 수납 요약. 목록 아이템도 같은 모양이다 */
export type LeaseDetailDto = LeaseTermsDto & {
  unit: LeaseUnitDto;
  chargeSummary: LeaseChargeSummaryDto;
};

/** 청구 내역 한 줄 (월세·관리비·전월 이월·연체료) */
export type ChargeLineDto = {
  key: ChargeLineKeyValue;
  label: string;
  amount: number;
  /** 그중 충당된 금액 (원장 엔진 충당 순서: 이월 → 연체료 → 관리비 → 월세) */
  paid: number;
};

/** 납부 1건 — 청구 시트의 타임라인 */
export type PaymentDto = {
  id: string;
  chargeId: string;
  amount: number;
  method: PaymentMethodValue;
  /** ISO 타임스탬프 */
  paidAt: string;
  /** 가상 입금 시뮬레이션의 입금자명이 여기 들어간다 */
  memo: string | null;
};

/**
 * 청구 1건 — 저장된 금액 + 원장 엔진 `describeCharge` 의 표시용 분해.
 * `status`·`outstanding`·`overdueDays` 는 **엔진이 `kstToday()` 기준으로 다시 판정한 값**이다
 * (저장된 status 는 크론이 하루 1회 맞춘다 — 그 사이 기한이 지난 청구도 화면에서는 연체로 보인다).
 */
export type ChargeDto = {
  id: string;
  leaseId: string;
  year: number;
  month: number;
  /** `YYYY-MM-DD` — 계약의 납부일(말일 보정 완료) */
  dueDate: string;
  rentAmount: number;
  maintenanceAmount: number;
  carriedOverAmount: number;
  lateFeeAmount: number;
  totalDue: number;
  paidAmount: number;
  /** 남은 금액 = max(0, totalDue − paidAmount) */
  outstanding: number;
  /** 총액을 넘겨 받은 금액(정상 흐름에서는 0 — API 가 초과 납부를 400 으로 막는다) */
  excess: number;
  /** 기한 경과 일수. 기한 전이면 0 */
  overdueDays: number;
  status: ChargeStatusValue;
  /** 항상 4줄(0원 포함). 화면에서 0원 줄은 숨긴다 */
  lines: ChargeLineDto[];
  /** 납부 기록(오래된 것부터) */
  payments: PaymentDto[];
};

/** 계약 등록 폼의 호실 선택 옵션 */
export type UnitOptionDto = {
  unitId: string;
  label: string;
  buildingId: string;
  buildingName: string;
  /** 그리드와 같은 판정(`deriveUnitStatus`) — 계약중·대기 호실은 선택해도 기간이 겹치면 409 */
  status: UnitStatus;
};

/** 계약 종료(ENDED) 결과 — 미납 청구를 어떻게 처리했는지 화면에 알려 준다 */
export type LeaseEndSettlementDto = {
  /** 종료일 이후로 예정돼 있던(납부 0원) 청구를 지운 건수 */
  removedScheduledCharges: number;
  /** 남긴 미납 청구 건수 — 계약이 끝나도 채권은 남는다 */
  remainingUnpaidCount: number;
  /** 남긴 미납 합계(원) */
  remainingUnpaidAmount: number;
};
