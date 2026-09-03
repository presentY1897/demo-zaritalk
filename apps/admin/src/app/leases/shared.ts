/**
 * `/leases` 화면이 읽는 응답 타입 미러 + 필터 정의 (T6.3).
 * 규칙은 web 이 들고 있고 여기 있는 것은 "응답을 읽기 위한 타입" 이다.
 */
import type { PageMeta } from "../_shell/format";

export type AdminLeaseRow = {
  id: string;
  status: string;
  statusLabel: string;
  statusTone: string;
  buildingName: string;
  unitLabel: string;
  landlordName: string;
  tenantName: string;
  tenantPhone: string;
  tenantLinked: boolean;
  deposit: number;
  monthlyRent: number;
  maintenanceFee: number;
  paymentDay: number;
  startDate: string;
  endDate: string;
  chargeCount: number;
  /** 저장된 상태가 OVERDUE 인 청구 수 (목록 필터와 같은 기준) */
  overdueCount: number;
  /** 원장 엔진 판정 — 부분납까지 포함한 "기한 경과 미납" */
  delinquentCount: number;
  outstandingAmount: number;
  maxOverdueDays: number;
};

export type AdminLeaseList = {
  leases: AdminLeaseRow[];
  counts: Record<string, number>;
  overdueTotal: number;
  page: PageMeta;
  q: string;
};

export type LeaseListResult =
  | ({ ok: true } & AdminLeaseList)
  | { ok: false; status: number | null; message: string };

/** 상태 탭 — 라벨은 web 의 상태 라벨과 같은 문구다 */
export const LEASE_TABS: { key: string; label: string; status?: string }[] = [
  { key: "all", label: "전체" },
  { key: "ACTIVE", label: "계약중", status: "ACTIVE" },
  { key: "PENDING_TENANT", label: "세입자 연결 대기", status: "PENDING_TENANT" },
  { key: "ENDED", label: "종료", status: "ENDED" },
  { key: "CANCELLED", label: "취소", status: "CANCELLED" },
];
