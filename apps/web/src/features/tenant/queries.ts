/**
 * 세입자 조회·DTO 매핑 (T1.3) — **서버 전용**(`@zari/db` 를 쓴다).
 *
 * 라우트 핸들러와 서버 컴포넌트가 **같은 함수**를 쓴다(T1.1 이 세운 규칙) —
 * 그래야 페이지가 내려주는 초기 데이터와 `GET /api/…` 응답 모양이 어긋나지 않는다.
 *
 * ## 금액·상태는 한 줄도 직접 계산하지 않는다
 * 계약·청구 DTO 매핑은 **T1.2 의 `toLeaseDetail`·`toChargeDto` 를 그대로 재사용**하고,
 * 그 안에서 원장 엔진(T1.4)의 `describeCharge`·`resolveChargeStatus`·`calcOutstanding` 이
 * `kstToday()` 기준으로 판정한다. 세입자 화면은 임대인이 보던 것과 **같은 숫자**를 보여 준다.
 */
import { LeaseStatus, prisma } from "@zari/db";
import { toChargeDto, toLeaseDetail } from "@/features/lease/queries";
import { formatDateOnly } from "@/features/lease/rules";
import { normalizePhone } from "@/lib/phone";
import { kstToday, kstYearMonth } from "@/lib/rent";
import type { PendingLeaseDto, TenantHomeDto, TenantLeaseCardDto, TenantLeaseDto } from "./types";

/** 세입자 홈 카드에 싣는 최근 청구 개수 — 그 아래는 접는다(모바일 셸 480px) */
export const TENANT_HOME_CHARGE_LIMIT = 6;

/**
 * 계약 상세에 필요한 관계 전부 + 임대인 이름.
 * `toLeaseDetail` 이 요구하는 모양(호실·건물·청구·납부)을 그대로 만족하고,
 * `ownerProfile.user` 만 더 얹는다(구조적 타입이라 필드가 더 있어도 그대로 통과한다).
 */
const tenantLeaseInclude = {
  unit: {
    include: {
      building: { include: { ownerProfile: { include: { user: true } } } },
    },
  },
  charges: {
    include: { payments: { orderBy: [{ paidAt: "asc" as const }, { id: "asc" as const }] } },
    orderBy: [{ year: "desc" as const }, { month: "desc" as const }],
  },
};

/**
 * `toLeaseDetail`(T1.2)이 요구하는 계약 행 **그대로** + 임대인 이름 경로만 더한 것.
 * 필드를 여기서 다시 나열하지 않는다 — T1.2 가 DTO 모양을 바꾸면 이 타입도 같이 따라간다.
 */
type TenantLeaseRow = Parameters<typeof toLeaseDetail>[0] & {
  unit: { building: { ownerProfile: { user: { name: string } } } };
};

/** 계약 행 → 세입자용 DTO(계약 상세 + 임대인 이름) */
export function toTenantLease(lease: TenantLeaseRow, asOf: Date = kstToday()): TenantLeaseDto {
  return {
    ...toLeaseDetail(lease, asOf),
    landlordName: lease.unit.building.ownerProfile.user.name,
  };
}

/**
 * 내 번호로 등록된 **수락 대기** 계약. 오래된 순(먼저 등록된 계약을 먼저 처리하게).
 *
 * 매칭 키는 `Lease.tenantPhone` 이고 비교값은 `normalizePhone` 을 태운 숫자다 —
 * 스키마에 `@@index([tenantPhone])` 가 있어 그대로 인덱스를 탄다.
 */
export async function listPendingLeases(phone: string): Promise<PendingLeaseDto[]> {
  const leases = await prisma.lease.findMany({
    where: {
      tenantPhone: normalizePhone(phone),
      status: LeaseStatus.PENDING_TENANT,
      tenantProfileId: null,
    },
    orderBy: { createdAt: "asc" },
    include: tenantLeaseInclude,
  });
  const asOf = kstToday();
  return leases.map((lease) => toTenantLease(lease, asOf));
}

/** 계약 1건을 세입자 DTO 로 (수락·거절 응답용) */
export async function getTenantLease(leaseId: string): Promise<TenantLeaseDto | null> {
  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: tenantLeaseInclude,
  });
  return lease ? toTenantLease(lease) : null;
}

/**
 * 세입자 홈 데이터.
 *
 * 내가 **수락한** 계약(`tenantProfileId` = 내 프로필)만 카드로 보여 준다. 아직 수락하지 않은
 * 계약은 카드가 아니라 상단 배너(`pendingCount`)로 알리고 수락 화면으로 보낸다 —
 * 계약 조건을 확인하고 수락하기 전에는 "내 계약" 이 아니기 때문이다.
 */
export async function getTenantHome(
  tenantProfileId: string,
  phone: string,
  options: { now?: Date } = {},
): Promise<TenantHomeDto> {
  const asOf = kstToday(options.now);
  const current = kstYearMonth(options.now);

  const [leases, pendingCount] = await Promise.all([
    prisma.lease.findMany({
      where: { tenantProfileId, status: { in: [LeaseStatus.ACTIVE, LeaseStatus.ENDED] } },
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      include: tenantLeaseInclude,
    }),
    prisma.lease.count({
      where: {
        tenantPhone: normalizePhone(phone),
        status: LeaseStatus.PENDING_TENANT,
        tenantProfileId: null,
      },
    }),
  ]);

  const cards: TenantLeaseCardDto[] = leases.map((row) => {
    const charges = row.charges.map((charge) => toChargeDto(charge, asOf));
    return {
      lease: toTenantLease(row, asOf),
      currentCharge:
        charges.find((charge) => charge.year === current.year && charge.month === current.month) ??
        null,
      charges: charges.slice(0, TENANT_HOME_CHARGE_LIMIT),
    };
  });

  return {
    asOf: formatDateOnly(asOf),
    month: { ...current, label: `${current.year}년 ${current.month}월` },
    pendingCount,
    leases: cards,
    outstanding: {
      count: cards.reduce((sum, card) => sum + card.lease.chargeSummary.unpaidCount, 0),
      amount: cards.reduce((sum, card) => sum + card.lease.chargeSummary.unpaidAmount, 0),
    },
  };
}
