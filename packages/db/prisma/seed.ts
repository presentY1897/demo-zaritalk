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
 * - 최마스(01044444444, MASTER): 성수 수리·청소 업체, 반경 5km, **유료(PRO)** — push 추천을 받는다
 * - 한마스(01066666666, MASTER): 성수 인테리어·수리 업체, 반경 5km, **무료(FREE)** — 피드로만 찾아간다
 * - 관리자(01000000000, isAdmin)
 *
 * Phase 5(T5.1·T5.2) 시나리오: 행당해피빌 201호 수리(REPAIR) 의뢰 1건이 `REQUESTED` 로 있고,
 * 두 마스터 모두 **전체 피드(pull)** 에서 그 의뢰를 본다. 반면 **추천(push)** 은 PRO 인
 * 최마스에게만 `WorkOrderTarget` + 발송 로그로 가 있다 — 화면에서 pull/push 차이가 바로 보인다.
 *
 * 전체 삭제 후 재생성하므로 데모 DB 전용이다.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  ChargeStatus,
  DealType,
  LeaseStatus,
  ListingStatus,
  MasterCategory,
  MasterPlan,
  MessageKind,
  PaymentMethod,
  PrismaClient,
  ProfileType,
  RealDealType,
  WorkOrderStatus,
} from "../src/generated/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * `@db.Date` 컬럼용 — UTC 자정으로 만든다.
 * KST 자정(`T00:00:00+09:00`)으로 넣으면 UTC 로는 전날 15:00 이라
 * Postgres `date` 로 잘릴 때 하루가 밀린다(계약 시작일이 하루 앞당겨 보이던 버그).
 */
const d = (s: string) => new Date(`${s}T00:00:00Z`);

/** 타임스탬프 컬럼용 — "그날 한국시간 자정에 일어난 일"을 뜻한다. */
const at = (s: string) => new Date(`${s}T00:00:00+09:00`);

/**
 * 두 좌표 사이 거리(km) — 하버사인.
 *
 * 앱 쪽 원본은 `apps/web/src/lib/geo/distance.ts` 의 `haversineKm` 이다(T5.1 이 만들고 T3.6 이
 * 재사용한다). 시드는 앱 소스를 import 할 수 없어(별 패키지) 같은 식을 여기 한 번 더 적는다 —
 * `WorkOrderTarget.distanceKm` 을 앱이 계산한 값과 같게 채우기 위해서다.
 */
const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
};

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
    prisma.workOrderTarget.deleteMany(),
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
    // 원격 DB(Neon)는 왕복 지연이 커서 29개 deleteMany 가 기본 5초 트랜잭션 제한을 넘긴다.
  ], { timeout: 120_000, maxWait: 30_000 });

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

  // 유료(PRO) 마스터 — 조건에 맞는 의뢰를 **추천으로 받아본다**(D4 push)
  const proMaster = await prisma.user.create({
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
              plan: MasterPlan.PRO,
              planUntil: at("2027-01-01"),
            },
          },
        },
      },
    },
    include: { profiles: { include: { masterDetail: true } } },
  });
  const proMasterDetail = proMaster.profiles[0].masterDetail!;

  // 무료(FREE) 마스터 — 추천은 못 받고 **피드를 뒤져서 찾아간다**(D4 pull).
  // 업종을 최마스와 겹치게(REPAIR) 둔 이유: 같은 의뢰가 두 사람 피드에 다 뜨는데
  // 추천함은 PRO 인 최마스만 채워지는 것을 한 화면에서 보이게 하려는 것이다.
  await prisma.user.create({
    data: {
      phone: "01066666666",
      name: "한마스",
      profiles: {
        create: {
          type: ProfileType.MASTER,
          masterDetail: {
            create: {
              companyName: "성수리인테리어",
              categories: [MasterCategory.INTERIOR, MasterCategory.REPAIR],
              address: "서울 성동구 연무장길 33",
              lat: 37.5445,
              lng: 127.0555,
              radiusKm: 5,
              intro: "원룸 인테리어·부분 시공, 간단 수리도 합니다.",
              // plan 은 기본값 FREE
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
      tenantAcceptedAt: at("2026-03-02"),
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
          paidAt: at("2026-06-05"),
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
          paidAt: at("2026-07-10"),
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
      // 연체료는 원장 엔진(T1.4) 규칙 그대로다 —
      // floor(이월 300,000 × rate 5% × 연체 31일(7/5→8/5) / 30) = 15,500.
      // 이 값이 엔진과 어긋나면 `lib/rent/ledger.test.ts` 의 시드 시나리오 테스트가 깨진다.
      lateFeeAmount: 15_500,
      totalDue: 1_015_500,
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
      sentAt: at("2026-08-12"),
      openedAt: at("2026-08-12"),
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
          paidAt: at("2026-08-25"),
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
      sentAt: at("2026-08-20"),
    },
  });

  // ---- Phase 5: 작업 의뢰 1건(REQUESTED) + PRO 마스터 추천(push) ----
  // pull 피드(전 마스터)는 이 의뢰를 업종·반경으로 찾아 보고,
  // push 추천(PRO 만)은 아래 WorkOrderTarget + 발송 로그로 미리 가 있다.
  const workOrder = await prisma.workOrder.create({
    data: {
      requesterProfileId: landlordProfile.id,
      buildingId: building.id,
      unitId: unitByLabel["201호"].id,
      category: MasterCategory.REPAIR,
      description: "201호 온수가 미지근합니다. 보일러 점검·수리 부탁드립니다.",
      desiredDate: d("2026-09-10"),
      status: WorkOrderStatus.REQUESTED,
      createdAt: at("2026-09-01"),
    },
  });
  await prisma.workOrderTarget.create({
    data: {
      workOrderId: workOrder.id,
      masterProfileId: proMasterDetail.profileId,
      distanceKm: Number(haversineKm(building, proMasterDetail).toFixed(3)),
      sentAt: at("2026-09-01"),
    },
  });
  await prisma.messageLog.create({
    data: {
      kind: MessageKind.WORK_ORDER_REQUEST,
      toPhone: "01044444444",
      title: "새 작업 의뢰 추천 — 수리/설비",
      body: "행당해피빌 201호 · 201호 온수가 미지근합니다. 보일러 점검·수리 부탁드립니다.",
      sentAt: at("2026-09-01"),
    },
  });


  // ---- 지도·실거래가 화면용 시드 ----
  //
  // 매물이 하나도 없으면 `/search` 가 빈 지도로 열리고, 실거래가가 없으면 `/deals` 첫 진입이
  // 온디맨드 수집을 기다린다 — 데모 첫인상이 나빠진다.
  //
  // **김임대가 아니라 별도 임대인(정임대)에게 붙인다.** 김임대에게 건물을 더하면 임대인
  // 대시보드(T1.9)의 "건물 1 · 호실 3" 집계와 그 테스트가 함께 깨진다. 지도·매물 화면은
  // 공개라 소유자와 무관하게 전부 보이므로 목적에는 영향이 없다.
  //
  // 좌표는 전부 **위도 37.56 초과**다 — `e2e/search.spec.ts` 가 핀 개수를 셀 때 쓰는 영역
  // (37.49~37.55 / 37.53~37.56)에 걸리지 않게 일부러 그 밖에 둔다.
  const secondLandlord = await prisma.user.create({
    data: {
      phone: "01077777777",
      name: "정임대",
      profiles: { create: { type: ProfileType.LANDLORD } },
    },
    include: { profiles: true },
  });
  const secondLandlordProfile = secondLandlord.profiles[0];

  const showcase = [
    {
      name: "왕십리센트럴",
      address: "서울 성동구 왕십리로 300",
      lat: 37.5615,
      lng: 127.0378,
      units: [
        { label: "302호", floor: 3, areaM2: 44.2, rooms: 2, deal: DealType.WOLSE, deposit: 20_000_000, rent: 900_000, desc: "왕십리역 도보 5분, 2룸 풀옵션. 관리비 별도." },
        { label: "401호", floor: 4, areaM2: 29.8, rooms: 1, deal: DealType.WOLSE, deposit: 10_000_000, rent: 650_000, desc: "역세권 1.5룸, 채광 좋은 남향." },
      ],
    },
    {
      name: "행당역푸르지오",
      address: "서울 성동구 행당로 17",
      lat: 37.5637,
      lng: 127.0295,
      units: [
        { label: "1203호", floor: 12, areaM2: 59.9, rooms: 3, deal: DealType.JEONSE, deposit: 380_000_000, rent: 0, desc: "고층 전세, 한강 조망. 즉시 입주 가능." },
      ],
    },
    {
      name: "마장한신",
      address: "서울 성동구 마장로 210",
      lat: 37.5665,
      lng: 127.0431,
      units: [
        { label: "505호", floor: 5, areaM2: 36.4, rooms: 2, deal: DealType.WOLSE, deposit: 5_000_000, rent: 550_000, desc: "보증금 낮은 월세, 신혼·1인 가구용." },
      ],
    },
  ];

  let showcaseListings = 0;
  for (const item of showcase) {
    const created = await prisma.building.create({
      data: {
        ownerProfileId: secondLandlordProfile.id,
        name: item.name,
        address: item.address,
        roadAddress: item.address,
        lat: item.lat,
        lng: item.lng,
        units: {
          create: item.units.map((u) => ({
            label: u.label,
            floor: u.floor,
            areaM2: u.areaM2,
            rooms: u.rooms,
          })),
        },
      },
      include: { units: true },
    });
    for (const u of item.units) {
      const unit = created.units.find((row) => row.label === u.label);
      if (!unit) continue;
      await prisma.listing.create({
        data: {
          unitId: unit.id,
          listedByProfileId: secondLandlordProfile.id,
          dealType: u.deal,
          deposit: u.deposit,
          monthlyRent: u.rent,
          description: u.desc,
          availableFrom: d("2026-10-01"),
          status: ListingStatus.OPEN,
        },
      });
      showcaseListings += 1;
    }
  }

  // 실거래가 — 성동구(11200) 최근 3개월. 금액 단위는 **만원**(국토부 원본 단위 그대로).
  const dealSamples: {
    dealType: RealDealType;
    aptName: string;
    areaM2: number;
    floor: number;
    dealDate: string;
    price?: number;
    deposit?: number;
    monthlyRent?: number;
    builtYear: number;
  }[] = [
    { dealType: RealDealType.SALE, aptName: "행당한진타운", areaM2: 84.9, floor: 12, dealDate: "2026-07-14", price: 128_000, builtYear: 2000 },
    { dealType: RealDealType.SALE, aptName: "행당한진타운", areaM2: 59.8, floor: 7, dealDate: "2026-08-03", price: 98_500, builtYear: 2000 },
    { dealType: RealDealType.SALE, aptName: "서울숲리버뷰자이", areaM2: 84.9, floor: 21, dealDate: "2026-08-21", price: 205_000, builtYear: 2018 },
    { dealType: RealDealType.JEONSE, aptName: "행당한진타운", areaM2: 84.9, floor: 5, dealDate: "2026-07-09", deposit: 62_000, monthlyRent: 0, builtYear: 2000 },
    { dealType: RealDealType.JEONSE, aptName: "왕십리센트라스", areaM2: 59.9, floor: 15, dealDate: "2026-08-11", deposit: 58_000, monthlyRent: 0, builtYear: 2016 },
    { dealType: RealDealType.WOLSE, aptName: "왕십리센트라스", areaM2: 39.6, floor: 3, dealDate: "2026-08-05", deposit: 10_000, monthlyRent: 95, builtYear: 2016 },
    { dealType: RealDealType.WOLSE, aptName: "서울숲리버뷰자이", areaM2: 59.9, floor: 9, dealDate: "2026-09-01", deposit: 20_000, monthlyRent: 130, builtYear: 2018 },
  ];
  for (const row of dealSamples) {
    await prisma.realTransaction.create({
      data: {
        lawdCd: "11200",
        dealType: row.dealType,
        aptName: row.aptName,
        areaM2: row.areaM2,
        floor: row.floor,
        dealDate: d(row.dealDate),
        price: row.price ?? null,
        deposit: row.deposit ?? null,
        monthlyRent: row.monthlyRent ?? null,
        builtYear: row.builtYear,
      },
    });
  }
  void showcaseListings;

  console.log("seed 완료:", {
    users: await prisma.user.count(),
    profiles: await prisma.profile.count(),
    units: await prisma.unit.count(),
    leases: await prisma.lease.count(),
    charges: await prisma.rentCharge.count(),
    payments: await prisma.rentPayment.count(),
    messages: await prisma.messageLog.count(),
    workOrders: await prisma.workOrder.count(),
    workOrderTargets: await prisma.workOrderTarget.count(),
    listings: await prisma.listing.count(),
    realTransactions: await prisma.realTransaction.count(),
  });
  void realtor;
}

main().finally(() => prisma.$disconnect());
