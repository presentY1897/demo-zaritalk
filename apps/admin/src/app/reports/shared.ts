/**
 * 신고 처리 화면이 서버·클라이언트에서 함께 쓰는 타입·상수 (T4.2).
 *
 * `actions.ts` 는 `"use server"` 파일이라 **async 함수 말고는 export 할 수 없어서** 여기로 뺐다
 * (T1.4 크론 트리거·T2.5 환급 심사와 같은 구조).
 *
 * ## 여기에 **모더레이션 규칙을 옮겨 오지 않았다**
 *
 * 어드민은 별도 Next 앱이라 `apps/web/src/features/**` 를 import 할 수 없다. 블라인드 노출 규칙과
 * "지금 누를 수 있는 액션" 을 여기에 복사하면 규칙이 두 벌이 되어 한쪽만 고치는 사고가 난다.
 * 대신 web 이 응답에 **`availableActions`**(버튼 목록·톤·설명)와 `statusLabel`·`statusTone` 을
 * 실어 보내고, 어드민은 그것을 **그대로 그린다**. 판정은 언제나
 * `apps/web/src/features/community/moderation.ts` 한 곳이다.
 *
 * 아래 타입은 그 응답을 읽기 위한 **미러**일 뿐이고, 규칙은 하나도 담고 있지 않다.
 */

export type AdminBadgeTone = "success" | "warning" | "danger" | "info" | "neutral" | "brand";

export type AdminReportAction = {
  action: string;
  label: string;
  tone: "danger" | "neutral";
  description: string;
};

export type AdminReportTarget = {
  type: "POST" | "COMMENT";
  id: string;
  postId: string;
  postTitle: string;
  regionName: string;
  body: string;
  authorName: string;
  authorProfileType: string;
  createdAt: string;
  moderation: "VISIBLE" | "BLINDED" | "REMOVED";
};

export type AdminReportItem = {
  id: string;
  targetType: "POST" | "COMMENT";
  targetId: string;
  reason: string;
  status: string;
  statusLabel: string;
  statusTone: AdminBadgeTone;
  createdAt: string;
  reporterName: string;
  reporterProfileType: string;
  handledByName: string | null;
  handledAt: string | null;
  openSiblingCount: number;
  target: AdminReportTarget | null;
  availableActions: AdminReportAction[];
};

export type ReportQueue = {
  reports: AdminReportItem[];
  counts: Record<string, number>;
};

export type QueueResult =
  | ({ ok: true } & ReportQueue)
  | { ok: false; status: number | null; message: string };

export type ReportActionResult =
  | { ok: true; report: AdminReportItem; alsoClosedReportIds: string[] }
  | { ok: false; status: number | null; message: string };

/** 상태 필터 탭 — 라벨은 web 의 상태 라벨과 같은 문구를 쓴다 */
export const REPORT_FILTERS: readonly { key: string; label: string; statuses: string[] }[] = [
  { key: "OPEN", label: "대기", statuses: ["OPEN"] },
  { key: "ACTIONED", label: "블라인드", statuses: ["ACTIONED"] },
  { key: "DISMISSED", label: "기각", statuses: ["DISMISSED"] },
  { key: "ALL", label: "전체", statuses: ["OPEN", "ACTIONED", "DISMISSED"] },
];

export const DEFAULT_FILTER = "OPEN";

export function resolveFilter(key: string | undefined): (typeof REPORT_FILTERS)[number] {
  return REPORT_FILTERS.find((filter) => filter.key === key) ?? REPORT_FILTERS[0]!;
}

/** 프로필 유형 표시명 — 신고자·작성자 라벨. 값은 web 의 `ProfileType` 과 같다 */
export const PROFILE_TYPE_LABEL: Record<string, string> = {
  LANDLORD: "임대인",
  TENANT: "세입자",
  REALTOR: "중개인",
  MASTER: "협력업체",
};

export function profileTypeLabel(type: string): string {
  return PROFILE_TYPE_LABEL[type] ?? type;
}

export function formatMoment(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
