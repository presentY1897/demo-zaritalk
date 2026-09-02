/**
 * 작업 의뢰·마스터 테스트 픽스처 (T5.1·T5.2) — **테스트에서만 import 한다**(앱 코드에서 쓰지 않는다).
 *
 * 계정·건물·호실은 T1.1 `features/landlord/testing.ts`, 임대인+호실 묶음은 T1.2
 * `features/lease/testing.ts` 를 그대로 재사용하고 — 여기서는 **마스터와 의뢰**만 더한다.
 *
 * 매칭 테스트가 거리를 눈으로 읽을 수 있어야 해서, 마스터는 "건물에서 북쪽으로 N km" 로 놓는다
 * (`masterPointNorthOf`). 위도 1도 ≈ 111.19km 이므로 오차는 반경 판정에 영향을 주지 않는다.
 */
import {
  MasterCategory,
  MasterPlan,
  prisma,
  ProfileType,
  QuoteStatus,
  WorkOrderStatus,
} from "@zari/db";
import { createBuildingWithUnits, createLandlord } from "@/features/landlord/testing";

/** 시드 건물(행당해피빌)과 같은 좌표 — `createBuildingWithUnits` 가 쓰는 값이다 */
export const BUILDING_POINT = { lat: 37.56152, lng: 127.03648 };

/** 위도 1도 ≈ 111.19km — 건물에서 북쪽으로 `km` 만큼 떨어진 좌표 */
export function masterPointNorthOf(km: number): { lat: number; lng: number } {
  return { lat: BUILDING_POINT.lat + km / 111.19, lng: BUILDING_POINT.lng };
}

export type CreateMasterOptions = {
  name?: string;
  companyName?: string;
  categories?: MasterCategory[];
  /** 건물에서 북쪽으로 몇 km 떨어져 있나 (기본 2km) */
  distanceKm?: number;
  /** 마스터가 스스로 정한 활동반경 (기본 5km) */
  radiusKm?: number;
  plan?: MasterPlan;
  planUntil?: Date | null;
};

/** 마스터 계정 + MASTER 프로필 + `MasterDetail` */
export async function createMaster(phone: string, options: CreateMasterOptions = {}) {
  const point = masterPointNorthOf(options.distanceKm ?? 2);
  const user = await prisma.user.create({
    data: {
      phone,
      name: options.name ?? "최마스",
      profiles: {
        create: {
          type: ProfileType.MASTER,
          masterDetail: {
            create: {
              companyName: options.companyName ?? "성수홈케어",
              categories: options.categories ?? [MasterCategory.REPAIR],
              address: "서울 성동구 아차산로 100",
              lat: point.lat,
              lng: point.lng,
              radiusKm: options.radiusKm ?? 5,
              plan: options.plan ?? MasterPlan.FREE,
              planUntil: options.planUntil ?? null,
            },
          },
        },
      },
    },
    include: { profiles: { include: { masterDetail: true } } },
  });
  const profile = user.profiles[0];
  if (!profile?.masterDetail) throw new Error("마스터 프로필 생성 실패");
  return { user, profile, detail: profile.masterDetail };
}

/** 유료(PRO) 마스터 — 추천(push) 대상이 되는 쪽 */
export function createProMaster(phone: string, options: CreateMasterOptions = {}) {
  return createMaster(phone, { plan: MasterPlan.PRO, ...options });
}

/** 마스터 프로필이 없는 계정(임대인) — 403 검증용 */
export async function createNonMaster(phone = "01099999999", name = "김임대") {
  return createLandlord(phone, name);
}

/** 임대인 + 건물 + 호실 — 의뢰 대상이 되는 무대 */
export async function createWorkOrderScene(
  phone = "01011111111",
  labels: string[] = ["201호"],
) {
  const landlord = await createLandlord(phone);
  const building = await createBuildingWithUnits(landlord.profile.id, labels);
  const unit = building.units[0];
  if (!unit) throw new Error("호실 생성 실패");
  return { ...landlord, building, unit, units: building.units };
}

export type WorkOrderSceneLike = {
  profile: { id: string };
  building: { id: string };
  unit?: { id: string } | null;
};

/** 의뢰 1건 (기본 `REQUESTED` · `REPAIR` — 마스터 피드가 보는 상태) */
export async function addWorkOrder(
  scene: WorkOrderSceneLike,
  overrides: {
    category?: MasterCategory;
    status?: WorkOrderStatus;
    description?: string;
    unitId?: string | null;
    buildingId?: string | null;
    complaintId?: string;
  } = {},
) {
  return prisma.workOrder.create({
    data: {
      requesterProfileId: scene.profile.id,
      buildingId: overrides.buildingId === undefined ? scene.building.id : overrides.buildingId,
      unitId: overrides.unitId === undefined ? (scene.unit?.id ?? null) : overrides.unitId,
      complaintId: overrides.complaintId,
      category: overrides.category ?? MasterCategory.REPAIR,
      description: overrides.description ?? "201호 온수가 미지근합니다. 보일러 점검 부탁드립니다.",
      status: overrides.status ?? WorkOrderStatus.REQUESTED,
    },
  });
}

/** 견적 1건 (기본 `PROPOSED` — 임대인이 아직 고르지 않은 상태) (T5.3) */
export async function addQuote(
  workOrderId: string,
  masterProfileId: string,
  overrides: { amount?: number; message?: string | null; status?: QuoteStatus } = {},
) {
  return prisma.workOrderQuote.create({
    data: {
      workOrderId,
      masterProfileId,
      amount: overrides.amount ?? 180_000,
      message: overrides.message === undefined ? "순환펌프 교체 기준입니다." : overrides.message,
      status: overrides.status ?? QuoteStatus.PROPOSED,
    },
  });
}

/** push 추천 1건 — 견적의 `source` 가 `PUSH` 로 잡히는지 볼 때 쓴다 (T5.3) */
export async function addWorkOrderTarget(
  workOrderId: string,
  masterProfileId: string,
  distanceKm = 2,
) {
  return prisma.workOrderTarget.create({
    data: { workOrderId, masterProfileId, distanceKm },
  });
}
