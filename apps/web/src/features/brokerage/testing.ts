/**
 * 중개 요청·수신함 테스트 픽스처 (T3.6·T3.7) — **테스트에서만 import 한다**(앱 코드에서 쓰지 않는다).
 *
 * 계정·건물·호실은 T1.1 `features/landlord/testing.ts` 를 그대로 재사용하고,
 * 여기서는 **중개인과 요청·타겟**만 더한다.
 *
 * 반경 테스트가 거리를 눈으로 읽을 수 있어야 해서 중개인 사무소는 "건물에서 북쪽으로 N km" 로 놓는다
 * (`officePointNorthOf`). 위도 1도 ≈ 111.19km 이므로 오차는 반경 판정에 영향을 주지 않는다.
 * 마스터 쪽(T5.1 `features/workorder/testing.ts`)에 같은 모양의 헬퍼가 있다 — 원점 건물이 같다.
 */
import { BrokerageRequestStatus, BrokerageTargetStatus, prisma, ProfileType } from "@zari/db";
import { createBuildingWithUnits, createLandlord } from "@/features/landlord/testing";

/** 시드 건물(행당해피빌)과 같은 좌표 — `createBuildingWithUnits`(T1.1 픽스처)가 쓰는 값이다 */
export const BUILDING_POINT = { lat: 37.56152, lng: 127.03648 };

/** 위도 1도 ≈ 111.19km — 건물에서 북쪽으로 `km` 만큼 떨어진 좌표 */
export function officePointNorthOf(km: number): { lat: number; lng: number } {
  return { lat: BUILDING_POINT.lat + km / 111.19, lng: BUILDING_POINT.lng };
}

export type CreateRealtorOptions = {
  name?: string;
  officeName?: string;
  /** 건물에서 북쪽으로 몇 km 떨어져 있나 (기본 1km) */
  distanceKm?: number;
  /** 중개인이 스스로 정한 활동반경 (기본 3km) */
  radiusKm?: number;
  licenseNo?: string | null;
  intro?: string | null;
};

/** 중개인 계정 + REALTOR 프로필 + `RealtorDetail` */
export async function createRealtorWithDetail(
  phone: string = "01033333333",
  options: CreateRealtorOptions = {},
) {
  const point = officePointNorthOf(options.distanceKm ?? 1);
  const user = await prisma.user.create({
    data: {
      phone,
      name: options.name ?? "이중개",
      profiles: {
        create: {
          type: ProfileType.REALTOR,
          realtorDetail: {
            create: {
              officeName: options.officeName ?? "왕십리공인중개사",
              address: "서울 성동구 왕십리로 300",
              lat: point.lat,
              lng: point.lng,
              radiusKm: options.radiusKm ?? 3,
              licenseNo: options.licenseNo ?? "92010-2026-00001",
              intro: options.intro ?? null,
            },
          },
        },
      },
    },
    include: { profiles: { include: { realtorDetail: true } } },
  });
  const profile = user.profiles[0];
  if (!profile?.realtorDetail) throw new Error("중개인 프로필 생성 실패");
  return { user, profile, detail: profile.realtorDetail };
}

/** 활동지역(`RealtorDetail`)이 없는 중개인 — 403 검증용 */
export async function createRealtorWithoutDetail(phone = "01088888888", name = "무등록중개") {
  const user = await prisma.user.create({
    data: { phone, name, profiles: { create: { type: ProfileType.REALTOR } } },
    include: { profiles: true },
  });
  const profile = user.profiles[0];
  if (!profile) throw new Error("중개인 프로필 생성 실패");
  return { user, profile };
}

/** 임대인 + 건물 + 호실 — 중개 요청의 무대(기본 101호 공실) */
export async function createBrokerageScene(
  phone = "01011111111",
  labels: string[] = ["101호"],
) {
  const landlord = await createLandlord(phone);
  const building = await createBuildingWithUnits(landlord.profile.id, labels);
  const unit = building.units[0];
  if (!unit) throw new Error("호실 생성 실패");
  return { ...landlord, building, unit, units: building.units };
}

export type BrokerageSceneLike = {
  profile: { id: string };
  unit: { id: string };
};

/** 중개 요청 1건 (기본 `OPEN` · 대상 없음 — 발송은 `dispatchBrokerageTargets` 가 한다) */
export async function addBrokerageRequest(
  scene: BrokerageSceneLike,
  overrides: {
    unitId?: string;
    message?: string | null;
    status?: BrokerageRequestStatus;
  } = {},
) {
  return prisma.brokerageRequest.create({
    data: {
      unitId: overrides.unitId ?? scene.unit.id,
      landlordProfileId: scene.profile.id,
      message: overrides.message === undefined ? "공실 중개 부탁드립니다." : overrides.message,
      status: overrides.status ?? BrokerageRequestStatus.OPEN,
    },
  });
}

/** 타겟 1건 — 상태를 직접 만들어 전이·권한 판정을 검증할 때 쓴다 */
export async function addBrokerageTarget(
  requestId: string,
  realtorProfileId: string,
  overrides: { distanceKm?: number; status?: BrokerageTargetStatus } = {},
) {
  return prisma.brokerageTarget.create({
    data: {
      requestId,
      realtorProfileId,
      distanceKm: overrides.distanceKm ?? 1,
      status: overrides.status ?? BrokerageTargetStatus.SENT,
    },
  });
}
