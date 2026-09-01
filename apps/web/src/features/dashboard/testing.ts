/**
 * 대시보드 테스트 픽스처 (T1.9) — **테스트에서만 import 한다**(앱 코드에서 쓰지 않는다).
 *
 * 계정·건물 픽스처는 T1.1 의 `features/landlord/testing.ts` 를 그대로 재사용하고,
 * 여기에는 **날짜를 마음대로 정할 수 있는** 계약·청구와 시드 시나리오 재현만 둔다
 * (T1.1 픽스처의 청구는 `dueDate` 가 8/5 로 고정이라 "이번 달"·"만기 90일" 검증에 못 쓴다).
 */
import {
  ChargeStatus,
  LeaseStatus,
  MasterCategory,
  prisma,
  ProfileType,
  type Lease,
} from "@zari/db";
import { utcDate } from "@/lib/rent";
import { createBuildingWithUnits } from "@/features/landlord/testing";

export type LeaseInput = {
  unitId: string;
  status?: LeaseStatus;
  tenantName?: string;
  tenantPhone?: string;
  tenantProfileId?: string | null;
  monthlyRent?: number;
  maintenanceFee?: number;
  paymentDay?: number;
  lateFeeRatePct?: number | null;
  startDate?: Date;
  endDate?: Date;
};

/** 계약 1건 — 기간을 직접 정할 수 있다(만기 임박 검증용) */
export async function createLease(input: LeaseInput): Promise<Lease> {
  return prisma.lease.create({
    data: {
      unitId: input.unitId,
      tenantProfileId: input.tenantProfileId ?? null,
      tenantName: input.tenantName ?? "박세입",
      tenantPhone: input.tenantPhone ?? "01022222222",
      deposit: 20_000_000,
      monthlyRent: input.monthlyRent ?? 650_000,
      maintenanceFee: input.maintenanceFee ?? 50_000,
      paymentDay: input.paymentDay ?? 5,
      startDate: input.startDate ?? utcDate(2026, 3, 1),
      endDate: input.endDate ?? utcDate(2027, 2, 28),
      lateFeeRatePct: input.lateFeeRatePct === undefined ? 5 : input.lateFeeRatePct,
      status: input.status ?? LeaseStatus.ACTIVE,
    },
  });
}

export type ChargeInput = {
  leaseId: string;
  year: number;
  month: number;
  /** 납부기한 일자(기본 5일) */
  day?: number;
  rentAmount?: number;
  maintenanceAmount?: number;
  carriedOverAmount?: number;
  lateFeeAmount?: number;
  totalDue?: number;
  paidAmount?: number;
  /** 저장되는 스냅샷 상태. 대시보드는 이 컬럼 대신 실효 상태를 다시 판정한다 */
  status?: ChargeStatus;
};

/** 청구 1건 — 금액·기한을 직접 정한다 */
export async function createCharge(input: ChargeInput) {
  const rentAmount = input.rentAmount ?? 650_000;
  const maintenanceAmount = input.maintenanceAmount ?? 50_000;
  const carriedOverAmount = input.carriedOverAmount ?? 0;
  const lateFeeAmount = input.lateFeeAmount ?? 0;
  return prisma.rentCharge.create({
    data: {
      leaseId: input.leaseId,
      year: input.year,
      month: input.month,
      dueDate: utcDate(input.year, input.month, input.day ?? 5),
      rentAmount,
      maintenanceAmount,
      carriedOverAmount,
      lateFeeAmount,
      totalDue:
        input.totalDue ?? rentAmount + maintenanceAmount + carriedOverAmount + lateFeeAmount,
      paidAmount: input.paidAmount ?? 0,
      status: input.status ?? ChargeStatus.SCHEDULED,
    },
  });
}

/**
 * 시드(`packages/db/prisma/seed.ts`)의 임대인 시나리오를 그대로 재현한다.
 * 행당해피빌 — 101호 공실 / 201호 ACTIVE(6월 완납·7월 부분납·8월 연체·9월 예정) / 202호 PENDING(8월 완납).
 */
export async function createSeedScenario(ownerProfileId: string) {
  const building = await createBuildingWithUnits(
    ownerProfileId,
    ["101호", "201호", "202호"],
    "행당해피빌",
  );
  const unit = (label: string) => building.units.find((u) => u.label === label)!;

  const activeLease = await createLease({ unitId: unit("201호").id });
  await createCharge({
    leaseId: activeLease.id,
    year: 2026,
    month: 6,
    paidAmount: 700_000,
    status: ChargeStatus.PAID,
  });
  await createCharge({
    leaseId: activeLease.id,
    year: 2026,
    month: 7,
    paidAmount: 400_000,
    status: ChargeStatus.PARTIALLY_PAID,
  });
  const augustCharge = await createCharge({
    leaseId: activeLease.id,
    year: 2026,
    month: 8,
    carriedOverAmount: 300_000,
    lateFeeAmount: 15_500,
    totalDue: 1_015_500,
    status: ChargeStatus.OVERDUE,
  });
  const septemberCharge = await createCharge({ leaseId: activeLease.id, year: 2026, month: 9 });

  const pendingLease = await createLease({
    unitId: unit("202호").id,
    status: LeaseStatus.PENDING_TENANT,
    tenantName: "홍미가",
    tenantPhone: "01055555555",
    monthlyRent: 550_000,
    maintenanceFee: 30_000,
    paymentDay: 25,
    lateFeeRatePct: null,
    startDate: utcDate(2026, 7, 25),
    endDate: utcDate(2027, 7, 24),
  });
  await createCharge({
    leaseId: pendingLease.id,
    year: 2026,
    month: 8,
    day: 25,
    rentAmount: 550_000,
    maintenanceAmount: 30_000,
    paidAmount: 580_000,
    status: ChargeStatus.PAID,
  });

  return { building, activeLease, pendingLease, augustCharge, septemberCharge };
}

/** 세입자가 올린 민원 1건 (T2.6 이 채울 데이터를 미리 흉내낸다) */
export async function createComplaint(input: {
  leaseId: string;
  tenantProfileId: string;
  status?: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";
  title?: string;
}) {
  return prisma.complaint.create({
    data: {
      leaseId: input.leaseId,
      tenantProfileId: input.tenantProfileId,
      title: input.title ?? "보일러가 안 켜져요",
      body: "온수가 나오지 않습니다.",
      status: input.status ?? "OPEN",
    },
  });
}

/** MASTER 프로필 한 개 (견적 제안자) */
export async function createMasterProfile(phone = "01044444444", name = "최마스") {
  const user = await prisma.user.create({
    data: { phone, name, profiles: { create: { type: ProfileType.MASTER } } },
    include: { profiles: true },
  });
  return user.profiles[0]!;
}

/** 임대인의 작업 의뢰 + 그 의뢰에 달린 견적 1건 (T5.3 이 채울 데이터) */
export async function createWorkOrderQuote(input: {
  requesterProfileId: string;
  masterProfileId: string;
  status?: "PROPOSED" | "ACCEPTED" | "REJECTED";
  amount?: number;
}) {
  const workOrder = await prisma.workOrder.create({
    data: {
      requesterProfileId: input.requesterProfileId,
      category: MasterCategory.REPAIR,
      description: "201호 보일러 점검",
    },
  });
  const quote = await prisma.workOrderQuote.create({
    data: {
      workOrderId: workOrder.id,
      masterProfileId: input.masterProfileId,
      amount: input.amount ?? 180_000,
      status: input.status ?? "PROPOSED",
    },
  });
  return { workOrder, quote };
}
