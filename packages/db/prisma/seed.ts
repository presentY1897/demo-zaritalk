/**
 * 데모 시드: 역할별 원클릭 로그인 계정 4종 + 어드민, 그리고 Phase 1(수납·고지)
 * 화면에서 바로 보이는 시나리오 데이터.
 *
 * - 김임대(01011111111, LANDLORD): 건물 1채(호실 3) —
 *   201호: 박세입과 ACTIVE 계약, 6~9월 청구(완납/부분납/연체/예정)
 *   202호: 미가입 세입자(홍미가)와 PENDING_TENANT 계약 + 공개 고지서 발송분
 *   101호: 공실 (매물·중개 요청 시나리오용)
 * - 박세입(01022222222, TENANT): 201호 세입자, 근무지 1곳(강남역)
 * - 이중개(01033333333, REALTOR): 왕십리 사무소, 반경 3km
 * - 최마스(01044444444, MASTER): 성수 수리·청소 업체, 반경 5km
 * - 관리자(01000000000, isAdmin)
 *
 * 전체 삭제 후 재생성하므로 데모 DB 전용이다.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { ChargeStatus, LeaseStatus, MasterCategory, MessageKind, PaymentMethod, PrismaClient, ProfileType } from "../src/generated/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const d = (s: string) => new Date(`${s}T00:00:00+09:00`);

async function main() {
  // 의존 역순 전체 삭제
  await prisma.$transaction([
    prisma.abAssignment.deleteMany(),
    prisma.trackingEvent.deleteMany(),
    prisma.transactionAlert.deleteMany(),
    prisma.realTransaction.deleteMany(),
    prisma.report.deleteMany(),
    prisma.postLike.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.post.deleteMany(),
    prisma.workOrderQuote.deleteMany(),
    prisma.workOrder.deleteMany(),
    prisma.complaintMessage.deleteMany(),
    prisma.complaint.deleteMany(),
    prisma.refundApplication.deleteMany(),
    prisma.commuteCache.deleteMany(),
    prisma.brokerageTarget.deleteMany(),
    prisma.brokerageRequest.deleteMany(),
    prisma.listing.deleteMany(),
    prisma.messageLog.deleteMany(),
    prisma.rentPayment.deleteMany(),
    prisma.tossPayment.deleteMany(),
    prisma.rentCharge.deleteMany(),
    prisma.lease.deleteMany(),
    prisma.unit.deleteMany(),
    prisma.building.deleteMany(),
    prisma.workplace.deleteMany(),
    prisma.masterDetail.deleteMany(),
    prisma.realtorDetail.deleteMany(),
    prisma.profile.deleteMany(),
    prisma.otpCode.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  await prisma.user.create({
    data: { phone: "01000000000", name: "관리자", isAdmin: true },
  });

  const landlord = await prisma.user.create({
    data: {
      phone: "01011111111",
      name: "김임대",
      profiles: { create: { type: ProfileType.LANDLORD } },
    },
    include: { profiles: true },
  });
  const landlordProfile = landlord.profiles[0];

  const tenant = await prisma.user.create({
    data: {
      phone: "01022222222",
      name: "박세입",
      profiles: { create: { type: ProfileType.TENANT } },
    },
    include: { profiles: true },
  });
  const tenantProfile = tenant.profiles[0];

  await prisma.workplace.create({
    data: {
      tenantProfileId: tenantProfile.id,
      label: "회사",
      address: "서울 강남구 강남대로 396 (강남역)",
      lat: 37.49794,
      lng: 127.02762,
    },
  });

  const realtor = await prisma.user.create({
    data: {
      phone: "01033333333",
      name: "이중개",
      profiles: {
        create: {
          type: ProfileType.REALTOR,
          realtorDetail: {
            create: {
              officeName: "왕십리부동산",
              address: "서울 성동구 왕십리로 300",
              lat: 37.56133,
              lng: 127.03782,
              radiusKm: 3,
              intro: "성동구 원룸·투룸 전문입니다.",
            },
          },
        },
      },
    },
  });

  const master = await prisma.user.create({
    data: {
      phone: "01044444444",
      name: "최마스",
      profiles: {
        create: {
          type: ProfileType.MASTER,
          masterDetail: {
            create: {
              companyName: "성수홈케어",
              categories: [MasterCategory.REPAIR, MasterCategory.CLEANING],
              address: "서울 성동구 아차산로 100",
              lat: 37.54453,
              lng: 127.05599,
              radiusKm: 5,
              intro: "누수·보일러 수리, 입주 청소 전문.",
            },
          },
        },
      },
    },
  });

  const building = await prisma.building.create({
    data: {
      ownerProfileId: landlordProfile.id,
      name: "행당해피빌",
      address: "서울 성동구 행당로 79",
      roadAddress: "서울 성동구 행당로 79",
      lat: 37.56152,
      lng: 127.03648,
      units: {
        create: [
          { label: "101호", floor: 1, areaM2: 23.1, rooms: 1 },
          { label: "201호", floor: 2, areaM2: 33.5, rooms: 2 },
          { label: "202호", floor: 2, areaM2: 23.1, rooms: 1 },
        ],
      },
    },
    include: { units: true },
  });
  const unitByLabel = Object.fromEntries(building.units.map((u) => [u.label, u]));

  // ---- 201호: ACTIVE 계약 (박세입 연결됨) + 수납 시나리오 ----
  const activeLease = await prisma.lease.create({
    data: {
      unitId: unitByLabel["201호"].id,
      tenantProfileId: tenantProfile.id,
      tenantName: "박세입",
      tenantPhone: "01022222222",
      deposit: 20_000_000,
      monthlyRent: 650_000,
      maintenanceFee: 50_000,
      paymentDay: 5,
      startDate: d("2026-03-01"),
      endDate: d("2027-02-28"),
      lateFeeRatePct: 5,
      status: LeaseStatus.ACTIVE,
      tenantAcceptedAt: d("2026-03-02"),
    },
  });

  // 6월: 완납(가상 입금) / 7월: 부분납 → 잔액 30만 이월 / 8월: 이월+연체료, 연체 중 / 9월: 납부 예정
  await prisma.rentCharge.create({
    data: {
      leaseId: activeLease.id,
      year: 2026,
      month: 6,
      dueDate: d("2026-06-05"),
      rentAmount: 650_000,
      maintenanceAmount: 50_000,
      totalDue: 700_000,
      paidAmount: 700_000,
      status: ChargeStatus.PAID,
      payments: {
        create: {
          amount: 700_000,
          method: PaymentMethod.VIRTUAL_TRANSFER,
          paidAt: d("2026-06-05"),
          memo: "박세입",
        },
      },
    },
  });
  await prisma.rentCharge.create({
    data: {
      leaseId: activeLease.id,
      year: 2026,
      month: 7,
      dueDate: d("2026-07-05"),
      rentAmount: 650_000,
      maintenanceAmount: 50_000,
      totalDue: 700_000,
      paidAmount: 400_000,
      status: ChargeStatus.PARTIALLY_PAID,
      payments: {
        create: {
          amount: 400_000,
          method: PaymentMethod.MANUAL_CHECK,
          paidAt: d("2026-07-10"),
          memo: "일부 입금 확인",
        },
      },
    },
  });
  const augustCharge = await prisma.rentCharge.create({
    data: {
      leaseId: activeLease.id,
      year: 2026,
      month: 8,
      dueDate: d("2026-08-05"),
      rentAmount: 650_000,
      maintenanceAmount: 50_000,
      carriedOverAmount: 300_000,
      lateFeeAmount: 15_000,
      totalDue: 1_015_000,
      paidAmount: 0,
      status: ChargeStatus.OVERDUE,
    },
  });
  await prisma.rentCharge.create({
    data: {
      leaseId: activeLease.id,
      year: 2026,
      month: 9,
      dueDate: d("2026-09-05"),
      rentAmount: 650_000,
      maintenanceAmount: 50_000,
      totalDue: 700_000,
      status: ChargeStatus.SCHEDULED,
    },
  });

  await prisma.messageLog.create({
    data: {
      kind: MessageKind.OVERDUE_NOTICE,
      toPhone: "01022222222",
      title: "8월 월세 연체 안내",
      body: "행당해피빌 201호 8월분 1,015,000원이 연체 중입니다.",
      token: "demo-overdue-park",
      leaseId: activeLease.id,
      chargeId: augustCharge.id,
      sentAt: d("2026-08-12"),
      openedAt: d("2026-08-12"),
    },
  });

  // ---- 202호: 미가입 세입자와 PENDING 계약 + 공개 고지서 ----
  const pendingLease = await prisma.lease.create({
    data: {
      unitId: unitByLabel["202호"].id,
      tenantName: "홍미가",
      tenantPhone: "01055555555",
      deposit: 10_000_000,
      monthlyRent: 550_000,
      maintenanceFee: 30_000,
      paymentDay: 25,
      startDate: d("2026-07-25"),
      endDate: d("2027-07-24"),
      status: LeaseStatus.PENDING_TENANT,
    },
  });
  const pendingCharge = await prisma.rentCharge.create({
    data: {
      leaseId: pendingLease.id,
      year: 2026,
      month: 8,
      dueDate: d("2026-08-25"),
      rentAmount: 550_000,
      maintenanceAmount: 30_000,
      totalDue: 580_000,
      paidAmount: 580_000,
      status: ChargeStatus.PAID,
      payments: {
        create: {
          amount: 580_000,
          method: PaymentMethod.MANUAL_CHECK,
          paidAt: d("2026-08-25"),
        },
      },
    },
  });
  await prisma.messageLog.create({
    data: {
      kind: MessageKind.RENT_NOTICE,
      toPhone: "01055555555",
      title: "8월 월세 고지서",
      body: "행당해피빌 202호 8월분 580,000원 고지서입니다.",
      token: "demo-notice-hong",
      leaseId: pendingLease.id,
      chargeId: pendingCharge.id,
      sentAt: d("2026-08-20"),
    },
  });

  console.log("seed 완료:", {
    users: await prisma.user.count(),
    profiles: await prisma.profile.count(),
    units: await prisma.unit.count(),
    leases: await prisma.lease.count(),
    charges: await prisma.rentCharge.count(),
    payments: await prisma.rentPayment.count(),
    messages: await prisma.messageLog.count(),
  });
  void realtor;
  void master;
}

main().finally(() => prisma.$disconnect());
