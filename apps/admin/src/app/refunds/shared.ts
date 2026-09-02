/**
 * 환급 심사 화면이 서버·클라이언트에서 함께 쓰는 타입·상수 (T2.5).
 *
 * `actions.ts` 는 `"use server"` 파일이라 **async 함수 말고는 export 할 수 없어서** 여기로 뺐다
 * (T1.4 크론 트리거 `cron/shared.ts` 와 같은 구조).
 *
 * ## 여기에 **상태 머신을 옮겨 오지 않았다**
 *
 * 어드민은 별도 Next 앱이라 `apps/web/src/features/**` 를 import 할 수 없다. 그래서 상태 전이표를
 * 여기에 복사하고 싶은 유혹이 있는데, 그러면 규칙이 두 벌이 되어 한쪽만 고치는 사고가 난다.
 * 대신 web 이 응답에 **`availableActions`(지금 누를 수 있는 버튼)**과 `statusLabel`·`statusTone` 을
 * 실어 보내고, 어드민은 그것을 **그대로 그린다**. 판정은 언제나
 * `apps/web/src/features/refund/status.ts` 한 곳이다.
 *
 * 아래 타입은 그 응답을 읽기 위한 **미러**일 뿐이고, 규칙은 하나도 담고 있지 않다.
 */

export type AdminBadgeTone = "success" | "warning" | "danger" | "info" | "neutral" | "brand";

export type AdminRefundDocument = {
  id: string;
  slot: string;
  slotLabel: string;
  name: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  stage: "INITIAL" | "SUPPLEMENT";
  /** web 의 서류 뷰어 경로. 어드민은 이 경로를 **자기 프록시**(`/refunds/documents`)로 감싸 연다 */
  viewHref: string;
};

export type AdminRefundAction = {
  action: string;
  label: string;
  targetStatus: string;
  requiresNote: boolean;
};

export type AdminRefundYearRow = {
  year: number;
  months: number;
  paidRent: number;
  eligibleRent: number;
  cappedOutRent: number;
  creditRatePercent: number;
  creditAmount: number;
};

export type AdminRefundCalc = {
  asOf: string;
  retroRange: { fromYear: number; toYear: number };
  years: AdminRefundYearRow[];
  totals: {
    months: number;
    paidRent: number;
    eligibleRent: number;
    cappedOutRent: number;
    creditAmount: number;
  };
  ineligibleReason: string | null;
};

export type AdminRefundItem = {
  id: string;
  status: string;
  statusLabel: string;
  statusTone: AdminBadgeTone;
  statusDescription: string;

  annualIncome: number;
  monthlyRent: number;
  startDate: string;
  endDate: string;
  asOf: string;

  startYear: number;
  endYear: number;
  expectedAmount: number;

  leaseId: string | null;
  lease: {
    leaseId: string;
    unitLabel: string;
    buildingName: string;
    landlordName: string;
    monthlyRent: number;
    startDate: string;
    endDate: string;
  } | null;

  documents: AdminRefundDocument[];
  missingSlots: string[];

  reviewNote: string | null;
  reviewedByName: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;

  calc: AdminRefundCalc;
  availableActions: AdminRefundAction[];

  tenantName: string;
  tenantPhone: string;
  tenantProfileId: string;
};

export type AdminRefundQueue = {
  applications: AdminRefundItem[];
  counts: Record<string, number>;
};

export type QueueResult =
  | ({ ok: true } & AdminRefundQueue)
  | { ok: false; status: number | null; message: string };

export type ReviewActionResult =
  | {
      ok: true;
      application: AdminRefundItem;
      notification: { id: string; title: string; toPhone: string; sentAt: string };
    }
  | { ok: false; status: number | null; message: string };

/** 상태 필터 탭 — 라벨은 web 의 `REFUND_STATUS_META` 와 같은 문구를 쓴다 */
export const REFUND_FILTERS: readonly { key: string; label: string; statuses: string[] }[] = [
  { key: "QUEUE", label: "처리 대기", statuses: ["SUBMITTED", "REVIEWING", "NEED_MORE_DOCS"] },
  { key: "SUBMITTED", label: "제출", statuses: ["SUBMITTED"] },
  { key: "REVIEWING", label: "심사중", statuses: ["REVIEWING"] },
  { key: "NEED_MORE_DOCS", label: "보완요청", statuses: ["NEED_MORE_DOCS"] },
  { key: "APPROVED", label: "승인", statuses: ["APPROVED"] },
  { key: "REJECTED", label: "반려", statuses: ["REJECTED"] },
  { key: "COMPLETED", label: "완료", statuses: ["COMPLETED"] },
  { key: "DRAFT", label: "작성중", statuses: ["DRAFT"] },
];

export const DEFAULT_FILTER = "QUEUE";

export function resolveFilter(key: string | undefined): (typeof REFUND_FILTERS)[number] {
  return REFUND_FILTERS.find((filter) => filter.key === key) ?? REFUND_FILTERS[0]!;
}

/** 어드민 프록시 경로 — 서류는 web 의 private Blob 이라 어드민 서버가 대신 받아 온다 */
export function adminDocumentHref(applicationId: string, documentId: string): string {
  const params = new URLSearchParams({ applicationId, documentId });
  return `/refunds/documents?${params.toString()}`;
}

export function formatKrw(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}
