/**
 * 매물 API 테스트 픽스처 (T3.1) — **테스트에서만 import 한다**.
 *
 * 계정·건물·호실·계약은 T1.1 `features/landlord/testing.ts` 를 그대로 재사용하고,
 * 여기서는 **중개인 계정과 "수락한 중개 요청"** 만 더한다 — 그 상태를 만드는 API 는
 * T3.7 소유라 아직 없으므로 테스트가 데이터를 직접 만든다.
 */
import { BrokerageTargetStatus, prisma, ProfileType } from "@zari/db";

/** 중개인 계정 + REALTOR 프로필(활동지역 Detail 포함) */
export async function createRealtor(phone = "01033333333", name = "이중개") {
  const user = await prisma.user.create({
    data: {
      phone,
      name,
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
            },
          },
        },
      },
    },
    include: { profiles: true },
  });
  const profile = user.profiles[0];
  if (!profile) throw new Error("중개인 프로필 생성 실패");
  return { user, profile };
}

/**
 * 중개 요청 1건 + 그 중개인에게 간 타겟.
 * `status` 를 `ACCEPTED` 로 주면 그 중개인이 이 호실에 매물을 올릴 수 있게 된다(T3.7 상태).
 */
export async function createBrokerageTarget(
  unitId: string,
  landlordProfileId: string,
  realtorProfileId: string,
  status: (typeof BrokerageTargetStatus)[keyof typeof BrokerageTargetStatus] = BrokerageTargetStatus.ACCEPTED,
) {
  return prisma.brokerageRequest.create({
    data: {
      unitId,
      landlordProfileId,
      message: "공실 중개 부탁드립니다.",
      targets: { create: { realtorProfileId, distanceKm: 0.8, status } },
    },
    include: { targets: true },
  });
}

/** 매물 1건 — 기본은 공개(OPEN) */
export async function createListingRow(
  unitId: string,
  listedByProfileId: string,
  overrides: {
    status?: "OPEN" | "RESERVED" | "CLOSED";
    dealType?: "JEONSE" | "WOLSE";
    deposit?: number;
    monthlyRent?: number;
  } = {},
) {
  return prisma.listing.create({
    data: {
      unitId,
      listedByProfileId,
      dealType: overrides.dealType ?? "WOLSE",
      deposit: overrides.deposit ?? 10_000_000,
      monthlyRent: overrides.monthlyRent ?? 500_000,
      status: overrides.status ?? "OPEN",
    },
  });
}
