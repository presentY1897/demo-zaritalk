/**
 * 임대인 홈 대시보드 응답 타입 (T1.9).
 *
 * **`@zari/db` 를 import 하지 않는다** — 이 타입은 클라이언트 컴포넌트(홈 화면)도 쓴다.
 * Prisma 타입을 끌어오면 Prisma 클라이언트가 브라우저 번들에 섞여 빌드가 깨진다
 * (T0.4 `features/auth/types.ts`·T1.1 `features/landlord/types.ts` 와 같은 미러 타입 패턴).
 *
 * 날짜는 전부 문자열이다. `@db.Date` 계열은 `YYYY-MM-DD`(UTC 자정으로 저장된 달력 날짜),
 * 나머지는 ISO. 서버 컴포넌트가 내려주는 초기 데이터와 `GET /api/landlord/summary` 응답이
 * **같은 함수**에서 나오므로 모양이 어긋나지 않는다.
 *
 * ## "연체" 가 두 가지인 이유 (T1.4 규칙)
 * - `overdue` — 실효 상태가 `OVERDUE`(기한 경과 + **한 푼도 안 낸** 청구). 화면의 「연체」 카드.
 * - `delinquent` — `isDelinquent()`. 기한 경과 + 잔액이 남은 청구 **전부**(부분납 포함).
 *   화면에서는 「미납(부분납 포함)」이라는 다른 라벨로 적는다. **두 숫자는 다르다.**
 */
import type { ChargeStatus } from "@/lib/rent";
import type { LeaseStatusValue, UnitStatus } from "@/features/landlord/types";

export type { ChargeStatus, LeaseStatusValue, UnitStatus };

/** 청구 1건의 항목 분해 — 원장 엔진 `describeCharge().lines` 를 그대로 옮긴다(항상 4줄) */
export type ChargeLineDto = {
  /** RENT | MAINTENANCE | CARRY_OVER | LATE_FEE */
  key: string;
  /** 월세·관리비·전월 이월·연체료 */
  label: string;
  amount: number;
  /** 그중 충당된 금액 */
  paid: number;
};

/** 연체 청구 1건 — 「연체」 카드의 행. 탭하면 계약 상세(T1.2)로 간다 */
export type OverdueChargeDto = {
  chargeId: string;
  leaseId: string;
  unitId: string;
  buildingId: string;
  buildingName: string;
  unitLabel: string;
  tenantName: string;
  year: number;
  month: number;
  /** `YYYY-MM-DD` */
  dueDate: string;
  /** 기한 경과 일수 */
  overdueDays: number;
  totalDue: number;
  paidAmount: number;
  /** 남은 금액 = `calcOutstanding(totalDue, paidAmount)` */
  outstanding: number;
  /** 0원 줄까지 4줄 그대로. 화면에서 0원은 숨긴다 */
  lines: ChargeLineDto[];
};

/** 만기 임박 계약 1건 — 「만기 임박」 카드의 행 */
export type ExpiringLeaseDto = {
  leaseId: string;
  unitId: string;
  buildingId: string;
  buildingName: string;
  unitLabel: string;
  tenantName: string;
  status: LeaseStatusValue;
  /** `YYYY-MM-DD` */
  endDate: string;
  /** 만기까지 남은 일수(0 이면 오늘 만기) */
  daysLeft: number;
  monthlyRent: number;
};

/** 이번 달(KST 달력) 수납 현황 */
export type CollectionSummaryDto = {
  /** 이번 달 청구 건수 */
  chargeCount: number;
  /** 청구 총액 Σ totalDue */
  billedAmount: number;
  /** 수납액 Σ paidAmount */
  paidAmount: number;
  /** 미수금 Σ outstanding */
  outstandingAmount: number;
  /** 완납 건수 */
  paidCount: number;
  /** 아직 다 안 낸 건수 = chargeCount − paidCount */
  unpaidCount: number;
  /** 수납률(%) 0~100, 내림. 청구가 0원이면 0 */
  collectedPct: number;
  /** 실효 상태별 건수 (SCHEDULED·PARTIALLY_PAID·PAID·OVERDUE) */
  statusCounts: Record<ChargeStatus, number>;
};

/** 연체 = 실효 상태 `OVERDUE`(한 푼도 안 낸 청구)만 */
export type OverdueSummaryDto = {
  count: number;
  /** Σ outstanding */
  amount: number;
  /** 기한이 오래된 것부터 */
  items: OverdueChargeDto[];
};

/** 미납 = `isDelinquent()` — 기한 경과 + 잔액 있음(**부분납 포함**). `overdue` 를 포함하는 더 넓은 집합 */
export type DelinquentSummaryDto = {
  count: number;
  amount: number;
};

/** 만기 임박 계약 */
export type ExpiringSummaryDto = {
  /** 기준 일수(원장 엔진 `EXPIRY_NOTICE_DAYS` = 90) */
  withinDays: number;
  count: number;
  /** 만기가 가까운 것부터 */
  items: ExpiringLeaseDto[];
};

/** 자산 요약 — 「자산」 탭(T1.1 `/landlord/buildings`)으로 이어진다 */
export type PortfolioSummaryDto = {
  buildingCount: number;
  unitCount: number;
  /** 호실 상태별 수 — 판정은 T1.1 `deriveUnitStatus` 한 곳에서만 한다 */
  statusCounts: Record<UnitStatus, number>;
};

/**
 * 미확인 민원·견적.
 *
 * `Complaint`·`WorkOrderQuote` 는 이미 스키마에 있으므로 **집계는 진짜로 구현**했다.
 * 시드에 데이터가 없어 지금은 전부 0 이고, 화면은 0 이면 배지를 감춘다 —
 * T2.6(민원)·T5.3(견적) 데이터가 들어오면 그대로 채워진다.
 */
export type InboxSummaryDto = {
  /** 미확인 민원 = `Complaint.status === OPEN` */
  complaintCount: number;
  /** 미확인 견적 = 내 작업 의뢰에 달린 `WorkOrderQuote.status === PROPOSED` */
  quoteCount: number;
  /** 배지 총합 — 0 이면 화면에서 카드를 통째로 숨긴다 */
  total: number;
  /** 가장 최근 미확인 민원 id — 배지 링크 목적지(`/landlord/complaints/[id]`, T2.6) */
  latestComplaintId: string | null;
  /** 가장 최근 미확인 견적의 작업 의뢰 id — 배지 링크 목적지(`/landlord/workorders/[id]`, T5.3) */
  latestQuoteWorkOrderId: string | null;
};

/** `GET /api/landlord/summary` 본문의 `summary` */
export type LandlordSummaryDto = {
  /** 판정 기준일 — KST 달력의 오늘 `YYYY-MM-DD` */
  asOf: string;
  /** 이번 달(KST 달력) */
  month: { year: number; month: number; label: string };
  collection: CollectionSummaryDto;
  overdue: OverdueSummaryDto;
  delinquent: DelinquentSummaryDto;
  expiring: ExpiringSummaryDto;
  portfolio: PortfolioSummaryDto;
  inbox: InboxSummaryDto;
};
