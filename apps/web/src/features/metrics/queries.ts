/**
 * 지표 조회 (T6.2) — **DB 를 읽고 순수 집계 함수에 넘기기만 한다.**
 *
 * 계산은 한 줄도 여기 없다: 수납률은 `collection.ts`(원장 엔진 위임), 퍼널은 `funnel.ts`,
 * 시간 버킷은 `series.ts` 다. 그래야 집계 규칙이 DB 없이 단위 테스트로 지켜진다.
 *
 * ## 조회 범위와 버킷이 같은 경계를 쓴다
 *
 * `dayRangeStart`·`monthRangeStart` 가 만드는 UTC 시각은 KST 버킷의 첫 순간이다.
 * 범위와 버킷이 어긋나면 범위에 걸린 행이 버킷에서 탈락해 조용히 사라진다(T1.6 이 겪은 함정).
 */
import { prisma, RefundStatus, TossPaymentStatus } from "@zari/db";
import { findExperiment } from "@/features/ab/experiments";
import { REFUND_STATUS_META, REFUND_STATUS_ORDER } from "@/features/refund/status";
import { buildCollectionRate, type CollectionSummary } from "./collection";
import { buildFunnel, type FunnelEventInput, type FunnelResult } from "./funnel";
import {
  dayRangeStart,
  kstDateKey,
  kstMonthKey,
  monthRangeStart,
  ratio,
  recentDayKeys,
  recentMonths,
} from "./series";

export const DEFAULT_DAYS = 30;
export const DEFAULT_MONTHS = 6;
export const MAX_DAYS = 180;
export const MAX_MONTHS = 24;

export type DailyPoint = {
  date: string;
  /** 그날 가입한 계정 수 (`User.createdAt`) */
  signups: number;
  /** 그날 이벤트를 남긴 **순 방문자** 수 (`TrackingEvent.anonId` 중복 제거) */
  dau: number;
};

export type MessageBucket = {
  key: string;
  label: string;
  /** 발송 건수 전체 */
  sent: number;
  /** 그중 열람을 판정할 수 있는 발송 — 공개 고지서 링크(token)가 붙은 것만 */
  trackable: number;
  opened: number;
  /** `opened / trackable` (0~1) */
  openRate: number;
};

export type PaymentBucket = { key: string; label: string; amount: number; count: number };

export type RefundStage = {
  status: string;
  label: string;
  tone: string;
  count: number;
  expectedAmount: number;
};

export type MetricsOverview = {
  generatedAt: string;
  range: { days: number; months: number; from: string; to: string };
  summary: {
    users: number;
    newUsers: number;
    visitors: number;
    activeLeases: number;
    collectionRate: number;
    outstandingAmount: number;
    openRate: number;
    paymentAmount: number;
    refundOpenCount: number;
  };
  daily: DailyPoint[];
  collection: CollectionSummary;
  messages: { months: MessageBucket[]; total: Omit<MessageBucket, "key" | "label"> };
  payments: { months: PaymentBucket[]; total: { amount: number; count: number } };
  refunds: { stages: RefundStage[]; total: { count: number; expectedAmount: number } };
};

export function clampDays(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_DAYS;
  return Math.min(Math.max(1, Math.trunc(value)), MAX_DAYS);
}

export function clampMonths(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_MONTHS;
  return Math.min(Math.max(1, Math.trunc(value)), MAX_MONTHS);
}

/** 대시보드 한 화면치 집계. 빈 DB 에서도 모든 버킷이 0으로 채워져 나온다. */
export async function getMetricsOverview(
  options: { days?: number; months?: number; now?: Date } = {},
): Promise<MetricsOverview> {
  const now = options.now ?? new Date();
  const days = clampDays(options.days);
  const months = clampMonths(options.months);

  const dayKeys = recentDayKeys(days, now);
  const monthKeys = recentMonths(months, now);
  const daysFrom = dayRangeStart(days, now);
  const monthsFrom = monthRangeStart(months, now);

  const [
    userCount,
    activeLeases,
    signupRows,
    visitRows,
    chargeRows,
    messageRows,
    paymentRows,
    refundGroups,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.lease.count({ where: { status: "ACTIVE" } }),
    prisma.user.findMany({
      where: { createdAt: { gte: daysFrom } },
      select: { createdAt: true },
    }),
    prisma.trackingEvent.findMany({
      where: { createdAt: { gte: daysFrom } },
      select: { anonId: true, createdAt: true },
    }),
    prisma.rentCharge.findMany({
      where: { OR: monthKeys.map(({ year, month }) => ({ year, month })) },
      select: {
        year: true,
        month: true,
        rentAmount: true,
        maintenanceAmount: true,
        carriedOverAmount: true,
        lateFeeAmount: true,
        payments: { select: { amount: true } },
      },
    }),
    prisma.messageLog.findMany({
      where: { sentAt: { gte: monthsFrom } },
      select: { sentAt: true, openedAt: true, token: true },
    }),
    prisma.tossPayment.findMany({
      where: { status: TossPaymentStatus.DONE, createdAt: { gte: monthsFrom } },
      select: { amount: true, approvedAt: true, createdAt: true },
    }),
    prisma.refundApplication.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { expectedAmount: true },
    }),
  ]);

  // ── 가입·DAU 일별
  const signupsByDay = new Map(dayKeys.map((key) => [key, 0]));
  for (const row of signupRows) {
    const key = kstDateKey(row.createdAt);
    if (signupsByDay.has(key)) signupsByDay.set(key, (signupsByDay.get(key) ?? 0) + 1);
  }
  const visitorsByDay = new Map(dayKeys.map((key) => [key, new Set<string>()]));
  const visitors = new Set<string>();
  for (const row of visitRows) {
    const key = kstDateKey(row.createdAt);
    visitorsByDay.get(key)?.add(row.anonId);
    visitors.add(row.anonId);
  }
  const daily: DailyPoint[] = dayKeys.map((date) => ({
    date,
    signups: signupsByDay.get(date) ?? 0,
    dau: visitorsByDay.get(date)?.size ?? 0,
  }));

  // ── 수납률(청구 대비 납부) — 계산은 전부 원장 엔진
  const collection = buildCollectionRate(chargeRows, monthKeys);

  // ── 발송·열람률
  const messageBuckets = new Map(
    monthKeys.map((month) => [
      month.key,
      { key: month.key, label: month.label, sent: 0, trackable: 0, opened: 0, openRate: 0 },
    ]),
  );
  let sentTotal = 0;
  let trackableTotal = 0;
  let openedTotal = 0;
  for (const row of messageRows) {
    const bucket = messageBuckets.get(kstMonthKey(row.sentAt));
    if (!bucket) continue;
    bucket.sent += 1;
    sentTotal += 1;
    // 열람은 공개 고지서 링크가 있는 발송에서만 판정된다(T1.8) — OTP·안내 문자에는 없다
    if (row.token) {
      bucket.trackable += 1;
      trackableTotal += 1;
      if (row.openedAt) {
        bucket.opened += 1;
        openedTotal += 1;
      }
    }
  }
  const messageMonths = [...messageBuckets.values()].map((bucket) => ({
    ...bucket,
    openRate: ratio(bucket.opened, bucket.trackable),
  }));

  // ── 결제액(자리페이 승인분)
  const paymentBuckets = new Map(
    monthKeys.map((month) => [month.key, { key: month.key, label: month.label, amount: 0, count: 0 }]),
  );
  let paymentAmount = 0;
  let paymentCount = 0;
  for (const row of paymentRows) {
    const bucket = paymentBuckets.get(kstMonthKey(row.approvedAt ?? row.createdAt));
    if (!bucket) continue;
    bucket.amount += row.amount;
    bucket.count += 1;
    paymentAmount += row.amount;
    paymentCount += 1;
  }

  // ── 환급 파이프라인 (T2.5 의 상태 정의를 그대로 쓴다)
  const refundByStatus = new Map(
    refundGroups.map((group) => [
      group.status,
      { count: group._count._all, expectedAmount: group._sum.expectedAmount ?? 0 },
    ]),
  );
  const stages: RefundStage[] = REFUND_STATUS_ORDER.map((status) => {
    const row = refundByStatus.get(status as RefundStatus);
    return {
      status,
      label: REFUND_STATUS_META[status].label,
      tone: REFUND_STATUS_META[status].tone,
      count: row?.count ?? 0,
      expectedAmount: row?.expectedAmount ?? 0,
    };
  });
  const refundOpenCount = stages
    .filter((stage) =>
      ([RefundStatus.SUBMITTED, RefundStatus.REVIEWING, RefundStatus.NEED_MORE_DOCS] as string[]).includes(
        stage.status,
      ),
    )
    .reduce((sum, stage) => sum + stage.count, 0);

  return {
    generatedAt: now.toISOString(),
    range: {
      days,
      months,
      from: dayKeys[0] ?? "",
      to: dayKeys.at(-1) ?? "",
    },
    summary: {
      users: userCount,
      newUsers: daily.reduce((sum, point) => sum + point.signups, 0),
      visitors: visitors.size,
      activeLeases,
      collectionRate: collection.total.rate,
      outstandingAmount: collection.total.outstandingAmount,
      openRate: ratio(openedTotal, trackableTotal),
      paymentAmount,
      refundOpenCount,
    },
    daily,
    collection,
    messages: {
      months: messageMonths,
      total: {
        sent: sentTotal,
        trackable: trackableTotal,
        opened: openedTotal,
        openRate: ratio(openedTotal, trackableTotal),
      },
    },
    payments: {
      months: [...paymentBuckets.values()],
      total: { amount: paymentAmount, count: paymentCount },
    },
    refunds: {
      stages,
      total: {
        count: stages.reduce((sum, stage) => sum + stage.count, 0),
        expectedAmount: stages.reduce((sum, stage) => sum + stage.expectedAmount, 0),
      },
    },
  };
}

/** 변형별 퍼널. 등록되지 않은 실험 키면 `null`(호출부가 404). */
export async function getExperimentFunnel(experimentKey: string): Promise<FunnelResult | null> {
  const spec = findExperiment(experimentKey);
  if (!spec) return null;

  const [assignments, eventRows] = await Promise.all([
    prisma.abAssignment.findMany({
      where: { experimentKey: spec.key },
      select: { anonId: true, variant: true, userId: true },
    }),
    // 이름으로만 좁힌다(`@@index([name, createdAt])`). 배정되지 않은 방문자의 이벤트는
    // 집계 함수가 걸러낸다 — anonId 를 IN 절에 몰아넣는 것보다 쿼리가 안정적이다.
    prisma.trackingEvent.findMany({
      where: { name: { in: spec.funnel.map((step) => step.event) } },
      select: { anonId: true, name: true, props: true },
    }),
  ]);

  const events: FunnelEventInput[] = eventRows.map((row) => ({
    anonId: row.anonId,
    name: row.name,
    variant: readVariantProp(row.props),
  }));

  return buildFunnel({
    spec,
    assignments: assignments.map((row) => ({ anonId: row.anonId, variant: row.variant })),
    events,
    linkedUsers: assignments.filter((row) => row.userId).length,
  });
}

/** `props.variant` 를 안전하게 꺼낸다 — Json 컬럼이라 무엇이든 들어올 수 있다. */
function readVariantProp(props: unknown): string | null {
  if (typeof props !== "object" || props === null) return null;
  const value = (props as Record<string, unknown>).variant;
  return typeof value === "string" ? value : null;
}
