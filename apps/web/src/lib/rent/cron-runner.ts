/**
 * 일일 크론 실행부 (T1.4) — **`lib/rent` 에서 유일하게 DB를 아는 파일.**
 *
 * 계산은 한 줄도 여기에 두지 않는다. 전부 `./ledger` 의 순수 함수에 위임하고
 * 이 파일은 "무엇을 읽어서 무엇을 쓸지"만 정한다. 그래야 계산식이 한 곳에만 남는다.
 *
 * ## 하는 일 (순서가 의미 있다)
 * 1. **당월 청구 생성** — ACTIVE 계약 중 당월이 계약기간에 걸치는 것. 이미 있으면 건너뛴다(멱등).
 * 2. **이월 정정** — 아직 기한이 안 된 청구 중 *이미 이월액이 실린* 것만 전월 잔액으로 다시 맞춘다.
 * 3. **상태 재판정** — 모든 청구를 규칙대로 다시 판정해 달라진 것만 갱신(납부일 경과 → OVERDUE).
 * 4. **만기 임박 알림** — 만기 90일 이내 ACTIVE 계약에 CONTRACT_EXPIRY 로그 1회(계약당 1건).
 *
 * ## 건드리지 않는 것 — 왜 "이미 발행된 청구의 금액"은 그대로 두는가
 * 크론이 매일 기존 청구의 연체료를 키우면 ① 화면 숫자가 매일 달라져 데모가 흔들리고
 * ② 이미 고지서로 나간 금액이 사후에 바뀐다. 그래서 **연체료는 다음 달 청구에 얹는다**
 * (전월 기한 → 이번 기한 일수로 일할). 예외는 위 2번 "이월 정정" 뿐인데, 이건
 * *이월액이 이미 실려 있고 아직 기한 전인* 청구에 한해 전월의 늦은 납부/납부 취소를 반영하는 것이다.
 */
import { LeaseStatus, MessageKind, prisma } from "@zari/db";
import { addDays, formatDateKey, kstToday, lastDayOfMonth, previousMonth, utcDate, yearMonthOf } from "./date";
import { buildChargeDraft, EXPIRY_NOTICE_DAYS, resolveChargeStatus } from "./ledger";
import type { ChargeStatus, LeaseTerms, YearMonth } from "./types";

/** 청구 생성·정정에 필요한 계약 필드만 뽑는 select */
const LEASE_TERMS_SELECT = {
  id: true,
  monthlyRent: true,
  maintenanceFee: true,
  paymentDay: true,
  lateFeeRatePct: true,
  endDate: true,
  tenantName: true,
  tenantPhone: true,
  unit: { select: { label: true, building: { select: { name: true } } } },
} as const;

export type DailyCronOptions = {
  /** 실행 기준 시각. 테스트에서 특정 날짜를 재현할 때 넘긴다(기본: 지금). */
  now?: Date;
};

export type DailyCronResult = {
  /** 실행 시각(ISO) */
  ranAt: string;
  /** 판정 기준일 — KST 달력의 오늘 `YYYY-MM-DD` */
  today: string;
  /** 청구를 만든 대상 월 */
  targetMonth: YearMonth;
  /** 당월 청구 대상으로 훑은 ACTIVE 계약 수 */
  leasesScanned: number;
  /** 새로 만든 당월 청구 */
  chargesCreated: number;
  /** 이미 있어서 건너뛴 당월 청구(멱등 확인용) */
  chargesSkipped: number;
  /** 이월액·연체료를 다시 맞춘 청구 */
  carriedOverAdjusted: number;
  /** 상태가 바뀐 청구 수 */
  statusChanged: number;
  /** 바뀐 결과 상태별 건수 */
  statusBreakdown: Record<ChargeStatus, number>;
  /** 새로 보낸 만기 임박 알림 */
  expiryNoticesSent: number;
  /** 이미 보낸 적 있어 건너뛴 만기 알림(멱등 확인용) */
  expiryNoticesSkipped: number;
  durationMs: number;
};

function toTerms(lease: {
  monthlyRent: number;
  maintenanceFee: number;
  paymentDay: number;
  lateFeeRatePct: number | null;
}): LeaseTerms {
  return {
    monthlyRent: lease.monthlyRent,
    maintenanceFee: lease.maintenanceFee,
    paymentDay: lease.paymentDay,
    lateFeeRatePct: lease.lateFeeRatePct,
  };
}

async function findCharge(leaseId: string, { year, month }: YearMonth) {
  return prisma.rentCharge.findUnique({
    where: { leaseId_year_month: { leaseId, year, month } },
    select: { id: true, dueDate: true, totalDue: true, paidAmount: true },
  });
}

/** 유니크 위반(P2002) — 같은 크론이 겹쳐 돌아도 중복 생성되지 않게 흡수한다. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function runDailyCron(options: DailyCronOptions = {}): Promise<DailyCronResult> {
  const startedAt = Date.now();
  const now = options.now ?? new Date();
  const asOf = kstToday(now);
  const target = yearMonthOf(asOf);
  const previous = previousMonth(target);

  // ---- 1. 당월 청구 생성 (멱등) ----
  const monthStart = utcDate(target.year, target.month, 1);
  const monthEnd = utcDate(target.year, target.month, lastDayOfMonth(target.year, target.month));
  const activeLeases = await prisma.lease.findMany({
    where: {
      status: LeaseStatus.ACTIVE,
      startDate: { lte: monthEnd },
      endDate: { gte: monthStart },
    },
    select: LEASE_TERMS_SELECT,
    orderBy: { createdAt: "asc" },
  });

  let chargesCreated = 0;
  let chargesSkipped = 0;

  for (const lease of activeLeases) {
    if (await findCharge(lease.id, target)) {
      chargesSkipped += 1;
      continue;
    }
    const previousCharge = await findCharge(lease.id, previous);
    const draft = buildChargeDraft({
      lease: toTerms(lease),
      year: target.year,
      month: target.month,
      previousCharge,
      asOf,
    });
    try {
      await prisma.rentCharge.create({ data: { leaseId: lease.id, ...draft } });
      chargesCreated += 1;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      chargesSkipped += 1;
    }
  }

  // ---- 2. 이월 정정 (기한 전 + 이월액이 실린 청구만) ----
  const adjustable = await prisma.rentCharge.findMany({
    where: { carriedOverAmount: { gt: 0 }, dueDate: { gt: asOf } },
    select: {
      id: true,
      leaseId: true,
      year: true,
      month: true,
      carriedOverAmount: true,
      lateFeeAmount: true,
      paidAmount: true,
      lease: { select: LEASE_TERMS_SELECT },
    },
  });

  let carriedOverAdjusted = 0;
  for (const charge of adjustable) {
    const previousCharge = await findCharge(charge.leaseId, previousMonth(charge));
    const draft = buildChargeDraft({
      lease: toTerms(charge.lease),
      year: charge.year,
      month: charge.month,
      previousCharge,
      asOf,
      paidAmount: charge.paidAmount,
    });
    if (
      draft.carriedOverAmount === charge.carriedOverAmount &&
      draft.lateFeeAmount === charge.lateFeeAmount
    ) {
      continue;
    }
    await prisma.rentCharge.update({
      where: { id: charge.id },
      data: {
        carriedOverAmount: draft.carriedOverAmount,
        lateFeeAmount: draft.lateFeeAmount,
        totalDue: draft.totalDue,
      },
    });
    carriedOverAdjusted += 1;
  }

  // ---- 3. 상태 재판정 (납부일 경과 → OVERDUE 포함) ----
  const openCharges = await prisma.rentCharge.findMany({
    select: { id: true, dueDate: true, totalDue: true, paidAmount: true, status: true },
  });

  const statusBreakdown: Record<ChargeStatus, number> = {
    SCHEDULED: 0,
    PARTIALLY_PAID: 0,
    PAID: 0,
    OVERDUE: 0,
  };
  let statusChanged = 0;

  for (const charge of openCharges) {
    const next = resolveChargeStatus({
      totalDue: charge.totalDue,
      paidAmount: charge.paidAmount,
      dueDate: charge.dueDate,
      asOf,
    });
    if (next === charge.status) continue;
    await prisma.rentCharge.update({ where: { id: charge.id }, data: { status: next } });
    statusBreakdown[next] += 1;
    statusChanged += 1;
  }

  // ---- 4. 만기 90일 전 알림 (계약당 1건) ----
  const expiryWindowEnd = addDays(asOf, EXPIRY_NOTICE_DAYS);
  const expiringLeases = await prisma.lease.findMany({
    where: {
      status: LeaseStatus.ACTIVE,
      endDate: { gte: asOf, lte: expiryWindowEnd },
    },
    select: LEASE_TERMS_SELECT,
    orderBy: { endDate: "asc" },
  });

  const alreadyNotified = await prisma.messageLog.findMany({
    where: {
      kind: MessageKind.CONTRACT_EXPIRY,
      leaseId: { in: expiringLeases.map((lease) => lease.id) },
    },
    select: { leaseId: true },
  });
  const notifiedLeaseIds = new Set(alreadyNotified.map((log) => log.leaseId));

  // MessageLog 에는 (leaseId, kind) 유니크가 없다 — 중복 방지는 위 조회에 의존한다.
  // 하루 1회 크론 + 어드민 수동 버튼 수준에서는 충분하고, DB 차원 보장이 필요해지면
  // 스키마에 `@@unique([leaseId, kind])` 를 추가해야 한다(T1.4 범위 밖: 스키마 변경 금지).
  let expiryNoticesSent = 0;
  for (const lease of expiringLeases) {
    if (notifiedLeaseIds.has(lease.id)) continue;
    const where = `${lease.unit.building.name} ${lease.unit.label}`;
    const endsOn = formatDateKey(lease.endDate);
    await prisma.messageLog.create({
      data: {
        kind: MessageKind.CONTRACT_EXPIRY,
        toPhone: lease.tenantPhone,
        title: `${where} 계약 만기 안내`,
        body: `${where} 임대차 계약이 ${endsOn} 만료됩니다. 재계약 여부를 확인해 주세요.`,
        leaseId: lease.id,
      },
    });
    expiryNoticesSent += 1;
    notifiedLeaseIds.add(lease.id);
  }

  return {
    ranAt: now.toISOString(),
    today: formatDateKey(asOf),
    targetMonth: target,
    leasesScanned: activeLeases.length,
    chargesCreated,
    chargesSkipped,
    carriedOverAdjusted,
    statusChanged,
    statusBreakdown,
    expiryNoticesSent,
    expiryNoticesSkipped: expiringLeases.length - expiryNoticesSent,
    durationMs: Date.now() - startedAt,
  };
}
