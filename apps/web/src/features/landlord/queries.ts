/**
 * 건물·호실 조회 (T1.1) — **서버 전용**(`@zari/db` 를 쓴다).
 *
 * 라우트 핸들러와 서버 컴포넌트가 **같은 함수**를 쓴다. 그래야 페이지가 내려주는 초기 데이터와
 * `GET /api/…` 응답의 모양이 한 글자도 어긋나지 않고, Tanstack Query 의 `initialData` 로
 * 그대로 넣을 수 있다(첫 화면에서 같은 데이터를 두 번 받지 않는다).
 *
 * 날짜는 여기서 문자열로 바꾼다 — `Date` 를 클라이언트 컴포넌트로 넘기면 직렬화 경계에서
 * JSON 응답과 타입이 달라진다.
 */
import { ChargeStatus, LeaseStatus, prisma } from "@zari/db";
import { deriveUnitStatus, emptyStatusCounts } from "./unit-status";
import type {
  BuildingDetailDto,
  BuildingSummaryDto,
  ChargeSummaryDto,
  DealTypeValue,
  LeaseStatusValue,
  LeaseSummaryDto,
  ListingStatusValue,
  ListingSummaryDto,
  UnitDetailDto,
  UnitSummaryDto,
} from "./types";

/** 그리드·목록에서 상태를 판정할 때 필요한 계약만 가져온다(진행 중 계약 = ACTIVE·PENDING_TENANT). */
const CURRENT_LEASE_STATUSES: LeaseStatusValue[] = ["ACTIVE", "PENDING_TENANT"];

/**
 * 상태 판정용 include.
 * `charges` 는 **OVERDUE 행이 있는지**만 보려고 붙인다 — 금액 계산은 T1.4 원장 엔진 소유다.
 */
const currentLeasesInclude = {
  where: { status: { in: CURRENT_LEASE_STATUSES } },
  orderBy: [{ startDate: "desc" as const }],
  include: { charges: { where: { status: ChargeStatus.OVERDUE }, select: { id: true } } },
};

/** `@db.Date` 컬럼 → `YYYY-MM-DD` (UTC 자정으로 저장돼 있다 — 시드 주석 참고) */
const toDateString = (value: Date): string => value.toISOString().slice(0, 10);

type LeaseRow = {
  id: string;
  status: LeaseStatusValue;
  tenantName: string;
  tenantPhone: string;
  tenantProfileId: string | null;
  deposit: number;
  monthlyRent: number;
  maintenanceFee: number;
  paymentDay: number;
  startDate: Date;
  endDate: Date;
};

type UnitRow = {
  id: string;
  buildingId: string;
  label: string;
  floor: number | null;
  areaM2: number | null;
  rooms: number | null;
  note: string | null;
  createdAt: Date;
  /** 연체 판정에는 **OVERDUE 청구가 있는지**(개수)만 쓴다 — 컬럼 구성은 상관없다 */
  leases: (LeaseRow & { charges: readonly unknown[] })[];
};

type BuildingRow = {
  id: string;
  name: string;
  address: string;
  roadAddress: string | null;
  lat: number;
  lng: number;
  note: string | null;
  createdAt: Date;
  units: UnitRow[];
};

type ListingRow = {
  id: string;
  dealType: DealTypeValue;
  deposit: number;
  monthlyRent: number;
  status: ListingStatusValue;
  availableFrom: Date | null;
  createdAt: Date;
};

export function toLeaseSummary(lease: LeaseRow): LeaseSummaryDto {
  return {
    id: lease.id,
    status: lease.status,
    tenantName: lease.tenantName,
    tenantPhone: lease.tenantPhone,
    tenantProfileId: lease.tenantProfileId,
    deposit: lease.deposit,
    monthlyRent: lease.monthlyRent,
    maintenanceFee: lease.maintenanceFee,
    paymentDay: lease.paymentDay,
    startDate: toDateString(lease.startDate),
    endDate: toDateString(lease.endDate),
  };
}

/** 호실 1개 → 그리드 셀 DTO. 상태 판정은 `deriveUnitStatus` 한 곳에서만 한다. */
export function toUnitSummary(unit: UnitRow): UnitSummaryDto {
  const active = unit.leases.find((lease) => lease.status === "ACTIVE");
  const pending = unit.leases.find((lease) => lease.status === "PENDING_TENANT");
  const current = active ?? pending ?? null;

  const status = deriveUnitStatus({
    hasActiveLease: Boolean(active),
    hasPendingLease: Boolean(pending),
    // T1.4 머지 후 이 한 줄을 원장 엔진의 연체 판정으로 바꾼다
    hasOverdueCharge: (active?.charges.length ?? 0) > 0,
  });

  return {
    id: unit.id,
    buildingId: unit.buildingId,
    label: unit.label,
    floor: unit.floor,
    areaM2: unit.areaM2,
    rooms: unit.rooms,
    note: unit.note,
    createdAt: unit.createdAt.toISOString(),
    status,
    currentLease: current ? toLeaseSummary(current) : null,
  };
}

/** 호실 라벨 정렬 — "101호 < 201호 < 202호" 처럼 숫자 앞부분 기준, 없으면 사전순 */
function compareUnitLabel(a: UnitSummaryDto, b: UnitSummaryDto): number {
  const na = Number.parseInt(a.label, 10);
  const nb = Number.parseInt(b.label, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.label.localeCompare(b.label, "ko");
}

export function toBuildingSummary(building: BuildingRow): BuildingSummaryDto {
  const statusCounts = emptyStatusCounts();
  for (const unit of building.units) {
    statusCounts[toUnitSummary(unit).status] += 1;
  }

  return {
    id: building.id,
    name: building.name,
    address: building.address,
    roadAddress: building.roadAddress,
    lat: building.lat,
    lng: building.lng,
    note: building.note,
    createdAt: building.createdAt.toISOString(),
    unitCount: building.units.length,
    statusCounts,
  };
}

/** 내 건물 목록 — 호실 수·상태별 수 요약 포함(오래된 것부터) */
export async function listBuildings(ownerProfileId: string): Promise<BuildingSummaryDto[]> {
  const rows = await prisma.building.findMany({
    where: { ownerProfileId },
    orderBy: { createdAt: "asc" },
    include: { units: { include: { leases: currentLeasesInclude } } },
  });
  return rows.map(toBuildingSummary);
}

/** 건물 1채(요약) — 생성·수정 응답에서 쓴다 */
export async function getBuildingSummary(buildingId: string): Promise<BuildingSummaryDto | null> {
  const row = await prisma.building.findUnique({
    where: { id: buildingId },
    include: { units: { include: { leases: currentLeasesInclude } } },
  });
  return row ? toBuildingSummary(row) : null;
}

/**
 * 건물 상세 = 요약 + 호실 그리드.
 * `ownerProfileId` 를 주면 소유자 조건까지 걸어 한 번에 조회한다(서버 컴포넌트용).
 */
export async function getBuildingDetail(
  buildingId: string,
  ownerProfileId?: string,
): Promise<BuildingDetailDto | null> {
  const row = await prisma.building.findFirst({
    where: { id: buildingId, ...(ownerProfileId ? { ownerProfileId } : {}) },
    include: { units: { include: { leases: currentLeasesInclude } } },
  });
  if (!row) return null;

  return {
    ...toBuildingSummary(row),
    units: row.units.map(toUnitSummary).sort(compareUnitLabel),
  };
}

function toListingSummary(listing: ListingRow): ListingSummaryDto {
  return {
    id: listing.id,
    dealType: listing.dealType,
    deposit: listing.deposit,
    monthlyRent: listing.monthlyRent,
    status: listing.status,
    availableFrom: listing.availableFrom ? toDateString(listing.availableFrom) : null,
    createdAt: listing.createdAt.toISOString(),
  };
}

/**
 * 수납 요약 — **저장된 컬럼의 단순 집계**다(건수 + `totalDue − paidAmount` 합).
 * 연체료·이월 계산은 T1.4 월세 원장 엔진 소유라 여기서 만들지 않는다.
 * T1.4 머지 후 이 함수를 원장 엔진의 요약 함수 호출로 교체한다.
 */
function toChargeSummary(
  charges: { year: number; month: number; status: string; totalDue: number; paidAmount: number }[],
): ChargeSummaryDto {
  let unpaidCount = 0;
  let overdueCount = 0;
  let unpaidAmount = 0;
  let latest: { year: number; month: number } | null = null;

  for (const charge of charges) {
    if (charge.status !== ChargeStatus.PAID) {
      unpaidCount += 1;
      unpaidAmount += Math.max(charge.totalDue - charge.paidAmount, 0);
    }
    if (charge.status === ChargeStatus.OVERDUE) overdueCount += 1;
    if (
      !latest ||
      charge.year > latest.year ||
      (charge.year === latest.year && charge.month > latest.month)
    ) {
      latest = { year: charge.year, month: charge.month };
    }
  }

  return {
    totalCount: charges.length,
    unpaidCount,
    overdueCount,
    unpaidAmount,
    latestMonth: latest ? `${latest.year}-${String(latest.month).padStart(2, "0")}` : null,
  };
}

/**
 * 호실 상세 — 현재 계약 + 과거 이력 + 최신 매물 + 수납 요약.
 * `ownerProfileId` 를 주면 소유자 조건까지 걸어 한 번에 조회한다(서버 컴포넌트용).
 */
export async function getUnitDetail(
  unitId: string,
  ownerProfileId?: string,
): Promise<UnitDetailDto | null> {
  const unit = await prisma.unit.findFirst({
    where: {
      id: unitId,
      ...(ownerProfileId ? { building: { ownerProfileId } } : {}),
    },
    include: {
      building: true,
      leases: {
        orderBy: [{ startDate: "desc" }],
        include: {
          charges: {
            select: { year: true, month: true, status: true, totalDue: true, paidAmount: true },
          },
        },
      },
      listings: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!unit) return null;

  const current =
    unit.leases.find((lease) => lease.status === LeaseStatus.ACTIVE) ??
    unit.leases.find((lease) => lease.status === LeaseStatus.PENDING_TENANT) ??
    null;

  // 그리드 셀과 같은 판정을 쓰려고 요약 매퍼를 그대로 태운다(진행 중 계약만 남긴다)
  const summary = toUnitSummary({
    ...unit,
    leases: unit.leases
      .filter((lease) => CURRENT_LEASE_STATUSES.includes(lease.status))
      .map((lease) => ({
        ...lease,
        charges: lease.charges.filter((charge) => charge.status === ChargeStatus.OVERDUE),
      })),
  });

  return {
    ...summary,
    building: { id: unit.building.id, name: unit.building.name, address: unit.building.address },
    pastLeases: unit.leases
      .filter((lease) => lease.id !== current?.id)
      .map((lease) => toLeaseSummary(lease)),
    listing: unit.listings[0] ? toListingSummary(unit.listings[0]) : null,
    chargeSummary: current ? toChargeSummary(current.charges) : null,
  };
}

/**
 * 삭제를 막는 참조 수 (T1.1 삭제 규칙).
 *
 * 계약(Lease)·매물(Listing)·중개 요청(BrokerageRequest)은 스키마에서 호실을 필수로 참조하고
 * cascade 도 걸려 있지 않다 — 지우면 FK 위반이 나고, 무엇보다 **계약 이력을 남겨야** 한다.
 * 그래서 참조가 하나라도 있으면 409 로 막는다(호실·건물 모두 같은 규칙).
 */
export type BlockingRefs = { leases: number; listings: number; brokerageRequests: number };

export async function countUnitBlockers(unitIds: string[]): Promise<BlockingRefs> {
  if (unitIds.length === 0) return { leases: 0, listings: 0, brokerageRequests: 0 };
  const where = { unitId: { in: unitIds } };
  const [leases, listings, brokerageRequests] = await Promise.all([
    prisma.lease.count({ where }),
    prisma.listing.count({ where }),
    prisma.brokerageRequest.count({ where }),
  ]);
  return { leases, listings, brokerageRequests };
}

/** 막는 참조가 있으면 사용자에게 보여 줄 사유 문구, 없으면 null */
export function blockingReason(refs: BlockingRefs, target: "건물" | "호실"): string | null {
  if (refs.leases > 0) {
    return `계약 이력이 있는 ${target}은 삭제할 수 없습니다. 계약을 먼저 정리해 주세요.`;
  }
  if (refs.listings > 0) {
    return `등록된 매물이 있는 ${target}은 삭제할 수 없습니다. 매물을 먼저 내려 주세요.`;
  }
  if (refs.brokerageRequests > 0) {
    return `진행 중인 중개 요청이 있는 ${target}은 삭제할 수 없습니다.`;
  }
  return null;
}
