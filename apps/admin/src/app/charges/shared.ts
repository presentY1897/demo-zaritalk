/**
 * `/charges` 화면이 읽는 응답 타입 미러 + 상태 탭 (T6.3).
 */
import type { PageMeta } from "../_shell/format";
import type { AdminLeaseRow } from "../leases/shared";

export type AdminChargeRow = {
  id: string;
  leaseId: string;
  year: number;
  month: number;
  dueDate: string;
  rentAmount: number;
  maintenanceAmount: number;
  carriedOverAmount: number;
  lateFeeAmount: number;
  totalDue: number;
  paidAmount: number;
  status: string;
  statusLabel: string;
  statusTone: string;
  /** 아래 셋은 원장 엔진이 `asOf` 기준으로 판정한 값이다 */
  outstanding: number;
  overdueDays: number;
  delinquent: boolean;
  paymentCount: number;
  buildingName: string;
  unitLabel: string;
  tenantName: string;
  tenantPhone: string;
};

export type AdminChargeList = {
  charges: AdminChargeRow[];
  counts: Record<string, number>;
  page: PageMeta;
  lease: AdminLeaseRow | null;
  asOf: string;
};

export type ChargeListResult =
  | ({ ok: true } & AdminChargeList)
  | { ok: false; status: number | null; message: string };

export const CHARGE_TABS: { key: string; label: string; status?: string }[] = [
  { key: "all", label: "전체" },
  { key: "OVERDUE", label: "연체", status: "OVERDUE" },
  { key: "PARTIALLY_PAID", label: "부분납", status: "PARTIALLY_PAID" },
  { key: "SCHEDULED", label: "예정", status: "SCHEDULED" },
  { key: "PAID", label: "완납", status: "PAID" },
];
