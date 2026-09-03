/**
 * 어드민 조회 API 테스트 픽스처 (T6.3) — **테스트에서만 import 한다**(앱 코드에서 쓰지 않는다).
 *
 * 여섯 개 라우트 테스트가 같은 무대를 쓰므로 여기 모아 둔다.
 */
import {
  ChargeStatus,
  LeaseStatus,
  MessageKind,
  prisma,
  ProfileType,
  type Prisma,
  type User,
} from "@zari/db";
import { createSession } from "@/lib/auth/session";

export const ADMIN_PHONE = "01000000000";
export const TEST_ADMIN_SECRET = "test-admin-secret";
export const TEST_ADMIN_PASSCODE = "test-admin-passcode";

/** 관리자 계정 — 어드민 API 가 유일하게 인정하는 신분 */
export function createAdminUser(phone = ADMIN_PHONE, name = "관리자"): Promise<User> {
  return prisma.user.create({ data: { phone, name, isAdmin: true } });
}

/** 어드민이 아닌 계정 — 「비어드민 403」 검증용 */
export function createPlainUser(phone = "01077777777", name = "일반"): Promise<User> {
  return prisma.user.create({
    data: { phone, name, profiles: { create: { type: ProfileType.TENANT } } },
  });
}

/** 로그인 상태 만들기 — `next/headers` 를 목킹한 테스트에서만 동작한다(T0.3 패턴) */
export function loginAs(userId: string): Promise<string> {
  return createSession(userId);
}

export type LeaseScene = Awaited<ReturnType<typeof createLeaseScene>>;

/**
 * 임대인 + 건물 + 호실 + 계약 + 청구 3건(완납·부분납·연체) + 발송 2건.
 *
 * 청구의 `dueDate` 는 과거로 못 박아 두므로 실행 시각과 무관하게 연체 판정이 재현된다.
 */
export async function createLeaseScene(
  options: {
    landlordPhone?: string;
    landlordName?: string;
    tenantPhone?: string;
    tenantName?: string;
    buildingName?: string;
    unitLabel?: string;
    status?: (typeof LeaseStatus)[keyof typeof LeaseStatus];
    linkTenant?: boolean;
  } = {},
) {
  const landlord = await prisma.user.create({
    data: {
      phone: options.landlordPhone ?? "01011111111",
      name: options.landlordName ?? "김임대",
      profiles: { create: { type: ProfileType.LANDLORD } },
    },
    include: { profiles: true },
  });
  const landlordProfile = landlord.profiles[0]!;

  const tenant = await prisma.user.create({
    data: {
      phone: options.tenantPhone ?? "01022222222",
      name: options.tenantName ?? "박세입",
      profiles: { create: { type: ProfileType.TENANT } },
    },
    include: { profiles: true },
  });
  const tenantProfile = tenant.profiles[0]!;

  const building = await prisma.building.create({
    data: {
      ownerProfileId: landlordProfile.id,
      name: options.buildingName ?? "행당해피빌",
      address: "서울 성동구 행당로 79",
      lat: 37.56152,
      lng: 127.03648,
      units: { create: [{ label: options.unitLabel ?? "201호", floor: 2 }] },
    },
    include: { units: true },
  });
  const unit = building.units[0]!;

  const lease = await prisma.lease.create({
    data: {
      unitId: unit.id,
      tenantProfileId: options.linkTenant === false ? null : tenantProfile.id,
      tenantName: tenant.name,
      tenantPhone: tenant.phone,
      deposit: 20_000_000,
      monthlyRent: 650_000,
      maintenanceFee: 50_000,
      paymentDay: 5,
      startDate: new Date("2026-03-01T00:00:00Z"),
      endDate: new Date("2027-02-28T00:00:00Z"),
      lateFeeRatePct: 5,
      status: options.status ?? LeaseStatus.ACTIVE,
      tenantAcceptedAt: options.linkTenant === false ? null : new Date("2026-03-02T00:00:00Z"),
    },
  });

  const paid = await createCharge(lease.id, {
    year: 2026,
    month: 6,
    day: 5,
    totalDue: 700_000,
    paidAmount: 700_000,
    status: ChargeStatus.PAID,
  });
  const partial = await createCharge(lease.id, {
    year: 2026,
    month: 7,
    day: 5,
    totalDue: 700_000,
    paidAmount: 400_000,
    status: ChargeStatus.PARTIALLY_PAID,
  });
  const overdue = await createCharge(lease.id, {
    year: 2026,
    month: 8,
    day: 5,
    totalDue: 1_015_500,
    paidAmount: 0,
    status: ChargeStatus.OVERDUE,
  });

  await prisma.messageLog.create({
    data: {
      kind: MessageKind.RENT_NOTICE,
      toPhone: tenant.phone,
      title: "2026년 8월 월세 고지서",
      body: "[자리톡] 월세 고지서입니다.",
      token: `tok-${lease.id.slice(-8)}`,
      leaseId: lease.id,
      chargeId: overdue.id,
      sentAt: new Date("2026-08-01T00:00:00Z"),
      openedAt: new Date("2026-08-01T02:00:00Z"),
    },
  });
  await prisma.messageLog.create({
    data: {
      kind: MessageKind.OVERDUE_NOTICE,
      toPhone: tenant.phone,
      title: "2026년 8월 월세 연체 안내",
      body: "[자리톡] 연체 안내입니다.",
      leaseId: lease.id,
      chargeId: overdue.id,
      sentAt: new Date("2026-08-20T00:00:00Z"),
    },
  });

  return { landlord, landlordProfile, tenant, tenantProfile, building, unit, lease, charges: { paid, partial, overdue } };
}

export function createCharge(
  leaseId: string,
  input: {
    year: number;
    month: number;
    day?: number;
    totalDue: number;
    paidAmount?: number;
    status: (typeof ChargeStatus)[keyof typeof ChargeStatus];
  },
) {
  const day = input.day ?? 5;
  const pad = (n: number) => String(n).padStart(2, "0");
  return prisma.rentCharge.create({
    data: {
      leaseId,
      year: input.year,
      month: input.month,
      dueDate: new Date(`${input.year}-${pad(input.month)}-${pad(day)}T00:00:00Z`),
      rentAmount: 650_000,
      maintenanceAmount: 50_000,
      totalDue: input.totalDue,
      paidAmount: input.paidAmount ?? 0,
      status: input.status,
    },
  });
}

/** 트래킹 이벤트 한 줄 — 시각을 못 박아 시간대 버킷을 재현한다 */
export function createEvent(input: {
  name: string;
  createdAt: Date;
  anonId?: string;
  userId?: string | null;
  path?: string;
  props?: Prisma.InputJsonObject;
}) {
  return prisma.trackingEvent.create({
    data: {
      name: input.name,
      anonId: input.anonId ?? "anon0123456789abcdef0123456789ab",
      userId: input.userId ?? null,
      path: input.path ?? "/",
      props: input.props ?? undefined,
      createdAt: input.createdAt,
    },
  });
}
