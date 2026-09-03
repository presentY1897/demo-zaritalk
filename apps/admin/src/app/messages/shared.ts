/**
 * `/messages` 화면이 읽는 응답 타입 미러 + 필터 (T6.3).
 */
import type { PageMeta } from "../_shell/format";

export type AdminMessageRow = {
  id: string;
  kind: string;
  kindLabel: string;
  /** 마스킹된 수신 번호 */
  toPhone: string;
  title: string;
  /** 알림톡 말풍선에 그대로 그린다. OTP 는 인증번호가 가려져서 온다 */
  body: string;
  sentAt: string;
  openedAt: string | null;
  opened: boolean;
  leaseId: string | null;
  chargeId: string | null;
  buildingName: string | null;
  unitLabel: string | null;
  tenantName: string | null;
  noticePath: string | null;
};

export type AdminMessageList = {
  messages: AdminMessageRow[];
  kindCounts: { kind: string; label: string; count: number }[];
  openedCount: number;
  unopenedCount: number;
  page: PageMeta;
  q: string;
};

export type MessageListResult =
  | ({ ok: true } & AdminMessageList)
  | { ok: false; status: number | null; message: string };

export const OPENED_TABS: { key: string; label: string; value?: string }[] = [
  { key: "all", label: "전체" },
  { key: "opened", label: "열람", value: "opened" },
  { key: "unopened", label: "미열람", value: "unopened" },
];
