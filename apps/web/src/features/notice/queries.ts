/**
 * 고지서 조회 (T1.7 · T1.8) — **서버 전용**(`@zari/db` 를 쓴다).
 *
 * T1.1 의 `features/landlord/queries.ts` 와 같은 원칙이다: 라우트 핸들러와 서버 컴포넌트가
 * **같은 함수**를 써서 화면 초기 데이터와 API 응답 모양이 어긋나지 않게 한다.
 *
 * 금액·상태·연체일수는 전부 원장 엔진(`@/lib/rent`)이 계산한다 — 여기서는 DTO 로 옮기기만 한다.
 */
import { LeaseStatus, prisma } from "@zari/db";
import { describeCharge, kstToday, type DescribableCharge } from "@/lib/rent";
import { formatPhone } from "@/lib/phone";
import { demoBankAccount } from "./constants";
import type {
  MessageLogDto,
  NoticeChargeDto,
  NoticeTargetDto,
  PublicNoticeDto,
} from "./types";

/** `@db.Date` 컬럼 → `YYYY-MM-DD` (UTC 자정으로 저장돼 있다 — 시드 주석 참고) */
const toDateString = (value: Date): string => value.toISOString().slice(0, 10);

/** 고지서를 보낼 수 있는 계약 = 진행 중인 계약 */
const SENDABLE_LEASE_STATUSES = [LeaseStatus.ACTIVE, LeaseStatus.PENDING_TENANT];

/** 계약 + 호실·건물·소유자 + 청구 (발송 대상 조립용) */
const targetInclude = {
  unit: {
    include: {
      building: { include: { ownerProfile: { include: { user: true } } } },
    },
  },
  charges: { orderBy: [{ year: "desc" as const }, { month: "desc" as const }] },
};

type ChargeRow = DescribableCharge & {
  id: string;
  year: number;
  month: number;
  paidAmount: number;
  totalDue: number;
};

/** 청구 1건 → DTO. 상태·잔액·연체일수는 저장값이 아니라 **오늘 기준 재판정**이다. */
export function toNoticeChargeDto(charge: ChargeRow, asOf: Date): NoticeChargeDto {
  const view = describeCharge(charge, asOf);
  return {
    id: charge.id,
    year: charge.year,
    month: charge.month,
    dueDate: toDateString(charge.dueDate),
    rentAmount: charge.rentAmount,
    maintenanceAmount: charge.maintenanceAmount,
    carriedOverAmount: charge.carriedOverAmount,
    lateFeeAmount: charge.lateFeeAmount,
    totalDue: view.totalDue,
    paidAmount: view.paidAmount,
    status: view.status,
    outstanding: view.outstanding,
    overdueDays: view.overdueDays,
  };
}

type TargetRow = Awaited<ReturnType<typeof loadTargetRow>>;

function loadTargetRow(leaseId: string) {
  return prisma.lease.findUnique({ where: { id: leaseId }, include: targetInclude });
}

function toNoticeTarget(lease: NonNullable<TargetRow>, asOf: Date): NoticeTargetDto {
  return {
    leaseId: lease.id,
    leaseStatus: lease.status,
    tenantName: lease.tenantName,
    tenantPhone: lease.tenantPhone,
    tenantProfileId: lease.tenantProfileId,
    landlordName: lease.unit.building.ownerProfile.user.name,
    buildingName: lease.unit.building.name,
    buildingAddress: lease.unit.building.address,
    unitLabel: lease.unit.label,
    deposit: lease.deposit,
    monthlyRent: lease.monthlyRent,
    maintenanceFee: lease.maintenanceFee,
    paymentDay: lease.paymentDay,
    startDate: toDateString(lease.startDate),
    endDate: toDateString(lease.endDate),
    charges: lease.charges.map((charge) => toNoticeChargeDto(charge, asOf)),
  };
}

/** 발송 시트가 쓰는 계약 1건. 소유권 확인은 호출부(`requireOwnedLease`)가 이미 했다고 본다. */
export async function getNoticeTarget(
  leaseId: string,
  asOf: Date = kstToday(),
): Promise<NoticeTargetDto | null> {
  const lease = await loadTargetRow(leaseId);
  return lease ? toNoticeTarget(lease, asOf) : null;
}

/** 내 건물의 진행 중 계약 전부 — `/landlord/messages` 의 "고지서 보내기" 목록. */
export async function listNoticeTargets(
  ownerProfileId: string,
  asOf: Date = kstToday(),
): Promise<NoticeTargetDto[]> {
  const leases = await prisma.lease.findMany({
    where: {
      status: { in: SENDABLE_LEASE_STATUSES },
      unit: { building: { ownerProfileId } },
    },
    include: targetInclude,
    orderBy: [{ createdAt: "asc" }],
  });
  return leases.map((lease) => toNoticeTarget(lease, asOf));
}

type MessageRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  token: string | null;
  toPhone: string;
  sentAt: Date;
  openedAt: Date | null;
  leaseId: string | null;
  chargeId: string | null;
  lease: { tenantName: string; unit: { label: string; building: { name: string } } } | null;
};

export function toMessageLogDto(row: MessageRow): MessageLogDto {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    token: row.token,
    toPhone: row.toPhone,
    sentAt: row.sentAt.toISOString(),
    openedAt: row.openedAt ? row.openedAt.toISOString() : null,
    leaseId: row.leaseId,
    chargeId: row.chargeId,
    tenantName: row.lease?.tenantName ?? null,
    buildingName: row.lease?.unit.building.name ?? null,
    unitLabel: row.lease?.unit.label ?? null,
    noticePath: row.token ? `/notice/${row.token}` : null,
  };
}

/**
 * 내 발송 이력 — **내 건물의 계약에 붙은 발송만** 보인다.
 * 계약이 없는 발송(OTP 등)은 `leaseId` 가 없어 자연히 빠진다.
 */
export async function listLandlordMessages(
  ownerProfileId: string,
  options: { leaseId?: string; limit?: number } = {},
): Promise<MessageLogDto[]> {
  const rows = await prisma.messageLog.findMany({
    where: {
      ...(options.leaseId ? { leaseId: options.leaseId } : {}),
      lease: { unit: { building: { ownerProfileId } } },
    },
    include: { lease: { include: { unit: { include: { building: true } } } } },
    orderBy: [{ sentAt: "desc" }],
    take: options.limit ?? 100,
  });
  return rows.map(toMessageLogDto);
}

/** 010-5555-5555 → 010-****-5555. 링크만 알면 열리는 페이지라 번호를 통으로 보여 주지 않는다. */
export function maskPhone(phone: string): string {
  const formatted = formatPhone(phone);
  const [head, middle, tail] = formatted.split("-");
  if (!head || !middle || !tail) return formatted;
  return `${head}-${"*".repeat(middle.length)}-${tail}`;
}

/**
 * 공개 고지서 데이터. **토큰만으로 연다 — 세션을 보지 않는다.**
 * 없는 토큰이면 null(호출부에서 404·notFound).
 */
export async function loadPublicNotice(
  token: string,
  asOf: Date = kstToday(),
): Promise<PublicNoticeDto | null> {
  const message = await prisma.messageLog.findUnique({
    where: { token },
    include: {
      charge: true,
      lease: {
        include: {
          unit: {
            include: { building: { include: { ownerProfile: { include: { user: true } } } } },
          },
        },
      },
    },
  });
  if (!message?.lease) return null;

  const { lease } = message;
  const landlordName = lease.unit.building.ownerProfile.user.name;
  const charge = message.charge;
  const view = charge ? describeCharge(charge, asOf) : null;
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysFrom = (target: Date) =>
    Math.round((target.getTime() - asOf.getTime()) / msPerDay);

  return {
    token,
    kind: message.kind,
    title: message.title,
    message: message.body,
    sentAt: message.sentAt.toISOString(),
    openedAt: message.openedAt ? message.openedAt.toISOString() : null,
    landlordName,
    tenantName: lease.tenantName,
    tenantPhoneMasked: maskPhone(message.toPhone),
    buildingName: lease.unit.building.name,
    buildingAddress: lease.unit.building.address,
    unitLabel: lease.unit.label,
    lease: {
      deposit: lease.deposit,
      monthlyRent: lease.monthlyRent,
      maintenanceFee: lease.maintenanceFee,
      paymentDay: lease.paymentDay,
      startDate: toDateString(lease.startDate),
      endDate: toDateString(lease.endDate),
      daysUntilExpiry: daysFrom(lease.endDate),
    },
    charge:
      charge && view
        ? {
            ...toNoticeChargeDto(charge, asOf),
            lines: view.lines,
            daysUntilDue: daysFrom(charge.dueDate),
          }
        : null,
    bankAccount: demoBankAccount(landlordName),
  };
}

/**
 * **최초 1회만** 열람 시각을 남긴다.
 *
 * `updateMany({ where: { openedAt: null } })` 로 조건부 갱신하므로 동시에 두 번 열려도
 * 한 번만 찍힌다. 재조회로 갱신되면 임대인 이력의 "열람" 이 언제 처음 봤는지를 잃는다.
 * 갱신됐으면(=이번이 최초 열람) true.
 */
export async function markNoticeOpened(token: string, openedAt: Date = new Date()): Promise<boolean> {
  const result = await prisma.messageLog.updateMany({
    where: { token, openedAt: null },
    data: { openedAt },
  });
  return result.count > 0;
}
