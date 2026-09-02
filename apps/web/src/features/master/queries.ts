/**
 * 마스터 시점 조회 — 전체 피드(pull) · 추천함(push) (T5.2). **서버 전용**(`@zari/db` 를 쓴다).
 *
 * 라우트 핸들러와 서버 컴포넌트가 **같은 함수**를 쓴다(T1.1 규칙).
 *
 * ## pull 과 push 는 데이터가 다른 곳에서 온다
 *
 * | | 어디서 읽나 | 조건 | 정렬 |
 * |---|---|---|---|
 * | 전체 피드(pull) | `WorkOrder` 를 직접 훑는다 | `REQUESTED` + 내 업종 + 내 활동반경 안 | **거리순** |
 * | 추천함(push) | 이미 만들어진 `WorkOrderTarget` 을 읽는다 | 나에게 발송된 것 | **최신 발송순** |
 *
 * 그래서 피드는 "지금 이 순간의 계산" 이고, 추천함은 "그때 보낸 기록" 이다 —
 * 추천 거리(`WorkOrderTarget.distanceKm`)는 발송 시점에 굳은 값을 그대로 보여 준다.
 *
 * 반경 판정은 `@/lib/geo/distance` 의 `rankByDistance` 하나로 한다. 원점이 **마스터 사무소**,
 * 후보가 **의뢰 건물**이고 반경은 전부 내 `radiusKm` 이다(push 매칭과 원점·후보가 뒤바뀐
 * 모양이지만 거리 판정식은 같다).
 */
import { prisma, type MasterDetail, type Prisma } from "@zari/db";
import { rankByDistance } from "@/lib/geo/distance";
import { toWorkOrderPlace } from "@/features/workorder/queries";
import type {
  MasterCategoryValue,
  MasterPlanDto,
  MasterPlanValue,
  MasterWorkOrderDto,
  WorkOrderStatusValue,
} from "@/features/workorder/types";
import { formatDateKey } from "@/lib/rent";
import { isProActive } from "./plan";
import type { MasterSession } from "./ownership";

/** 피드·추천함이 함께 쓰는 관계 — 화면 문구("행당해피빌 201호 · 김임대")에 필요한 만큼 */
const feedInclude = {
  building: true,
  unit: true,
  requesterProfile: { include: { user: { select: { name: true } } } },
} satisfies Prisma.WorkOrderInclude;

type FeedRow = Prisma.WorkOrderGetPayload<{ include: typeof feedInclude }>;

/** 마스터 홈 상단의 내 플랜·조건 요약 */
export function toMasterPlanDto(detail: MasterDetail): MasterPlanDto {
  return {
    plan: detail.plan as MasterPlanValue,
    planUntil: detail.planUntil?.toISOString() ?? null,
    companyName: detail.companyName,
    categories: detail.categories as MasterCategoryValue[],
    radiusKm: detail.radiusKm,
  };
}

function toMasterWorkOrder(
  row: FeedRow,
  extra: { distanceKm: number; recommended: boolean; sentAt: Date | null },
): MasterWorkOrderDto {
  return {
    id: row.id,
    category: row.category as MasterCategoryValue,
    description: row.description,
    desiredDate: row.desiredDate ? formatDateKey(row.desiredDate) : null,
    status: row.status as WorkOrderStatusValue,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    place: toWorkOrderPlace(row),
    distanceKm: extra.distanceKm,
    landlordName: row.requesterProfile.user.name,
    recommended: extra.recommended,
    sentAt: extra.sentAt?.toISOString() ?? null,
  };
}

/**
 * 전체 피드(pull) — **모든 마스터가 본다**(무료 포함).
 * 내 업종 + 내 활동반경 안의 `REQUESTED` 의뢰를 거리순으로 준다.
 *
 * 업종이 하나도 등록돼 있지 않으면 빈 목록이다(조건을 만족하는 의뢰가 없다).
 */
export async function listMasterFeed(detail: MasterDetail): Promise<MasterWorkOrderDto[]> {
  if (detail.categories.length === 0) return [];

  const rows = await prisma.workOrder.findMany({
    where: {
      status: "REQUESTED",
      category: { in: detail.categories },
      buildingId: { not: null },
    },
    include: feedInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  // 나에게 이미 추천으로 온 의뢰는 피드에서도 그 사실을 표시한다(중복 노출은 D4 가 의도한 것)
  const targets = await prisma.workOrderTarget.findMany({
    where: { masterProfileId: detail.profileId, workOrderId: { in: rows.map((row) => row.id) } },
    select: { workOrderId: true, sentAt: true },
  });
  const sentAtByOrder = new Map(targets.map((target) => [target.workOrderId, target.sentAt]));

  const candidates = rows
    .filter((row) => row.building !== null)
    .map((row) => ({
      row,
      lat: row.building!.lat,
      lng: row.building!.lng,
      radiusKm: detail.radiusKm,
    }));

  return rankByDistance(detail, candidates).map((ranked) =>
    toMasterWorkOrder(ranked.candidate.row, {
      distanceKm: ranked.distanceKm,
      recommended: sentAtByOrder.has(ranked.candidate.row.id),
      sentAt: sentAtByOrder.get(ranked.candidate.row.id) ?? null,
    }),
  );
}

/**
 * 추천함(push) — **유료(PRO)만.** 나에게 발송된 `WorkOrderTarget` 을 최신순으로 준다.
 *
 * FREE(또는 만료된 PRO)면 **빈 목록**이다. 여기서 조회 자체를 막는 이유는, 플랜이 끊긴 뒤
 * 과거 추천이 계속 보이면 "무료인데 추천이 온다" 로 읽히기 때문이다 —
 * 화면은 대신 업그레이드 안내를 그린다(`upgradeRequired`).
 */
export async function listMasterTargets(
  detail: MasterDetail,
  now: Date = new Date(),
): Promise<MasterWorkOrderDto[]> {
  if (!isProActive(detail.plan as MasterPlanValue, detail.planUntil, now)) return [];

  const targets = await prisma.workOrderTarget.findMany({
    where: { masterProfileId: detail.profileId },
    include: { workOrder: { include: feedInclude } },
    orderBy: [{ sentAt: "desc" }, { id: "desc" }],
  });

  return targets.map((target) =>
    toMasterWorkOrder(target.workOrder, {
      distanceKm: target.distanceKm,
      recommended: true,
      sentAt: target.sentAt,
    }),
  );
}

/**
 * 의뢰 상세를 볼 수 있는가 — 볼 수 있으면 DTO, 아니면 null(화면은 `notFound()`).
 *
 * 두 갈래 중 하나면 통과한다:
 * 1. **나에게 추천으로 온 의뢰**(`WorkOrderTarget` 이 있다) — 상태와 무관하다.
 * 2. **내 피드에 들어오는 의뢰** — 업종이 맞고 내 활동반경 안이다.
 *    상태는 보지 않는다(피드에서 열어 본 의뢰가 완료됐다고 갑자기 404 가 되면 안 된다).
 */
export async function getMasterWorkOrder(
  session: MasterSession,
  workOrderId: string,
): Promise<MasterWorkOrderDto | null> {
  const row = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    include: feedInclude,
  });
  if (!row?.building) return null;

  const target = await prisma.workOrderTarget.findUnique({
    where: {
      workOrderId_masterProfileId: {
        workOrderId,
        masterProfileId: session.detail.profileId,
      },
    },
  });
  if (target) {
    return toMasterWorkOrder(row, {
      distanceKm: target.distanceKm,
      recommended: true,
      sentAt: target.sentAt,
    });
  }

  const categoryMatched = session.detail.categories.includes(row.category);
  if (!categoryMatched) return null;

  const [inRange] = rankByDistance(session.detail, [
    { lat: row.building.lat, lng: row.building.lng, radiusKm: session.detail.radiusKm },
  ]);
  if (!inRange) return null;

  return toMasterWorkOrder(row, {
    distanceKm: inRange.distanceKm,
    recommended: false,
    sentAt: null,
  });
}
