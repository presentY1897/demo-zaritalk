/**
 * 지표 대시보드가 서버·차트에서 함께 쓰는 타입·포맷 (T6.2).
 *
 * `actions.ts` 는 `"use server"` 파일이라 **async 함수 말고는 export 할 수 없어서** 여기로 뺐다
 * (T1.4 크론 트리거·T2.5 환급 심사와 같은 구조).
 *
 * ## 여기에 **집계 규칙을 옮겨 오지 않았다**
 *
 * 어드민은 별도 Next 앱이라 `apps/web/src/features/**` 를 import 할 수 없다. 수납률 산식이나
 * 퍼널 단계 정의를 여기에 복사하면 규칙이 두 벌이 되어 한쪽만 고치는 사고가 난다.
 * 그래서 web 이 응답에 **단계 목록(`steps`)·라벨·비율까지 계산해서** 실어 보내고,
 * 이 화면은 받은 것을 그대로 그린다(T2.5 가 `availableActions` 로 푼 방식 그대로).
 * 아래 타입은 그 응답을 읽기 위한 **미러**일 뿐 규칙을 하나도 담고 있지 않다.
 */

export type DailyPoint = { date: string; signups: number; dau: number };

export type CollectionBucket = {
  key: string;
  label: string;
  year: number;
  month: number;
  chargedAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
  chargeCount: number;
  settledCount: number;
  rate: number;
};

export type MessageBucket = {
  key: string;
  label: string;
  sent: number;
  trackable: number;
  opened: number;
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
  collection: {
    months: CollectionBucket[];
    total: Omit<CollectionBucket, "key" | "label" | "year" | "month">;
  };
  messages: { months: MessageBucket[]; total: Omit<MessageBucket, "key" | "label"> };
  payments: { months: PaymentBucket[]; total: { amount: number; count: number } };
  refunds: { stages: RefundStage[]; total: { count: number; expectedAmount: number } };
};

export type FunnelStep = {
  event: string;
  label: string;
  count: number;
  rateFromTop: number;
  rateFromPrev: number;
};

export type FunnelVariant = {
  variant: string;
  label: string;
  assignedCount: number;
  steps: FunnelStep[];
  conversionRate: number;
};

export type FunnelResult = {
  experimentKey: string;
  experimentName: string;
  description: string;
  steps: { event: string; label: string }[];
  variants: FunnelVariant[];
  totals: { assigned: number; linkedUsers: number; countedEvents: number; mismatchedEvents: number };
};

export type Fetched<T> =
  | ({ ok: true } & T)
  | { ok: false; status: number | null; message: string };

export type OverviewResult = Fetched<{ overview: MetricsOverview }>;
export type FunnelFetchResult = Fetched<{ funnel: FunnelResult }>;

// ── 포맷 ──────────────────────────────────────────────────────────────────────

export function formatKrw(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

export function formatCount(value: number, unit = "건"): string {
  return `${value.toLocaleString("ko-KR")}${unit}`;
}

/** 0~1 → `94.3%`. 소수 첫째 자리까지(0·100 은 정수로). */
export function formatPercent(value: number): string {
  const percent = value * 100;
  if (!Number.isFinite(percent)) return "0%";
  if (percent === 0 || percent === 100) return `${percent}%`;
  return `${percent.toFixed(1)}%`;
}

/** `2026-09-03` → `09.03` (일별 차트의 x 라벨) */
export function formatDayLabel(date: string): string {
  return date.slice(5).replace("-", ".");
}

/** `2026-09-03` → `2026년 9월 3일` (스크린리더용 전체 표기) */
export function formatDayFull(date: string): string {
  const [year, month, day] = date.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

export function formatMoment(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

/** 대시보드가 지원하는 구간 — 링크로만 바꾼다(클라이언트 상태 없음) */
export const RANGE_PRESETS = [
  { days: 14, months: 6, label: "최근 14일" },
  { days: 30, months: 6, label: "최근 30일" },
  { days: 90, months: 12, label: "최근 90일" },
] as const;

export const DEFAULT_RANGE = RANGE_PRESETS[1];

export function resolveRange(raw: string | string[] | undefined) {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return RANGE_PRESETS.find((preset) => preset.days === value) ?? DEFAULT_RANGE;
}
