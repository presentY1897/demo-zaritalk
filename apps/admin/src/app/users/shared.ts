/**
 * `/users` 화면이 읽는 응답 타입 미러 (T6.3).
 *
 * 어드민은 별도 Next 앱이라 `apps/web/src/features/admin/types.ts` 를 import 할 수 없다.
 * 그래서 **모양만 베낀다** — 규칙(마스킹·정렬·건수)은 전부 web 이 들고 있고, 여기 있는 것은
 * "응답을 읽기 위한 타입" 일 뿐이다(T2.5·T4.2 의 `shared.ts` 와 같은 성격).
 */
import type { PageMeta } from "../_shell/format";

export type AdminUserRow = {
  id: string;
  name: string;
  /** 마스킹된 번호 — web 이 가려서 준다 */
  phone: string;
  isAdmin: boolean;
  createdAt: string;
  profileTypes: string[];
  tenantLeaseCount: number;
  buildingCount: number;
  refundCount: number;
};

export type AdminUserList = { users: AdminUserRow[]; page: PageMeta; q: string };

export type AdminProfile = {
  id: string;
  type: string;
  createdAt: string;
  detail: string | null;
};

export type AdminUserLease = {
  id: string;
  role: "TENANT" | "LANDLORD";
  status: string;
  statusLabel: string;
  statusTone: string;
  buildingName: string;
  unitLabel: string;
  counterpartName: string;
  deposit: number;
  monthlyRent: number;
  startDate: string;
  endDate: string;
};

export type AdminTimelineEntry = {
  id: string;
  at: string;
  kind: string;
  kindLabel: string;
  title: string;
  description: string | null;
};

export type AdminUserDetail = {
  user: AdminUserRow;
  profiles: AdminProfile[];
  leases: AdminUserLease[];
  timeline: AdminTimelineEntry[];
  timelineTruncated: boolean;
};

export type UserListResult =
  | ({ ok: true } & AdminUserList)
  | { ok: false; status: number | null; message: string };

export type UserDetailResult =
  | ({ ok: true } & AdminUserDetail)
  | { ok: false; status: number | null; message: string };

/** 타임라인 배지 톤 — 종류마다 다르게 두되, 뜻은 언제나 글자(`kindLabel`)가 진다 */
export const TIMELINE_TONE: Record<string, string> = {
  SIGNUP: "brand",
  PROFILE: "info",
  LEASE: "success",
  REFUND: "warning",
  COMPLAINT: "neutral",
  REPORT: "danger",
  MESSAGE: "neutral",
};
