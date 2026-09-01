/**
 * 계약·청구 조회와 상태 재계산 (T1.2·T1.5) — **서버 전용**(`@zari/db` 를 쓴다).
 *
 * 라우트 핸들러와 서버 컴포넌트가 **같은 함수**를 쓴다(T1.1 이 세운 규칙).
 * 그래야 페이지가 내려주는 초기 데이터와 `GET /api/…` 응답 모양이 어긋나지 않고,
 * Tanstack Query 의 `initialData` 로 그대로 넣을 수 있다.
 *
 * ## 금액은 한 줄도 직접 계산하지 않는다
 * 총액·상태·내역 분해·미납 잔액은 전부 `@/lib/rent`(T1.4 원장 엔진)가 한다:
 * `describeCharge`(표시 분해) · `resolveChargeStatus`(상태) · `sumPayments`(납부 합계) ·
 * `calcOutstanding`(잔액) · `kstToday`(판정 기준일).
 */
import { prisma } from "@zari/db";
import { deriveUnitStatus } from "@/features/landlord/unit-status";
import {
  calcOutstanding,
  describeCharge,
  kstToday,
  resolveChargeStatus,
  sumPayments,
} from "@/lib/rent";
import { formatDateOnly } from "./rules";
import type {
  ChargeDto,
  ChargeStatusValue,
  LeaseChargeSummaryDto,
  LeaseDetailDto,
  LeaseStatusValue,
  LeaseTermsDto,
  LeaseUnitDto,
  PaymentDto,
  PaymentMethodValue,
  UnitOptionDto,
} from "./types";

/** 청구 + 납부 기록 — 시트의 타임라인까지 한 번에 읽는다 */
const chargeInclude = {
  payments: { orderBy: [{ paidAt: "asc" as const }, { id: "asc" as const }] },
};

/** 계약 상세에 필요한 관계 전부 */
const leaseInclude = {
  unit: { include: { building: true } },
  charges: { include: chargeInclude, orderBy: [{ year: "desc" as const }, { month: "desc" as const }] },
};

type PaymentRow = {
  id: string;
  chargeId: string;
  amount: number;
  method: PaymentMethodValue;
  paidAt: Date;
  memo: string | null;
};

type ChargeRow = {
  id: string;
  leaseId: string;
  year: number;
  month: number;
  dueDate: Date;
  rentAmount: number;
  maintenanceAmount: number;
  carriedOverAmount: number;
  lateFeeAmount: number;
  totalDue: number;
  paidAmount: number;
  status: ChargeStatusValue;
  payments: PaymentRow[];
};

type LeaseRow = {
  id: string;
  unitId: string;
  status: LeaseStatusValue;
  tenantName: string;
  tenantPhone: string;
  tenantProfileId: string | null;
  tenantAcceptedAt: Date | null;
  deposit: number;
  monthlyRent: number;
  maintenanceFee: number;
  paymentDay: number;
  startDate: Date;
  endDate: Date;
  lateFeeRatePct: number | null;
  createdAt: Date;
  unit: {
    id: string;
    label: string;
    buildingId: string;
    building: { id: string; name: string; address: string };
  };
  charges: ChargeRow[];
};

function toPaymentDto(payment: PaymentRow): PaymentDto {
  return {
    id: payment.id,
    chargeId: payment.chargeId,
    amount: payment.amount,
    method: payment.method,
    paidAt: payment.paidAt.toISOString(),
    memo: payment.memo,
  };
}

/**
 * 청구 1건 → 화면용 DTO.
 * `status`·`outstanding`·`overdueDays`·`lines` 는 **`describeCharge` 가 `asOf` 기준으로 다시 판정**한 값이다.
 * 저장된 `status` 는 크론이 하루 1회 맞추므로, 그 사이에 기한이 지난 청구도 화면에서는 곧바로 연체로 보인다.
 */
export function toChargeDto(charge: ChargeRow, asOf: Date = kstToday()): ChargeDto {
  const view = describeCharge(charge, asOf);
  return {
    id: charge.id,
    leaseId: charge.leaseId,
    year: charge.year,
    month: charge.month,
    dueDate: formatDateOnly(charge.dueDate),
    rentAmount: charge.rentAmount,
    maintenanceAmount: charge.maintenanceAmount,
    carriedOverAmount: charge.carriedOverAmount,
    lateFeeAmount: charge.lateFeeAmount,
    totalDue: view.totalDue,
    paidAmount: view.paidAmount,
    outstanding: view.outstanding,
    excess: view.excess,
    overdueDays: view.overdueDays,
    status: view.status,
    lines: view.lines.map((line) => ({
      key: line.key,
      label: line.label,
      amount: line.amount,
      paid: line.paid,
    })),
    payments: charge.payments.map(toPaymentDto),
  };
}

/** 계약 단위 수납 요약 — 미납 합계는 원장 엔진 `calcOutstanding` 의 합이다 */
export function toLeaseChargeSummary(
  charges: readonly ChargeRow[],
  asOf: Date = kstToday(),
): LeaseChargeSummaryDto {
  let unpaidCount = 0;
  let overdueCount = 0;
  let unpaidAmount = 0;
  let latest: { year: number; month: number } | null = null;

  for (const charge of charges) {
    const status = resolveChargeStatus({
      totalDue: charge.totalDue,
      paidAmount: charge.paidAmount,
      dueDate: charge.dueDate,
      asOf,
    });
    if (status !== "PAID") {
      unpaidCount += 1;
      unpaidAmount += calcOutstanding(charge.totalDue, charge.paidAmount);
    }
    if (status === "OVERDUE") overdueCount += 1;
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

function toLeaseUnit(unit: LeaseRow["unit"]): LeaseUnitDto {
  return {
    id: unit.id,
    label: unit.label,
    buildingId: unit.buildingId,
    buildingName: unit.building.name,
    buildingAddress: unit.building.address,
  };
}

export function toLeaseTerms(lease: LeaseRow): LeaseTermsDto {
  return {
    id: lease.id,
    unitId: lease.unitId,
    status: lease.status,
    tenantName: lease.tenantName,
    tenantPhone: lease.tenantPhone,
    tenantProfileId: lease.tenantProfileId,
    tenantAcceptedAt: lease.tenantAcceptedAt?.toISOString() ?? null,
    deposit: lease.deposit,
    monthlyRent: lease.monthlyRent,
    maintenanceFee: lease.maintenanceFee,
    paymentDay: lease.paymentDay,
    startDate: formatDateOnly(lease.startDate),
    endDate: formatDateOnly(lease.endDate),
    lateFeeRatePct: lease.lateFeeRatePct,
    createdAt: lease.createdAt.toISOString(),
  };
}

export function toLeaseDetail(lease: LeaseRow, asOf: Date = kstToday()): LeaseDetailDto {
  return {
    ...toLeaseTerms(lease),
    unit: toLeaseUnit(lease.unit),
    chargeSummary: toLeaseChargeSummary(lease.charges, asOf),
  };
}

/**
 * 계약 상세 1건. `ownerProfileId` 를 주면 소유자 조건까지 걸어 한 번에 조회한다(서버 컴포넌트용).
 * 라우트 핸들러는 `requireOwnedLease` 로 403/404 를 구분하므로 id 만 넘긴다.
 */
export async function getLeaseDetail(
  leaseId: string,
  ownerProfileId?: string,
): Promise<LeaseDetailDto | null> {
  const lease = await prisma.lease.findFirst({
    where: {
      id: leaseId,
      ...(ownerProfileId ? { unit: { building: { ownerProfileId } } } : {}),
    },
    include: leaseInclude,
  });
  return lease ? toLeaseDetail(lease) : null;
}

/** 내 계약 목록 — 최근 등록순. 호실·상태로 좁힐 수 있다 */
export async function listLeases(
  ownerProfileId: string,
  filter: { unitId?: string; status?: LeaseStatusValue } = {},
): Promise<LeaseDetailDto[]> {
  const leases = await prisma.lease.findMany({
    where: {
      unit: { building: { ownerProfileId } },
      ...(filter.unitId ? { unitId: filter.unitId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    include: leaseInclude,
  });
  const asOf = kstToday();
  return leases.map((lease) => toLeaseDetail(lease, asOf));
}

/** 계약의 청구 목록(납부 기록 포함) — 최신 월부터 */
export async function listCharges(leaseId: string): Promise<ChargeDto[]> {
  const charges = await prisma.rentCharge.findMany({
    where: { leaseId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: chargeInclude,
  });
  const asOf = kstToday();
  return charges.map((charge) => toChargeDto(charge, asOf));
}

/** 청구 1건(납부 기록 포함) */
export async function getCharge(chargeId: string): Promise<ChargeDto | null> {
  const charge = await prisma.rentCharge.findUnique({
    where: { id: chargeId },
    include: chargeInclude,
  });
  return charge ? toChargeDto(charge) : null;
}

/**
 * **납부 추가·삭제 후 상태 재계산** (T1.4 가 후속 task 에 요구한 흐름).
 *
 * `paidAmount` 의 원본은 `RentPayment` 합계다 — 크론은 상태만 고쳐 주고 `paidAmount` 는 손대지 않으므로
 * 납부가 바뀔 때마다 여기서 `sumPayments` → `resolveChargeStatus` 로 **둘을 같이** 갱신한다.
 * 갱신된 청구 DTO 를 그대로 돌려주므로 호출부가 다시 읽을 필요가 없다.
 */
export async function recalcCharge(chargeId: string): Promise<ChargeDto | null> {
  const charge = await prisma.rentCharge.findUnique({
    where: { id: chargeId },
    include: chargeInclude,
  });
  if (!charge) return null;

  const asOf = kstToday();
  const paidAmount = sumPayments(charge.payments);
  const status = resolveChargeStatus({
    totalDue: charge.totalDue,
    paidAmount,
    dueDate: charge.dueDate,
    asOf,
  });

  if (charge.paidAmount === paidAmount && charge.status === status) {
    return toChargeDto(charge, asOf);
  }

  await prisma.rentCharge.update({ where: { id: chargeId }, data: { paidAmount, status } });
  return toChargeDto({ ...charge, paidAmount, status }, asOf);
}

/**
 * 계약 등록 폼의 호실 선택 목록 — 내 건물의 모든 호실.
 * 상태는 그리드와 **같은 판정**(`deriveUnitStatus`)을 쓴다. 계약중·대기 호실도 고를 수는 있고
 * 기간이 겹치면 그때 409 로 막는다(기간이 안 겹치는 후속 계약을 미리 등록할 수 있어야 한다).
 */
export async function listUnitOptions(ownerProfileId: string): Promise<UnitOptionDto[]> {
  const buildings = await prisma.building.findMany({
    where: { ownerProfileId },
    orderBy: { createdAt: "asc" },
    include: {
      units: {
        orderBy: { label: "asc" },
        include: {
          leases: {
            where: { status: { in: ["ACTIVE", "PENDING_TENANT"] } },
            select: { status: true, charges: { where: { status: "OVERDUE" }, select: { id: true } } },
          },
        },
      },
    },
  });

  return buildings.flatMap((building) =>
    building.units.map((unit) => {
      const active = unit.leases.find((lease) => lease.status === "ACTIVE");
      return {
        unitId: unit.id,
        label: unit.label,
        buildingId: building.id,
        buildingName: building.name,
        status: deriveUnitStatus({
          hasActiveLease: Boolean(active),
          hasPendingLease: unit.leases.some((lease) => lease.status === "PENDING_TENANT"),
          hasOverdueCharge: (active?.charges.length ?? 0) > 0,
        }),
      };
    }),
  );
}
