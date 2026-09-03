/**
 * 어드민 조회 화면의 서버 조회·DTO 조립 (T6.3).
 *
 * 라우트 핸들러는 이 파일의 함수를 부르기만 한다 — 쿼리와 매핑이 라우트마다 흩어지면
 * 마스킹을 한 곳에서 빠뜨리게 된다. **개인정보 마스킹은 전부 여기서** 걸린다(`mask.ts`).
 *
 * ## 이 파일이 지키는 규칙 세 가지
 *
 * 1. **정렬은 언제나 유니크 키(`id`)로 닫는다** — 오프셋 페이지네이션의 경계가 흔들리지 않게
 *    (`pagination.ts` 참고).
 * 2. **연체·미납은 직접 계산하지 않는다** — `@/lib/rent` 의 원장 엔진 함수(`isDelinquent`·
 *    `calcOutstanding`·`calcOverdueDays`)에 넘긴다. `asOf` 에는 항상 `kstToday()` 를 준다(T1.4).
 * 3. **목록 필터는 저장된 상태(`ChargeStatus`)로 건다.** 엔진 판정은 SQL 로 표현할 수 없고
 *    (`paidAmount < totalDue` 같은 컬럼 간 비교), 저장된 상태는 크론이 같은 엔진으로 매일 맞춘다.
 *    대신 행마다 엔진이 판정한 `delinquent`·`outstanding`·`overdueDays` 를 함께 실어 보내
 *    "연체(저장)" 와 "기한 경과 미납(엔진, 부분납 포함)" 의 차이가 화면에 드러나게 한다.
 */
import {
  ChargeStatus,
  LeaseStatus,
  prisma,
  type MessageKind,
  type Prisma,
} from "@zari/db";
import { PROFILE_TYPE_META } from "@/features/community/labels";
import { CHARGE_STATUS_META, LEASE_STATUS_META } from "@/features/lease/status";
import { messageKindLabel, MESSAGE_KIND_LABELS } from "@/features/notice/constants";
import {
  calcOutstanding,
  calcOverdueDays,
  formatDateKey,
  isDelinquent,
  kstToday,
} from "@/lib/rent";
import { maskAnonId, maskOtpBody, maskPhone } from "./mask";
import { buildPageMeta, toSkipTake, type PageMeta } from "./pagination";
import { kstHourOf, kstDayRange } from "./period";
import { parseSearchTerm } from "./search";
import type {
  AdminChargeListDto,
  AdminChargeRowDto,
  AdminEventListDto,
  AdminEventRowDto,
  AdminHourBucketDto,
  AdminLeaseListDto,
  AdminLeaseRowDto,
  AdminMessageListDto,
  AdminMessageRowDto,
  AdminProfileDto,
  AdminTimelineEntryDto,
  AdminTimelineKind,
  AdminUserDetailDto,
  AdminUserListDto,
  AdminUserRowDto,
  ChargeStatusValue,
  LeaseStatusValue,
  ProfileTypeValue,
} from "./types";

/** 타임라인은 최근 것부터 이만큼만 — 계정 하나가 화면을 다 먹지 않게 */
export const TIMELINE_LIMIT = 60;
/** 시간대 집계에 훑는 이벤트 상한 — 데모 규모를 훨씬 넘는 값이라 실제로는 걸리지 않는다 */
export const EVENT_SAMPLE_LIMIT = 50_000;

const iso = (date: Date) => date.toISOString();

// ===================== /users =====================

function userWhere(q: string | undefined): Prisma.UserWhereInput {
  const term = parseSearchTerm(q);
  if (!term) return {};
  const clauses: Prisma.UserWhereInput[] = [
    { name: { contains: term.name, mode: "insensitive" } },
  ];
  if (term.digits) clauses.push({ phone: { contains: term.digits } });
  return { OR: clauses };
}

/** 목록 한 줄에 필요한 만큼 — 프로필 유형 + 프로필별 관계 건수 */
const PROFILE_COUNT_SELECT = {
  leasesAsTenant: true,
  buildings: true,
  refundApplications: true,
} as const;

const USER_LIST_INCLUDE = {
  profiles: { select: { type: true, _count: { select: PROFILE_COUNT_SELECT } } },
} satisfies Prisma.UserInclude;

/** 상세는 목록이 쓰는 건수에 더해 유형별 부가정보까지 함께 읽는다(쿼리 한 번) */
const USER_DETAIL_INCLUDE = {
  profiles: {
    include: {
      realtorDetail: true,
      masterDetail: true,
      _count: { select: PROFILE_COUNT_SELECT },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.UserInclude;

/** 목록·상세가 같은 매핑을 쓰도록 "필요한 필드만" 구조적으로 받는다 */
type UserRowSource = {
  id: string;
  name: string;
  phone: string;
  isAdmin: boolean;
  createdAt: Date;
  profiles: {
    type: string;
    _count: { leasesAsTenant: number; buildings: number; refundApplications: number };
  }[];
};

function toUserRow(user: UserRowSource): AdminUserRowDto {
  const sum = (pick: (p: UserRowSource["profiles"][number]) => number) =>
    user.profiles.reduce((total, profile) => total + pick(profile), 0);
  return {
    id: user.id,
    name: user.name,
    phone: maskPhone(user.phone),
    isAdmin: user.isAdmin,
    createdAt: iso(user.createdAt),
    profileTypes: user.profiles.map((p) => p.type as ProfileTypeValue),
    tenantLeaseCount: sum((p) => p._count.leasesAsTenant),
    buildingCount: sum((p) => p._count.buildings),
    refundCount: sum((p) => p._count.refundApplications),
  };
}

export async function listAdminUsers(input: {
  q?: string;
  page: number;
  pageSize: number;
}): Promise<AdminUserListDto> {
  const where = userWhere(input.q);
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: USER_LIST_INCLUDE,
      // 가입 최신순. 같은 밀리초에 만들어진 시드 계정이 흔해 `id` 로 반드시 닫는다
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...toSkipTake(input),
    }),
  ]);

  return { users: users.map(toUserRow), page: buildPageMeta(input, total), q: input.q ?? "" };
}

function profileDetail(profile: {
  realtorDetail: { officeName: string; address: string; radiusKm: number } | null;
  masterDetail: {
    companyName: string;
    address: string;
    categories: string[];
    plan: string;
  } | null;
}): string | null {
  if (profile.realtorDetail) {
    const { officeName, address, radiusKm } = profile.realtorDetail;
    return `${officeName} · ${address} · 반경 ${radiusKm}km`;
  }
  if (profile.masterDetail) {
    const { companyName, address, categories, plan } = profile.masterDetail;
    return `${companyName} · ${address} · ${categories.join(", ")} · ${plan}`;
  }
  return null;
}

/**
 * 회원 1명의 상세 — 프로필 · 계약(양쪽 역할) · 이력 타임라인.
 *
 * 타임라인은 **여러 테이블을 시각으로 합친 것**이다. 전용 감사 로그 테이블이 없어서
 * (T2.4·T4.2 가 같은 이유로 미뤘다) 각 도메인의 시각 컬럼을 모아 만든다 —
 * 가입·프로필 추가·계약·환급 신청 상태·민원·신고·수신한 발송.
 */
export async function getAdminUserDetail(id: string): Promise<AdminUserDetailDto | null> {
  const user = await prisma.user.findUnique({ where: { id }, include: USER_DETAIL_INCLUDE });
  if (!user) return null;

  const profileIds = user.profiles.map((profile) => profile.id);

  const leaseInclude = {
    unit: { include: { building: { include: { ownerProfile: { include: { user: true } } } } } },
  } satisfies Prisma.LeaseInclude;

  const [tenantLeases, landlordLeases, refunds, complaints, reports, messages] =
    await Promise.all([
      prisma.lease.findMany({
        where: { tenantProfileId: { in: profileIds } },
        include: leaseInclude,
        orderBy: [{ startDate: "desc" }, { id: "desc" }],
      }),
      prisma.lease.findMany({
        where: { unit: { building: { ownerProfileId: { in: profileIds } } } },
        include: leaseInclude,
        orderBy: [{ startDate: "desc" }, { id: "desc" }],
      }),
      prisma.refundApplication.findMany({
        where: { tenantProfileId: { in: profileIds } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      prisma.complaint.findMany({
        where: { tenantProfileId: { in: profileIds } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      prisma.report.findMany({
        where: { reporterProfileId: { in: profileIds } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      prisma.messageLog.findMany({
        where: { toPhone: user.phone },
        orderBy: [{ sentAt: "desc" }, { id: "desc" }],
        take: TIMELINE_LIMIT,
      }),
    ]);

  const profiles: AdminProfileDto[] = user.profiles.map((profile) => ({
    id: profile.id,
    type: profile.type as ProfileTypeValue,
    createdAt: iso(profile.createdAt),
    detail: profileDetail(profile),
  }));

  const leases = [
    ...tenantLeases.map((lease) => toUserLease(lease, "TENANT")),
    ...landlordLeases.map((lease) => toUserLease(lease, "LANDLORD")),
  ].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

  const entries: AdminTimelineEntryDto[] = [
    entry(`signup-${user.id}`, user.createdAt, "SIGNUP", "가입", `${user.name} 계정이 만들어졌습니다.`),
    ...user.profiles.map((profile) =>
      entry(
        `profile-${profile.id}`,
        profile.createdAt,
        "PROFILE",
        `${PROFILE_TYPE_META[profile.type as ProfileTypeValue].label} 프로필 추가`,
        profileDetail(profile),
      ),
    ),
    ...tenantLeases.flatMap((lease) => {
      const place = `${lease.unit.building.name} ${lease.unit.label}`;
      const rows = [
        entry(`lease-${lease.id}`, lease.createdAt, "LEASE", `계약 등록 — ${place}`,
          `보증금 ${lease.deposit.toLocaleString("ko-KR")}원 · 월세 ${lease.monthlyRent.toLocaleString("ko-KR")}원`),
      ];
      if (lease.tenantAcceptedAt) {
        rows.push(
          entry(`lease-accept-${lease.id}`, lease.tenantAcceptedAt, "LEASE", `계약 수락 — ${place}`, null),
        );
      }
      return rows;
    }),
    ...refunds.flatMap((refund) => {
      const rows = [
        entry(`refund-${refund.id}`, refund.createdAt, "REFUND", "환급 신청 작성",
          `${refund.startYear}~${refund.endYear}년 · 예상 ${refund.expectedAmount.toLocaleString("ko-KR")}원`),
      ];
      if (refund.submittedAt) {
        rows.push(entry(`refund-submit-${refund.id}`, refund.submittedAt, "REFUND", "환급 신청 제출", null));
      }
      if (refund.decidedAt) {
        rows.push(
          entry(`refund-decide-${refund.id}`, refund.decidedAt, "REFUND", `환급 심사 결정 — ${refund.status}`,
            refund.reviewNote),
        );
      }
      return rows;
    }),
    ...complaints.map((complaint) =>
      entry(`complaint-${complaint.id}`, complaint.createdAt, "COMPLAINT", `민원 접수 — ${complaint.title}`,
        complaint.status),
    ),
    ...reports.map((report) =>
      entry(`report-${report.id}`, report.createdAt, "REPORT", `신고 접수 — ${report.targetType}`, report.reason),
    ),
    ...messages.map((message) =>
      entry(`message-${message.id}`, message.sentAt, "MESSAGE", `발송 — ${messageKindLabel(message.kind)}`,
        message.title),
    ),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1));

  return {
    user: toUserRow(user),
    profiles,
    leases,
    timeline: entries.slice(0, TIMELINE_LIMIT),
    timelineTruncated: entries.length > TIMELINE_LIMIT,
  };
}

const TIMELINE_KIND_LABEL: Record<AdminTimelineKind, string> = {
  SIGNUP: "가입",
  PROFILE: "프로필",
  LEASE: "계약",
  REFUND: "환급",
  COMPLAINT: "민원",
  REPORT: "신고",
  MESSAGE: "발송",
};

function entry(
  id: string,
  at: Date,
  kind: AdminTimelineKind,
  title: string,
  description: string | null,
): AdminTimelineEntryDto {
  return { id, at: iso(at), kind, kindLabel: TIMELINE_KIND_LABEL[kind], title, description };
}

type UserLeaseRow = Prisma.LeaseGetPayload<{
  include: {
    unit: { include: { building: { include: { ownerProfile: { include: { user: true } } } } } };
  };
}>;

function toUserLease(lease: UserLeaseRow, role: "TENANT" | "LANDLORD") {
  const meta = LEASE_STATUS_META[lease.status as LeaseStatusValue];
  return {
    id: lease.id,
    role,
    status: lease.status as LeaseStatusValue,
    statusLabel: meta.label,
    statusTone: meta.tone,
    buildingName: lease.unit.building.name,
    unitLabel: lease.unit.label,
    counterpartName:
      role === "TENANT" ? lease.unit.building.ownerProfile.user.name : lease.tenantName,
    deposit: lease.deposit,
    monthlyRent: lease.monthlyRent,
    startDate: formatDateKey(lease.startDate),
    endDate: formatDateKey(lease.endDate),
  };
}

// ===================== /leases =====================

const LEASE_LIST_INCLUDE = {
  unit: { include: { building: { include: { ownerProfile: { include: { user: true } } } } } },
  charges: { select: { id: true, dueDate: true, totalDue: true, paidAmount: true, status: true } },
} satisfies Prisma.LeaseInclude;

type LeaseListRow = Prisma.LeaseGetPayload<{ include: typeof LEASE_LIST_INCLUDE }>;

function leaseSearchWhere(q: string | undefined): Prisma.LeaseWhereInput {
  const term = parseSearchTerm(q);
  if (!term) return {};
  const clauses: Prisma.LeaseWhereInput[] = [
    { tenantName: { contains: term.name, mode: "insensitive" } },
    { unit: { label: { contains: term.name, mode: "insensitive" } } },
    { unit: { building: { name: { contains: term.name, mode: "insensitive" } } } },
  ];
  if (term.digits) clauses.push({ tenantPhone: { contains: term.digits } });
  return { OR: clauses };
}

function toLeaseRow(lease: LeaseListRow, asOf: Date): AdminLeaseRowDto {
  const meta = LEASE_STATUS_META[lease.status as LeaseStatusValue];
  // 연체·미납은 전부 원장 엔진이 판정한다 — 여기서 다시 계산하지 않는다(T1.4)
  const delinquent = lease.charges.filter((charge) => isDelinquent(charge, asOf));
  const outstandingAmount = delinquent.reduce(
    (total, charge) => total + calcOutstanding(charge.totalDue, charge.paidAmount),
    0,
  );
  const maxOverdueDays = delinquent.reduce(
    (peak, charge) => Math.max(peak, calcOverdueDays(charge.dueDate, asOf)),
    0,
  );

  return {
    id: lease.id,
    status: lease.status as LeaseStatusValue,
    statusLabel: meta.label,
    statusTone: meta.tone,
    buildingName: lease.unit.building.name,
    unitLabel: lease.unit.label,
    landlordName: lease.unit.building.ownerProfile.user.name,
    tenantName: lease.tenantName,
    tenantPhone: maskPhone(lease.tenantPhone),
    tenantLinked: lease.tenantProfileId !== null,
    deposit: lease.deposit,
    monthlyRent: lease.monthlyRent,
    maintenanceFee: lease.maintenanceFee,
    paymentDay: lease.paymentDay,
    startDate: formatDateKey(lease.startDate),
    endDate: formatDateKey(lease.endDate),
    chargeCount: lease.charges.length,
    overdueCount: lease.charges.filter((charge) => charge.status === ChargeStatus.OVERDUE).length,
    delinquentCount: delinquent.length,
    outstandingAmount,
    maxOverdueDays,
  };
}

const EMPTY_LEASE_COUNTS: Record<LeaseStatusValue, number> = {
  PENDING_TENANT: 0,
  ACTIVE: 0,
  ENDED: 0,
  CANCELLED: 0,
};

export async function listAdminLeases(input: {
  q?: string;
  status?: readonly LeaseStatusValue[];
  overdue: boolean;
  page: number;
  pageSize: number;
}): Promise<AdminLeaseListDto> {
  const asOf = kstToday();
  const search = leaseSearchWhere(input.q);
  // 연체 필터는 **저장된 상태**로 건다 — 크론이 같은 엔진으로 매일 맞춘 값이다
  const overdueWhere: Prisma.LeaseWhereInput = input.overdue
    ? { charges: { some: { status: ChargeStatus.OVERDUE } } }
    : {};
  /** 상태 탭의 건수는 "상태 필터를 뺀" 조건으로 센다 — 탭을 눌러도 옆 탭 숫자가 흔들리지 않게 */
  const baseWhere: Prisma.LeaseWhereInput = { AND: [search, overdueWhere] };
  const where: Prisma.LeaseWhereInput = input.status
    ? { AND: [baseWhere, { status: { in: input.status as LeaseStatus[] } }] }
    : baseWhere;

  const [total, leases, grouped, overdueTotal] = await Promise.all([
    prisma.lease.count({ where }),
    prisma.lease.findMany({
      where,
      include: LEASE_LIST_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...toSkipTake(input),
    }),
    prisma.lease.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
    prisma.lease.count({
      where: { AND: [search, { charges: { some: { status: ChargeStatus.OVERDUE } } }] },
    }),
  ]);

  const counts = { ...EMPTY_LEASE_COUNTS };
  for (const row of grouped) counts[row.status as LeaseStatusValue] = row._count._all;

  return {
    leases: leases.map((lease) => toLeaseRow(lease, asOf)),
    counts,
    overdueTotal,
    page: buildPageMeta(input, total),
    q: input.q ?? "",
  };
}

// ===================== /charges =====================

const CHARGE_LIST_INCLUDE = {
  lease: { include: { unit: { include: { building: true } } } },
  _count: { select: { payments: true } },
} satisfies Prisma.RentChargeInclude;

type ChargeListRow = Prisma.RentChargeGetPayload<{ include: typeof CHARGE_LIST_INCLUDE }>;

function toChargeRow(charge: ChargeListRow, asOf: Date): AdminChargeRowDto {
  const meta = CHARGE_STATUS_META[charge.status as ChargeStatusValue];
  return {
    id: charge.id,
    leaseId: charge.leaseId,
    year: charge.year,
    month: charge.month,
    dueDate: formatDateKey(charge.dueDate),
    rentAmount: charge.rentAmount,
    maintenanceAmount: charge.maintenanceAmount,
    carriedOverAmount: charge.carriedOverAmount,
    lateFeeAmount: charge.lateFeeAmount,
    totalDue: charge.totalDue,
    paidAmount: charge.paidAmount,
    status: charge.status as ChargeStatusValue,
    statusLabel: meta.label,
    statusTone: meta.tone,
    outstanding: calcOutstanding(charge.totalDue, charge.paidAmount),
    overdueDays: calcOverdueDays(charge.dueDate, asOf),
    delinquent: isDelinquent(charge, asOf),
    paymentCount: charge._count.payments,
    buildingName: charge.lease.unit.building.name,
    unitLabel: charge.lease.unit.label,
    tenantName: charge.lease.tenantName,
    tenantPhone: maskPhone(charge.lease.tenantPhone),
  };
}

const EMPTY_CHARGE_COUNTS: Record<ChargeStatusValue, number> = {
  SCHEDULED: 0,
  PARTIALLY_PAID: 0,
  PAID: 0,
  OVERDUE: 0,
};

export async function listAdminCharges(input: {
  status?: readonly ChargeStatusValue[];
  leaseId?: string;
  year?: number;
  month?: number;
  page: number;
  pageSize: number;
}): Promise<AdminChargeListDto> {
  const asOf = kstToday();
  const baseWhere: Prisma.RentChargeWhereInput = {
    ...(input.leaseId ? { leaseId: input.leaseId } : {}),
    ...(input.year ? { year: input.year } : {}),
    ...(input.month ? { month: input.month } : {}),
  };
  const where: Prisma.RentChargeWhereInput = input.status
    ? { ...baseWhere, status: { in: input.status as ChargeStatus[] } }
    : baseWhere;

  const [total, charges, grouped, lease] = await Promise.all([
    prisma.rentCharge.count({ where }),
    prisma.rentCharge.findMany({
      where,
      include: CHARGE_LIST_INCLUDE,
      // 납부기한 최신순. 같은 기한이 수두룩하므로 `id` 로 닫는다
      orderBy: [{ dueDate: "desc" }, { id: "desc" }],
      ...toSkipTake(input),
    }),
    prisma.rentCharge.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
    input.leaseId
      ? prisma.lease.findUnique({ where: { id: input.leaseId }, include: LEASE_LIST_INCLUDE })
      : Promise.resolve(null),
  ]);

  const counts = { ...EMPTY_CHARGE_COUNTS };
  for (const row of grouped) counts[row.status as ChargeStatusValue] = row._count._all;

  return {
    charges: charges.map((charge) => toChargeRow(charge, asOf)),
    counts,
    page: buildPageMeta(input, total),
    lease: lease ? toLeaseRow(lease, asOf) : null,
    asOf: formatDateKey(asOf),
  };
}

// ===================== /messages =====================

const MESSAGE_LIST_INCLUDE = {
  lease: { include: { unit: { include: { building: true } } } },
} satisfies Prisma.MessageLogInclude;

type MessageListRow = Prisma.MessageLogGetPayload<{ include: typeof MESSAGE_LIST_INCLUDE }>;

function toMessageRow(message: MessageListRow): AdminMessageRowDto {
  return {
    id: message.id,
    kind: message.kind,
    kindLabel: messageKindLabel(message.kind),
    toPhone: maskPhone(message.toPhone),
    title: message.title,
    // 인증번호는 본문에서 지운다 — 로그를 보는 것만으로 남의 계정에 들어갈 수 있다(mask.ts)
    body: message.kind === "OTP" ? maskOtpBody(message.body) : message.body,
    sentAt: iso(message.sentAt),
    openedAt: message.openedAt ? iso(message.openedAt) : null,
    opened: message.openedAt !== null,
    leaseId: message.leaseId,
    chargeId: message.chargeId,
    buildingName: message.lease?.unit.building.name ?? null,
    unitLabel: message.lease?.unit.label ?? null,
    tenantName: message.lease?.tenantName ?? null,
    noticePath: message.token ? `/notice/${message.token}` : null,
  };
}

export async function listAdminMessages(input: {
  kind?: readonly string[];
  q?: string;
  opened: "all" | "opened" | "unopened";
  page: number;
  pageSize: number;
}): Promise<AdminMessageListDto> {
  const term = parseSearchTerm(input.q);
  const openedWhere: Prisma.MessageLogWhereInput =
    input.opened === "opened"
      ? { openedAt: { not: null } }
      : input.opened === "unopened"
        ? { openedAt: null }
        : {};
  // 종류 탭의 건수는 종류 필터를 뺀 조건으로 센다
  const baseWhere: Prisma.MessageLogWhereInput = {
    ...openedWhere,
    // 발송 로그에는 이름이 없어 `q` 는 **수신 번호 전용**이다. 숫자가 하나도 없는 검색어는
    // 원문 그대로 번호 컬럼에서 찾는다 — 결과가 0건이 되는 것이 맞다(필터를 무시하고
    // 전부 보여 주면 "찾았다" 로 오해한다).
    ...(term ? { toPhone: { contains: term.digits || term.name } } : {}),
  };
  const where: Prisma.MessageLogWhereInput = input.kind
    ? { ...baseWhere, kind: { in: input.kind as MessageKind[] } }
    : baseWhere;

  const [total, messages, grouped, openedCount, unopenedCount] = await Promise.all([
    prisma.messageLog.count({ where }),
    prisma.messageLog.findMany({
      where,
      include: MESSAGE_LIST_INCLUDE,
      orderBy: [{ sentAt: "desc" }, { id: "desc" }],
      ...toSkipTake(input),
    }),
    prisma.messageLog.groupBy({ by: ["kind"], where: baseWhere, _count: { _all: true } }),
    prisma.messageLog.count({ where: { ...where, openedAt: { not: null } } }),
    prisma.messageLog.count({ where: { ...where, openedAt: null } }),
  ]);

  const byKind = new Map(grouped.map((row) => [row.kind as string, row._count._all]));
  const kindCounts = Object.keys(MESSAGE_KIND_LABELS).map((kind) => ({
    kind,
    label: messageKindLabel(kind),
    count: byKind.get(kind) ?? 0,
  }));

  return {
    messages: messages.map(toMessageRow),
    kindCounts,
    openedCount,
    unopenedCount,
    page: buildPageMeta(input, total),
    q: input.q ?? "",
  };
}

// ===================== /events =====================

function toEventRow(
  event: {
    id: string;
    name: string;
    anonId: string;
    userId: string | null;
    path: string | null;
    sessionId: string | null;
    props: unknown;
    createdAt: Date;
  },
  userNames: Map<string, string>,
): AdminEventRowDto {
  return {
    id: event.id,
    name: event.name,
    anonId: maskAnonId(event.anonId),
    userId: event.userId,
    userName: event.userId ? (userNames.get(event.userId) ?? null) : null,
    path: event.path,
    sessionId: event.sessionId ? maskAnonId(event.sessionId) : null,
    props: event.props === null || event.props === undefined ? null : JSON.stringify(event.props),
    createdAt: iso(event.createdAt),
  };
}

/**
 * 이벤트 로그 + 시간대별(KST) 카운트.
 *
 * 시간대 집계는 **SQL 이 아니라 JS 로** 한다. 시각 → KST 시(hour) 변환 규칙이 이미
 * `@/lib/rent` 에 있고(`KST_OFFSET_MS`), SQL 에 `interval '9 hours'` 를 또 적으면 타임존
 * 규칙이 두 벌이 된다. 대신 훑는 행 수에 상한(`EVENT_SAMPLE_LIMIT`)을 두고, 상한에 걸리면
 * 응답에 그렇게 밝힌다(데모 규모에서는 걸리지 않는다).
 */
export async function listAdminEvents(input: {
  name?: readonly string[];
  from: string;
  to: string;
  page: number;
  pageSize: number;
}): Promise<AdminEventListDto> {
  const range = kstDayRange(input.from, input.to);
  const rangeWhere: Prisma.TrackingEventWhereInput = {
    createdAt: { gte: range.gte, lt: range.lt },
  };
  const where: Prisma.TrackingEventWhereInput = input.name
    ? { ...rangeWhere, name: { in: [...input.name] } }
    : rangeWhere;

  const [total, events, grouped, sample] = await Promise.all([
    prisma.trackingEvent.count({ where }),
    prisma.trackingEvent.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...toSkipTake(input),
    }),
    // 이름 목록은 **이름 필터를 뺀** 기간 전체 기준 — 필터를 걸어도 선택지가 사라지지 않게
    prisma.trackingEvent.groupBy({
      by: ["name"],
      where: rangeWhere,
      _count: { _all: true },
      orderBy: { _count: { name: "desc" } },
    }),
    prisma.trackingEvent.findMany({
      where,
      select: { createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: EVENT_SAMPLE_LIMIT,
    }),
  ]);

  const userIds = [...new Set(events.map((event) => event.userId).filter((id): id is string => !!id))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const userNames = new Map(users.map((user) => [user.id, user.name]));

  const hourly: AdminHourBucketDto[] = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const row of sample) {
    const bucket = hourly[kstHourOf(row.createdAt)];
    if (bucket) bucket.count += 1;
  }

  return {
    events: events.map((event) => toEventRow(event, userNames)),
    names: grouped.map((row) => ({ name: row.name, count: row._count._all })),
    hourly,
    range: { from: range.from, to: range.to },
    sampled: sample.length,
    sampleTruncated: sample.length >= EVENT_SAMPLE_LIMIT,
    page: buildPageMeta(input, total),
  };
}

