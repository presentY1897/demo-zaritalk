/**
 * 건물·호실 API 테스트 픽스처 (T1.1) — **테스트에서만 import 한다**(앱 코드에서 쓰지 않는다).
 * 네 개 라우트 테스트가 같은 데이터를 만들므로 여기 모아 둔다.
 */
import { ChargeStatus, LeaseStatus, prisma, ProfileType } from "@zari/db";
import { createSession } from "@/lib/auth/session";

/** 임대인 계정 + LANDLORD 프로필 */
export async function createLandlord(phone = "01011111111", name = "김임대") {
  const user = await prisma.user.create({
    data: { phone, name, profiles: { create: { type: ProfileType.LANDLORD } } },
    include: { profiles: true },
  });
  const profile = user.profiles[0];
  if (!profile) throw new Error("임대인 프로필 생성 실패");
  return { user, profile };
}

/** 임대인 프로필이 없는 계정(세입자) — 403 검증용 */
export async function createTenantOnlyUser(phone = "01022222222", name = "박세입") {
  const user = await prisma.user.create({
    data: { phone, name, profiles: { create: { type: ProfileType.TENANT } } },
    include: { profiles: true },
  });
  const profile = user.profiles[0];
  if (!profile) throw new Error("세입자 프로필 생성 실패");
  return { user, profile };
}

/** 로그인 상태 만들기 — `next/headers` 를 목킹한 테스트에서만 동작한다(T0.3 패턴) */
export async function loginAs(userId: string): Promise<string> {
  return createSession(userId);
}

/** 건물 + 호실 라벨 목록 */
export async function createBuildingWithUnits(
  ownerProfileId: string,
  labels: string[] = [],
  name = "행당해피빌",
) {
  return prisma.building.create({
    data: {
      ownerProfileId,
      name,
      address: "서울 성동구 행당로 79",
      lat: 37.56152,
      lng: 127.03648,
      units: { create: labels.map((label) => ({ label })) },
    },
    include: { units: true },
  });
}

/** 계약 1건 — 기본은 진행 중(ACTIVE) */
export async function createLease(
  unitId: string,
  status: (typeof LeaseStatus)[keyof typeof LeaseStatus] = LeaseStatus.ACTIVE,
  tenantProfileId?: string,
) {
  return prisma.lease.create({
    data: {
      unitId,
      tenantProfileId: tenantProfileId ?? null,
      tenantName: "박세입",
      tenantPhone: "01022222222",
      deposit: 20_000_000,
      monthlyRent: 650_000,
      maintenanceFee: 50_000,
      paymentDay: 5,
      startDate: new Date("2026-03-01T00:00:00Z"),
      endDate: new Date("2027-02-28T00:00:00Z"),
      status,
    },
  });
}

/** 청구 1건 — 연체 판정(그리드 색) 검증용 */
export async function createCharge(
  leaseId: string,
  status: (typeof ChargeStatus)[keyof typeof ChargeStatus] = ChargeStatus.OVERDUE,
  overrides: { year?: number; month?: number; totalDue?: number; paidAmount?: number } = {},
) {
  return prisma.rentCharge.create({
    data: {
      leaseId,
      year: overrides.year ?? 2026,
      month: overrides.month ?? 8,
      dueDate: new Date("2026-08-05T00:00:00Z"),
      rentAmount: 650_000,
      maintenanceAmount: 50_000,
      totalDue: overrides.totalDue ?? 700_000,
      paidAmount: overrides.paidAmount ?? 0,
      status,
    },
  });
}
