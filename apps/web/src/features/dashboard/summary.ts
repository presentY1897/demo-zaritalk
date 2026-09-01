/**
 * 임대인 홈 대시보드 집계 (T1.9) — **순수 함수. DB를 모른다.**
 *
 * 화면·API 가 쓰는 숫자는 전부 여기서 나오고, 돈 계산은 한 줄도 직접 쓰지 않는다 —
 * 전부 원장 엔진(T1.4 `@/lib/rent`)에 위임한다:
 *
 * | 필요한 것 | 쓰는 함수 |
 * |---|---|
 * | 청구 상태·잔액·항목 분해 | `describeCharge(charge, asOf)` |
 * | 미납 잔액 | `calcOutstanding` (describeCharge 안에서) |
 * | 부분납 포함 미납 판정 | `isDelinquent(charge, asOf)` |
 * | 만기 임박 판정·남은 일수 | `isExpiringWithin` · `daysUntilExpiry` · `EXPIRY_NOTICE_DAYS` |
 * | "오늘"·"이번 달" | `kstToday()` · `kstYearMonth()` (호출부에서 넘긴다) |
 *
 * ## "연체" 두 가지를 구분하는 곳
 * - `overdue` — **실효 상태가 `OVERDUE`** 인 청구(기한 경과 + 한 푼도 안 낸 것). 화면 「연체」 카드.
 * - `delinquent` — `isDelinquent()`. 기한 경과 + 잔액이 남은 청구 **전부**(부분납 포함).
 *   화면에서는 「미납(부분납 포함)」이라는 다른 라벨로 적는다. 시드 기준 1건 vs 2건으로 다르다.
 *
 * ## 왜 저장된 `status` 컬럼 대신 "실효 상태" 인가
 * `RentCharge.status` 는 크론이 하루 1회 갱신하는 **스냅샷**이라, 크론이 돌기 전에는
 * 기한이 지난 청구가 아직 `SCHEDULED` 로 남아 있을 수 있다. 대시보드는 `asOf`(KST 오늘)로
 * `resolveChargeStatus` 를 다시 태운 값(= `describeCharge().status`)을 쓴다 —
 * 규칙은 같은 함수이므로 크론이 돈 뒤에는 두 값이 언제나 일치한다(시드 기준으로도 일치).
 */
import {
  daysUntilExpiry,
  describeCharge,
  EXPIRY_NOTICE_DAYS,
  formatDateKey,
  isDelinquent,
  isExpiringWithin,
  kstYearMonth,
  type ChargeStatus,
} from "@/lib/rent";
import { deriveUnitStatus, emptyStatusCounts } from "@/features/landlord/unit-status";
import type { LeaseStatusValue } from "@/features/landlord/types";
import type {
  CollectionSummaryDto,
  ExpiringLeaseDto,
  InboxSummaryDto,
  LandlordSummaryDto,
  OverdueChargeDto,
} from "./types";

/** 진행 중 계약 — 만기 임박·호실 상태 판정 대상(T1.1 그리드와 같은 기준) */
const CURRENT_LEASE_STATUSES: readonly LeaseStatusValue[] = ["ACTIVE", "PENDING_TENANT"];

/** 청구 1건 — Prisma `RentCharge` 의 부분집합(구조적 타이핑이라 레코드를 그대로 넘겨도 된다) */
export type SummaryChargeInput = {
  id: string;
  year: number;
  month: number;
  dueDate: Date;
  rentAmount: number;
  maintenanceAmount: number;
  carriedOverAmount: number;
  lateFeeAmount: number;
  totalDue: number;
  paidAmount: number;
};

/** 계약 1건 + 그 계약의 청구 전부 */
export type SummaryLeaseInput = {
  id: string;
  status: LeaseStatusValue;
  tenantName: string;
  monthlyRent: number;
  endDate: Date;
  charges: readonly SummaryChargeInput[];
};

export type SummaryUnitInput = {
  id: string;
  label: string;
  leases: readonly SummaryLeaseInput[];
};

export type SummaryBuildingInput = {
  id: string;
  name: string;
  units: readonly SummaryUnitInput[];
};

/** 미확인 민원·견적 집계값(개수는 DB 에서 세어 넘긴다 — 이 모듈은 DB를 모른다) */
export type SummaryInboxInput = {
  complaintCount: number;
  quoteCount: number;
  latestComplaintId?: string | null;
  latestQuoteWorkOrderId?: string | null;
};

export type LandlordSummaryInput = {
  buildings: readonly SummaryBuildingInput[];
  inbox: SummaryInboxInput;
  /**
   * 판정 기준일 — **항상 `kstToday()`**(UTC 자정 Date). `new Date()` 를 그대로 넘기면
   * UTC 자정~KST 자정 사이 9시간 동안 하루가 어긋난다(T1.4 규칙).
   */
  asOf: Date;
};

function emptyStatusCountMap(): Record<ChargeStatus, number> {
  return { SCHEDULED: 0, PARTIALLY_PAID: 0, PAID: 0, OVERDUE: 0 };
}

/** 청구 1건 + 그 청구가 속한 계약·호실·건물 (집계를 한 번만 훑도록 평평하게 편다) */
type FlatCharge = {
  charge: SummaryChargeInput;
  lease: SummaryLeaseInput;
  unit: SummaryUnitInput;
  building: SummaryBuildingInput;
};

function flattenCharges(buildings: readonly SummaryBuildingInput[]): FlatCharge[] {
  const rows: FlatCharge[] = [];
  for (const building of buildings) {
    for (const unit of building.units) {
      for (const lease of unit.leases) {
        for (const charge of lease.charges) {
          rows.push({ charge, lease, unit, building });
        }
      }
    }
  }
  return rows;
}

function toOverdueItem(row: FlatCharge, asOf: Date): OverdueChargeDto {
  const view = describeCharge(row.charge, asOf);
  return {
    chargeId: row.charge.id,
    leaseId: row.lease.id,
    unitId: row.unit.id,
    buildingId: row.building.id,
    buildingName: row.building.name,
    unitLabel: row.unit.label,
    tenantName: row.lease.tenantName,
    year: row.charge.year,
    month: row.charge.month,
    dueDate: formatDateKey(row.charge.dueDate),
    overdueDays: view.overdueDays,
    totalDue: view.totalDue,
    paidAmount: view.paidAmount,
    outstanding: view.outstanding,
    lines: view.lines.map((line) => ({
      key: line.key,
      label: line.label,
      amount: line.amount,
      paid: line.paid,
    })),
  };
}

function toExpiringItem(
  lease: SummaryLeaseInput,
  unit: SummaryUnitInput,
  building: SummaryBuildingInput,
  asOf: Date,
): ExpiringLeaseDto {
  return {
    leaseId: lease.id,
    unitId: unit.id,
    buildingId: building.id,
    buildingName: building.name,
    unitLabel: unit.label,
    tenantName: lease.tenantName,
    status: lease.status,
    endDate: formatDateKey(lease.endDate),
    daysLeft: daysUntilExpiry(lease.endDate, asOf),
    monthlyRent: lease.monthlyRent,
  };
}

function buildInbox(input: SummaryInboxInput): InboxSummaryDto {
  const complaintCount = Math.max(0, Math.trunc(input.complaintCount));
  const quoteCount = Math.max(0, Math.trunc(input.quoteCount));
  return {
    complaintCount,
    quoteCount,
    total: complaintCount + quoteCount,
    latestComplaintId: complaintCount > 0 ? (input.latestComplaintId ?? null) : null,
    latestQuoteWorkOrderId: quoteCount > 0 ? (input.latestQuoteWorkOrderId ?? null) : null,
  };
}

/**
 * 대시보드 숫자 전부를 한 번에 만든다.
 *
 * 계약·청구를 여러 번 훑지 않도록 한 번 평평하게 편 뒤 같은 루프에서 집계한다.
 * 데모 규모(건물 수 개·청구 수십 건)를 전제로 하고, 커지면 SQL 집계로 옮긴다.
 */
export function buildLandlordSummary(input: LandlordSummaryInput): LandlordSummaryDto {
  const { asOf } = input;
  const month = kstYearMonth(asOf);

  const collection: CollectionSummaryDto = {
    chargeCount: 0,
    billedAmount: 0,
    paidAmount: 0,
    outstandingAmount: 0,
    paidCount: 0,
    unpaidCount: 0,
    collectedPct: 0,
    statusCounts: emptyStatusCountMap(),
  };

  const overdueItems: OverdueChargeDto[] = [];
  let delinquentCount = 0;
  let delinquentAmount = 0;
  /** 계약별 "실효 OVERDUE 청구가 있는가" — 호실 상태(T1.1 그리드)와 같은 판정에 쓴다 */
  const overdueLeaseIds = new Set<string>();

  for (const row of flattenCharges(input.buildings)) {
    const view = describeCharge(row.charge, asOf);

    // ① 이번 달(KST 달력) 수납 현황 — 청구의 year·month 컬럼이 곧 청구월이다
    if (row.charge.year === month.year && row.charge.month === month.month) {
      collection.chargeCount += 1;
      collection.billedAmount += view.totalDue;
      collection.paidAmount += view.paidAmount;
      collection.outstandingAmount += view.outstanding;
      collection.statusCounts[view.status] += 1;
      if (view.status === "PAID") collection.paidCount += 1;
    }

    // ② 연체 = 실효 상태 OVERDUE (한 푼도 안 낸 청구). 월과 무관하게 전부 센다
    if (view.status === "OVERDUE") {
      overdueItems.push(toOverdueItem(row, asOf));
      overdueLeaseIds.add(row.lease.id);
    }

    // ③ 미납 = isDelinquent (부분납 포함). ②를 포함하는 더 넓은 집합
    if (isDelinquent(row.charge, asOf)) {
      delinquentCount += 1;
      delinquentAmount += view.outstanding;
    }
  }

  collection.unpaidCount = collection.chargeCount - collection.paidCount;
  collection.collectedPct =
    collection.billedAmount > 0
      ? Math.min(100, Math.floor((collection.paidAmount / collection.billedAmount) * 100))
      : 0;

  // 기한이 오래된 것부터 — 임대인이 먼저 처리해야 할 순서
  overdueItems.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  // ④ 만기 임박(진행 중 계약만) · ⑤ 자산 요약(호실 상태)
  const expiringItems: ExpiringLeaseDto[] = [];
  const statusCounts = emptyStatusCounts();
  let unitCount = 0;

  for (const building of input.buildings) {
    for (const unit of building.units) {
      unitCount += 1;
      const current = unit.leases.filter((lease) => CURRENT_LEASE_STATUSES.includes(lease.status));
      const active = current.find((lease) => lease.status === "ACTIVE");

      statusCounts[
        deriveUnitStatus({
          hasActiveLease: Boolean(active),
          hasPendingLease: current.some((lease) => lease.status === "PENDING_TENANT"),
          // T1.1 은 저장된 status 컬럼을 봤다. 여기서는 원장 엔진이 다시 판정한 실효 상태를 쓴다
          hasOverdueCharge: Boolean(active && overdueLeaseIds.has(active.id)),
        })
      ] += 1;

      for (const lease of current) {
        if (isExpiringWithin(lease.endDate, asOf, EXPIRY_NOTICE_DAYS)) {
          expiringItems.push(toExpiringItem(lease, unit, building, asOf));
        }
      }
    }
  }

  expiringItems.sort((a, b) => a.endDate.localeCompare(b.endDate));

  return {
    asOf: formatDateKey(asOf),
    month: { year: month.year, month: month.month, label: `${month.year}년 ${month.month}월` },
    collection,
    overdue: {
      count: overdueItems.length,
      amount: overdueItems.reduce((sum, item) => sum + item.outstanding, 0),
      items: overdueItems,
    },
    delinquent: { count: delinquentCount, amount: delinquentAmount },
    expiring: {
      withinDays: EXPIRY_NOTICE_DAYS,
      count: expiringItems.length,
      items: expiringItems,
    },
    portfolio: { buildingCount: input.buildings.length, unitCount, statusCounts },
    inbox: buildInbox(input.inbox),
  };
}
