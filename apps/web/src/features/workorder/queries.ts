/**
 * 작업 의뢰 조회·DTO 매핑 (T5.1) — **서버 전용**(`@zari/db` 를 쓴다).
 *
 * 라우트 핸들러와 서버 컴포넌트가 **같은 함수**를 쓴다(T1.1 이 세운 규칙) — 그래야 페이지가
 * 내려주는 초기 데이터와 `GET /api/work-orders` 응답 모양이 어긋나지 않는다.
 * 마스터 시점(피드·추천함) 조회는 `features/master/queries.ts` 가 따로 가지고 있다.
 */
import { prisma, type Prisma } from "@zari/db";
import { formatDateKey } from "@/lib/rent";
import { isOpenWorkOrder } from "./status";
import type {
  LandlordWorkOrderDto,
  MasterCategoryValue,
  WorkOrderPlaceDto,
  WorkOrderPlaceOptionDto,
  WorkOrderStatusValue,
} from "./types";

/** 임대인 목록·상세가 함께 쓰는 관계 */
const landlordInclude = {
  building: true,
  unit: true,
  complaint: { select: { id: true, title: true } },
  _count: { select: { targets: true, quotes: true } },
} satisfies Prisma.WorkOrderInclude;

type LandlordWorkOrderRow = Prisma.WorkOrderGetPayload<{ include: typeof landlordInclude }>;

/** 의뢰 행에서 화면 문구용 위치를 뽑는다 — 건물이 없으면 null(스키마상 가능) */
export function toWorkOrderPlace(row: {
  building: { id: string; name: string; address: string } | null;
  unit: { id: string; label: string } | null;
}): WorkOrderPlaceDto | null {
  if (!row.building) return null;
  return {
    buildingId: row.building.id,
    buildingName: row.building.name,
    buildingAddress: row.building.address,
    unitId: row.unit?.id ?? null,
    unitLabel: row.unit?.label ?? null,
  };
}

export function toLandlordWorkOrder(row: LandlordWorkOrderRow): LandlordWorkOrderDto {
  return {
    id: row.id,
    category: row.category as MasterCategoryValue,
    description: row.description,
    desiredDate: row.desiredDate ? formatDateKey(row.desiredDate) : null,
    status: row.status as WorkOrderStatusValue,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    place: toWorkOrderPlace(row),
    // 전환 여부는 `complaintId` 하나로 갈린다 — 별도 플래그를 두면 두 값이 어긋날 수 있다
    source: row.complaintId ? "COMPLAINT" : "DIRECT",
    complaintId: row.complaintId,
    complaintTitle: row.complaint?.title ?? null,
    targetCount: row._count.targets,
    quoteCount: row._count.quotes,
  };
}

/**
 * 내 의뢰 목록 — **진행 중(요청·견적도착·배정)이 먼저**, 그다음 최근 등록 순.
 * 종결(완료·취소)은 아래로 내린다(임대인이 찾는 것은 아직 끝나지 않은 일이다).
 */
export async function listLandlordWorkOrders(
  requesterProfileId: string,
): Promise<LandlordWorkOrderDto[]> {
  const rows = await prisma.workOrder.findMany({
    where: { requesterProfileId },
    include: landlordInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return rows.map(toLandlordWorkOrder).sort((a, b) => {
    const openDiff = Number(isOpenWorkOrder(b.status)) - Number(isOpenWorkOrder(a.status));
    return openDiff !== 0 ? openDiff : b.createdAt.localeCompare(a.createdAt);
  });
}

/** 의뢰 1건 — **권한은 보지 않는다**(호출부가 가드를 먼저 통과시킨다) */
export async function getLandlordWorkOrder(
  workOrderId: string,
): Promise<LandlordWorkOrderDto | null> {
  const row = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    include: landlordInclude,
  });
  return row ? toLandlordWorkOrder(row) : null;
}

/** 생성 시트의 대상 선택지 — 내 건물과 그 호실들(호실이 없는 건물도 공용부 작업으로 고를 수 있다) */
export async function listWorkOrderPlaceOptions(
  ownerProfileId: string,
): Promise<WorkOrderPlaceOptionDto[]> {
  const buildings = await prisma.building.findMany({
    where: { ownerProfileId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { units: { orderBy: [{ label: "asc" }] } },
  });
  return buildings.map((building) => ({
    buildingId: building.id,
    buildingName: building.name,
    buildingAddress: building.address,
    units: building.units.map((unit) => ({ id: unit.id, label: unit.label })),
  }));
}
