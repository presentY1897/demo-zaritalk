/**
 * 중개 요청 조회·DTO 매핑 (T3.6·T3.7) — **서버 전용**(`@zari/db` 를 쓴다).
 *
 * T1.1 이 세운 규약 그대로다: 라우트 핸들러와 서버 컴포넌트가 **같은 함수**를 써서
 * 페이지 초기 데이터와 API 응답 모양이 어긋나지 않게 한다(Tanstack Query `initialData`).
 *
 * 재사용하는 판정들 — 여기서 새로 만들지 않는다:
 *
 * | 무엇 | 어디 |
 * |---|---|
 * | 반경 매칭(거리순 20명) | `./matching.ts` → `@/lib/geo/distance` (T5.1) |
 * | 호실 상태(공실 판정) | `@/features/listing/queries` `getUnitStatus` → T1.1 `deriveUnitStatus` |
 * | 살아 있는 매물 판정 | `@/features/listing/status` `isLiveListing` (T3.1) |
 * | 매물 등록 차단 사유 문구 | `@/features/listing/queries` `listingBlockedReason` (T3.1) |
 *
 * 마지막 항목이 중요하다 — 중개인 수신함이 보여 주는 "매물을 올릴 수 없는 이유" 와
 * 매물 관리 화면(T3.1)의 문구가 **같은 함수에서 나온다.**
 */
import { prisma, type Prisma } from "@zari/db";
import {
  getUnitStatus,
  listingBlockedReason,
  toListingDto,
} from "@/features/listing/queries";
import { isLiveListing } from "@/features/listing/status";
import type { ListingDto } from "@/features/listing/types";
import type { UnitStatus } from "@/features/landlord/types";
import type { RealtorSession } from "./ownership";
import { BROKERAGE_TARGET_LIMIT, selectBrokerageTargets } from "./matching";
import type {
  BrokerageListingSummaryDto,
  BrokeragePlaceDto,
  BrokeragePreviewResult,
  BrokerageRealtorContactDto,
  BrokerageRealtorPreviewDto,
  BrokerageRequestDto,
  BrokerageRequestStatusValue,
  BrokerageTargetCounts,
  BrokerageTargetStatusValue,
  BrokerageUnitOptionDto,
  RealtorInboxItemDto,
  RealtorListingDto,
  RealtorProfileDto,
} from "./types";

/** 요청 카드가 필요한 관계 — 대상 중개인의 사무소·연락처까지 한 번에 읽는다 */
const requestInclude = {
  unit: { include: { building: true } },
  targets: {
    include: {
      realtorProfile: {
        include: {
          user: { select: { name: true, phone: true } },
          realtorDetail: true,
        },
      },
    },
    orderBy: [{ distanceKm: "asc" as const }, { id: "asc" as const }],
  },
} satisfies Prisma.BrokerageRequestInclude;

type RequestRow = Prisma.BrokerageRequestGetPayload<{ include: typeof requestInclude }>;
type TargetRow = RequestRow["targets"][number];

/** 중개인 수신함이 필요한 관계 — 요청 → 호실·건물 + 임대인 */
const targetInclude = {
  request: {
    include: {
      unit: { include: { building: true } },
      landlordProfile: { include: { user: { select: { name: true, phone: true } } } },
    },
  },
} satisfies Prisma.BrokerageTargetInclude;

type InboxRow = Prisma.BrokerageTargetGetPayload<{ include: typeof targetInclude }>;

type UnitWithBuilding = {
  id: string;
  label: string;
  floor: number | null;
  areaM2: number | null;
  rooms: number | null;
  building: { id: string; name: string; address: string; lat: number; lng: number };
};

/** 호실 + 건물 → 화면·매칭이 함께 쓰는 위치 DTO. **좌표는 건물 것이다.** */
export function toBrokeragePlace(unit: UnitWithBuilding): BrokeragePlaceDto {
  return {
    unitId: unit.id,
    unitLabel: unit.label,
    floor: unit.floor,
    areaM2: unit.areaM2,
    rooms: unit.rooms,
    buildingId: unit.building.id,
    buildingName: unit.building.name,
    buildingAddress: unit.building.address,
    lat: unit.building.lat,
    lng: unit.building.lng,
  };
}

/** 상태별 0으로 채운 카운터 — 응답 현황 집계의 시작값 */
function emptyTargetCounts(): BrokerageTargetCounts {
  return { SENT: 0, VIEWED: 0, ACCEPTED: 0, DECLINED: 0 };
}

function countTargets(targets: readonly { status: string }[]): BrokerageTargetCounts {
  const counts = emptyTargetCounts();
  for (const target of targets) {
    counts[target.status as BrokerageTargetStatusValue] += 1;
  }
  return counts;
}

/** 수락한 중개인 → 연락 카드. **여기서만 이름·전화번호를 담는다**(미리보기에는 없다) */
function toContact(target: TargetRow): BrokerageRealtorContactDto | null {
  const detail = target.realtorProfile.realtorDetail;
  if (!detail) return null;
  return {
    targetId: target.id,
    profileId: target.realtorProfileId,
    officeName: detail.officeName,
    address: detail.address,
    lat: detail.lat,
    lng: detail.lng,
    radiusKm: detail.radiusKm,
    distanceKm: target.distanceKm,
    name: target.realtorProfile.user.name,
    phone: target.realtorProfile.user.phone,
    licenseNo: detail.licenseNo,
    intro: detail.intro,
    respondedAt: target.respondedAt?.toISOString() ?? null,
  };
}

/** 매물 요약 — 임대인 카드·중개인 카드가 같은 모양을 쓴다 */
function toListingSummary(
  listing: ListingDto,
  viewerProfileId: string | null,
): BrokerageListingSummaryDto {
  return {
    id: listing.id,
    status: listing.status,
    dealType: listing.dealType,
    deposit: listing.deposit,
    monthlyRent: listing.monthlyRent,
    mine: viewerProfileId !== null && listing.listedBy.profileId === viewerProfileId,
    listedByName: listing.listedBy.name,
  };
}

/**
 * 호실별 **살아 있는 매물**(OPEN·RESERVED)을 한 번에 읽는다.
 * "살아 있다" 의 판정은 T3.1 `isLiveListing` 한 곳에서만 한다.
 */
async function liveListingsByUnit(unitIds: string[]): Promise<Map<string, ListingDto>> {
  if (unitIds.length === 0) return new Map();
  const rows = await prisma.listing.findMany({
    where: { unitId: { in: unitIds } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { listedByProfile: { include: { user: { select: { name: true } } } } },
  });

  const map = new Map<string, ListingDto>();
  for (const row of rows) {
    if (!isLiveListing(row.status)) continue;
    if (!map.has(row.unitId)) map.set(row.unitId, toListingDto(row));
  }
  return map;
}

/**
 * 호실 상태를 한 번에 읽는다 — 판정은 T3.1 `getUnitStatus`(→ T1.1 `deriveUnitStatus`)를
 * 호실마다 그대로 부른다. 판정을 여기 옮겨 적으면 자산 그리드와 답이 갈라질 수 있어
 * **질의 수보다 단일 출처를 택했다**(데모 규모에서는 호실 수가 한 자릿수다).
 */
async function unitStatusesOf(unitIds: string[]): Promise<Map<string, UnitStatus>> {
  const unique = [...new Set(unitIds)];
  const statuses = await Promise.all(unique.map((id) => getUnitStatus(id)));
  return new Map(unique.map((id, index) => [id, statuses[index] as UnitStatus]));
}

// ===================== 임대인 시점 =====================

function toRequestDto(row: RequestRow, listing: ListingDto | null): BrokerageRequestDto {
  const accepted = row.targets
    .filter((target) => target.status === "ACCEPTED")
    .map(toContact)
    .filter((contact): contact is BrokerageRealtorContactDto => contact !== null);

  return {
    id: row.id,
    status: row.status as BrokerageRequestStatusValue,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    place: toBrokeragePlace(row.unit),
    targetCount: row.targets.length,
    counts: countTargets(row.targets),
    accepted,
    listing: listing ? toListingSummary(listing, null) : null,
  };
}

/** 내 중개 요청 목록(최신순) */
export async function listLandlordBrokerageRequests(
  landlordProfileId: string,
): Promise<BrokerageRequestDto[]> {
  const rows = await prisma.brokerageRequest.findMany({
    where: { landlordProfileId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: requestInclude,
  });

  const listings = await liveListingsByUnit(rows.map((row) => row.unitId));
  return rows.map((row) => toRequestDto(row, listings.get(row.unitId) ?? null));
}

/** 요청 1건(생성·응답 뒤 응답 조립용) */
export async function getBrokerageRequest(
  requestId: string,
): Promise<BrokerageRequestDto | null> {
  const row = await prisma.brokerageRequest.findUnique({
    where: { id: requestId },
    include: requestInclude,
  });
  if (!row) return null;
  const listings = await liveListingsByUnit([row.unitId]);
  return toRequestDto(row, listings.get(row.unitId) ?? null);
}

/** 그 호실에 아직 열려 있는(OPEN) 요청 — 있으면 새로 만들지 않고 **재발송**한다 */
export async function findOpenRequestForUnit(unitId: string) {
  return prisma.brokerageRequest.findFirst({
    where: { unitId, status: "OPEN" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

/**
 * 요청 시트가 고를 수 있는 호실 — **공실만** 담는다.
 * 계약이 걸린 호실은 애초에 목록에 나오지 않고, API 도 같은 이유로 409 를 낸다.
 */
export async function listBrokerageUnitOptions(
  landlordProfileId: string,
): Promise<BrokerageUnitOptionDto[]> {
  const units = await prisma.unit.findMany({
    where: { building: { ownerProfileId: landlordProfileId } },
    include: { building: true },
    orderBy: [{ buildingId: "asc" }, { label: "asc" }],
  });

  const [statuses, openRequests] = await Promise.all([
    unitStatusesOf(units.map((unit) => unit.id)),
    prisma.brokerageRequest.findMany({
      where: { landlordProfileId, status: "OPEN" },
      select: { id: true, unitId: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]);

  const openByUnit = new Map<string, string>();
  for (const request of openRequests) {
    if (!openByUnit.has(request.unitId)) openByUnit.set(request.unitId, request.id);
  }

  return units
    .filter((unit) => statuses.get(unit.id) === "VACANT")
    .map((unit) => ({
      ...toBrokeragePlace(unit),
      status: "VACANT" as UnitStatus,
      openRequestId: openByUnit.get(unit.id) ?? null,
    }));
}

/** 요청을 보낼 수 없는 이유(화면 문구 = API 409 문구). 보낼 수 있으면 null */
export function brokerageBlockedReason(unitStatus: UnitStatus): string | null {
  return unitStatus === "VACANT"
    ? null
    : "계약이 있는 호실에는 중개를 요청할 수 없습니다. 계약을 먼저 정리해 주세요.";
}

function toPreviewRealtor(entry: {
  candidate: { profileId: string; officeName: string; address: string; lat: number; lng: number; radiusKm: number };
  distanceKm: number;
}): BrokerageRealtorPreviewDto {
  return {
    profileId: entry.candidate.profileId,
    officeName: entry.candidate.officeName,
    address: entry.candidate.address,
    lat: entry.candidate.lat,
    lng: entry.candidate.lng,
    radiusKm: entry.candidate.radiusKm,
    distanceKm: entry.distanceKm,
  };
}

/**
 * 발송 전 미리보기 — **발송이 부르는 것과 같은 `selectBrokerageTargets`** 를 쓴다.
 * 그래서 여기 뜨는 인원 수가 곧 보내질 인원 수다(이미 보낸 중개인이 없는 첫 발송 기준).
 */
export async function getBrokeragePreview(
  unit: UnitWithBuilding,
): Promise<BrokeragePreviewResult> {
  const place = toBrokeragePlace(unit);
  const [ranked, unitStatus, openRequest] = await Promise.all([
    selectBrokerageTargets({ lat: place.lat, lng: place.lng }),
    getUnitStatus(unit.id),
    findOpenRequestForUnit(unit.id),
  ]);

  const realtors = ranked.map(toPreviewRealtor);
  return {
    unit: place,
    realtors,
    count: realtors.length,
    limit: BROKERAGE_TARGET_LIMIT,
    blockedReason: brokerageBlockedReason(unitStatus),
    openRequestId: openRequest?.id ?? null,
  };
}

// ===================== 중개인 시점 =====================

export function toRealtorProfileDto(detail: {
  officeName: string;
  address: string;
  lat: number;
  lng: number;
  radiusKm: number;
  licenseNo: string | null;
}): RealtorProfileDto {
  return {
    officeName: detail.officeName,
    address: detail.address,
    lat: detail.lat,
    lng: detail.lng,
    radiusKm: detail.radiusKm,
    licenseNo: detail.licenseNo,
  };
}

/** 수락 전에는 임대인 연락처를 감춘다 — 수락이 곧 "연락해도 된다" 는 합의다 */
function toInboxItem(
  row: InboxRow,
  context: {
    viewerProfileId: string;
    unitStatus: UnitStatus;
    listing: ListingDto | null;
  },
): RealtorInboxItemDto {
  const status = row.status as BrokerageTargetStatusValue;
  const accepted = status === "ACCEPTED";
  const listing = context.listing;

  const blocked = accepted
    ? listingBlockedReason(context.unitStatus, listing)
    : "요청을 수락하면 이 호실에 매물을 등록할 수 있습니다.";

  return {
    targetId: row.id,
    status,
    distanceKm: row.distanceKm,
    respondedAt: row.respondedAt?.toISOString() ?? null,
    requestId: row.requestId,
    requestStatus: row.request.status as BrokerageRequestStatusValue,
    message: row.request.message,
    createdAt: row.request.createdAt.toISOString(),
    place: toBrokeragePlace(row.request.unit),
    landlord: {
      name: row.request.landlordProfile.user.name,
      phone: accepted ? row.request.landlordProfile.user.phone : null,
    },
    listing: listing ? toListingSummary(listing, context.viewerProfileId) : null,
    canCreateListing: blocked === null,
    listingBlockedReason: blocked,
  };
}

async function toInboxItems(
  rows: InboxRow[],
  viewerProfileId: string,
): Promise<RealtorInboxItemDto[]> {
  const unitIds = rows.map((row) => row.request.unitId);
  const [statuses, listings] = await Promise.all([
    unitStatusesOf(unitIds),
    liveListingsByUnit(unitIds),
  ]);

  return rows.map((row) =>
    toInboxItem(row, {
      viewerProfileId,
      unitStatus: statuses.get(row.request.unitId) ?? "VACANT",
      listing: listings.get(row.request.unitId) ?? null,
    }),
  );
}

/**
 * 내가 받은 중개 요청(최신순).
 *
 * **거리는 지금 다시 계산하지 않고 발송 시점에 굳은 `BrokerageTarget.distanceKm` 를 쓴다** —
 * 사무소를 옮겨도 "그때 이 거리라서 받았다" 가 남아야 하기 때문이다(T5.2 추천함과 같은 규칙).
 */
export async function listRealtorInbox(
  session: RealtorSession,
): Promise<RealtorInboxItemDto[]> {
  const rows = await prisma.brokerageTarget.findMany({
    where: { realtorProfileId: session.profile.id },
    include: targetInclude,
    orderBy: [{ request: { createdAt: "desc" } }, { id: "desc" }],
  });
  return toInboxItems(rows, session.profile.id);
}

/** 요청 1건(상세·응답 뒤 응답 조립용). 소유 판정은 `requireOwnedTarget` 이 이미 했다 */
export async function getRealtorInboxItem(
  session: RealtorSession,
  targetId: string,
): Promise<RealtorInboxItemDto | null> {
  const row = await prisma.brokerageTarget.findUnique({
    where: { id: targetId },
    include: targetInclude,
  });
  if (!row || row.realtorProfileId !== session.profile.id) return null;
  const [item] = await toInboxItems([row], session.profile.id);
  return item ?? null;
}

function toRealtorListing(row: {
  id: string;
  status: string;
  dealType: string;
  deposit: number;
  monthlyRent: number;
  availableFrom: Date | null;
  createdAt: Date;
  updatedAt: Date;
  unit: UnitWithBuilding;
}): RealtorListingDto {
  return {
    id: row.id,
    status: row.status as RealtorListingDto["status"],
    dealType: row.dealType as RealtorListingDto["dealType"],
    deposit: row.deposit,
    monthlyRent: row.monthlyRent,
    availableFrom: row.availableFrom ? row.availableFrom.toISOString().slice(0, 10) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    place: toBrokeragePlace(row.unit),
  };
}

/**
 * `/realtor/listings` — **내가 올린 매물**(최신순) + **수락했지만 아직 안 올린 호실**.
 *
 * 매물 관리 화면 자체는 새로 만들지 않는다 — T3.1 의 `/landlord/units/[id]/listing` 이
 * 이미 "소유 임대인 **또는 수락 중개인**" 을 받도록 열려 있어 그 화면으로 보낸다.
 */
export async function listRealtorListings(session: RealtorSession): Promise<{
  listings: RealtorListingDto[];
  pending: RealtorInboxItemDto[];
}> {
  const [rows, inbox] = await Promise.all([
    prisma.listing.findMany({
      where: { listedByProfileId: session.profile.id },
      include: { unit: { include: { building: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    listRealtorInbox(session),
  ]);

  return {
    listings: rows.map(toRealtorListing),
    pending: inbox.filter((item) => item.status === "ACCEPTED" && item.canCreateListing),
  };
}
