/**
 * 어드민 조회 API 응답 타입 (T6.3).
 *
 * **`@zari/db` 를 import 하지 않는다** — 어드민 앱(별도 Next 앱)이 이 파일을 그대로 읽을 수는
 * 없지만(패키지가 다르다), `apps/admin/src/app/<화면>/shared.ts` 가 **이 모양을 미러**한다.
 * 두 곳이 어긋나면 화면이 조용히 빈칸을 그리므로, 필드를 늘릴 때는 항상 짝을 맞춘다.
 *
 * 날짜는 JSON 직렬화를 거치므로 전부 문자열이다 —
 * `@db.Date` 컬럼(`startDate`·`endDate`·`dueDate`)은 `YYYY-MM-DD`, 나머지는 ISO 문자열.
 *
 * **전화번호 필드는 전부 마스킹된 값**이다(`mask.ts` 참고) — 원문은 응답에 실리지 않는다.
 */
import type { PageMeta } from "./pagination";

export type { PageMeta };

export type ProfileTypeValue = "LANDLORD" | "TENANT" | "REALTOR" | "MASTER";
export type LeaseStatusValue = "PENDING_TENANT" | "ACTIVE" | "ENDED" | "CANCELLED";
export type ChargeStatusValue = "SCHEDULED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "brand";

/** 로그인한 관리자 — 어드민 앱의 셸이 이름을 띄운다 */
export type AdminIdentityDto = {
  id: string;
  name: string;
  /** 마스킹된 번호 */
  phone: string;
};

// ===================== /users =====================

export type AdminUserRowDto = {
  id: string;
  name: string;
  phone: string;
  isAdmin: boolean;
  createdAt: string;
  profileTypes: ProfileTypeValue[];
  /** 세입자로 연결된 계약 수 */
  tenantLeaseCount: number;
  /** 임대인으로 보유한 건물 수 */
  buildingCount: number;
  refundCount: number;
};

export type AdminUserListDto = { users: AdminUserRowDto[]; page: PageMeta; q: string };

export type AdminProfileDto = {
  id: string;
  type: ProfileTypeValue;
  createdAt: string;
  /** 중개인·협력업체 부가정보 한 줄 요약. 없으면 null */
  detail: string | null;
};

export type AdminUserLeaseDto = {
  id: string;
  /** 이 회원이 그 계약에서 맡은 쪽 */
  role: "TENANT" | "LANDLORD";
  status: LeaseStatusValue;
  statusLabel: string;
  statusTone: StatusTone;
  buildingName: string;
  unitLabel: string;
  counterpartName: string;
  deposit: number;
  monthlyRent: number;
  startDate: string;
  endDate: string;
};

/** 타임라인 한 줄 — 무엇이 언제 있었는지. `kind` 로 배지 색을 고른다 */
export type AdminTimelineKind =
  | "SIGNUP"
  | "PROFILE"
  | "LEASE"
  | "REFUND"
  | "COMPLAINT"
  | "REPORT"
  | "MESSAGE";

export type AdminTimelineEntryDto = {
  id: string;
  at: string;
  kind: AdminTimelineKind;
  kindLabel: string;
  title: string;
  description: string | null;
};

export type AdminUserDetailDto = {
  user: AdminUserRowDto;
  profiles: AdminProfileDto[];
  leases: AdminUserLeaseDto[];
  timeline: AdminTimelineEntryDto[];
  /** 타임라인이 잘렸는지 — 잘렸으면 화면이 그렇게 밝힌다 */
  timelineTruncated: boolean;
};

// ===================== /leases =====================

export type AdminLeaseRowDto = {
  id: string;
  status: LeaseStatusValue;
  statusLabel: string;
  statusTone: StatusTone;
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
  /** 저장된 상태가 `OVERDUE` 인 청구 수 — 목록 필터와 같은 기준 */
  overdueCount: number;
  /** 원장 엔진 `isDelinquent` 기준(부분납 포함) — `overdueCount` 보다 크거나 같다 */
  delinquentCount: number;
  /** 기한이 지난 청구들의 미납 잔액 합 */
  outstandingAmount: number;
  /** 가장 오래 밀린 청구의 연체일수 */
  maxOverdueDays: number;
};

export type AdminLeaseListDto = {
  leases: AdminLeaseRowDto[];
  counts: Record<LeaseStatusValue, number>;
  overdueTotal: number;
  page: PageMeta;
  q: string;
};

// ===================== /charges =====================

export type AdminChargeRowDto = {
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
  status: ChargeStatusValue;
  statusLabel: string;
  statusTone: StatusTone;
  /** 아래 셋은 전부 원장 엔진(`@/lib/rent`)이 오늘 기준으로 판정한 값이다 */
  outstanding: number;
  overdueDays: number;
  delinquent: boolean;
  paymentCount: number;
  buildingName: string;
  unitLabel: string;
  tenantName: string;
  tenantPhone: string;
};

export type AdminChargeListDto = {
  charges: AdminChargeRowDto[];
  counts: Record<ChargeStatusValue, number>;
  page: PageMeta;
  /** `?leaseId=` 드릴다운일 때만 채워진다 */
  lease: AdminLeaseRowDto | null;
  /** 기준일(KST) — 연체일수가 언제 기준인지 화면에 밝힌다 */
  asOf: string;
};

// ===================== /messages =====================

export type AdminMessageRowDto = {
  id: string;
  kind: string;
  kindLabel: string;
  toPhone: string;
  title: string;
  body: string;
  sentAt: string;
  openedAt: string | null;
  opened: boolean;
  leaseId: string | null;
  chargeId: string | null;
  buildingName: string | null;
  unitLabel: string | null;
  tenantName: string | null;
  /** 공개 고지서 경로(T1.8). 토큰이 없으면 null */
  noticePath: string | null;
};

export type AdminMessageListDto = {
  messages: AdminMessageRowDto[];
  kindCounts: { kind: string; label: string; count: number }[];
  openedCount: number;
  unopenedCount: number;
  page: PageMeta;
  q: string;
};

// ===================== /events =====================

export type AdminEventRowDto = {
  id: string;
  name: string;
  anonId: string;
  userId: string | null;
  userName: string | null;
  path: string | null;
  sessionId: string | null;
  props: string | null;
  createdAt: string;
};

/** 시간대별(KST 0~23시) 카운트 — 24칸이 항상 다 있다(0건도 자리를 남긴다) */
export type AdminHourBucketDto = { hour: number; count: number };

export type AdminEventListDto = {
  events: AdminEventRowDto[];
  names: { name: string; count: number }[];
  hourly: AdminHourBucketDto[];
  range: { from: string; to: string };
  /** 시간대 집계에 실제로 쓰인 건수(상한에 걸려 잘렸다면 total 보다 작다) */
  sampled: number;
  sampleTruncated: boolean;
  page: PageMeta;
};
