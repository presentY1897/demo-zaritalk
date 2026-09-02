/**
 * 매물 조회·DTO 매핑 (T3.1) — **서버 전용**(`@zari/db` 를 쓴다).
 *
 * T1.1 과 같은 규약이다: 라우트 핸들러와 서버 컴포넌트가 **같은 함수**를 써서
 * 페이지 초기 데이터와 API 응답 모양이 어긋나지 않게 한다(Tanstack Query `initialData`).
 *
 * 호실 상태 판정은 **새로 만들지 않았다** — T1.1 의 `deriveUnitStatus` 를 그대로 쓰고,
 * 연체 판정은 T1.4 원장 엔진(`resolveChargeStatus`)으로 오늘(KST) 기준 재판정한다
 * (`features/landlord/queries.ts` 와 같은 방식이라 자산 그리드와 답이 같다).
 */
import { ChargeStatus, LeaseStatus, prisma, ProfileType } from "@zari/db";
import { deriveUnitStatus } from "@/features/landlord/unit-status";
import type { UnitStatus } from "@/features/landlord/types";
import { kstToday, resolveChargeStatus } from "@/lib/rent";
import type { ListingActor } from "./permissions";
import { isLiveListing } from "./status";
import type { ListedByRole, ListingDto, ListingPageDto, ListingUnitDto } from "./types";

/** 등록자 이름·유형까지 한 번에 읽는다 */
const LISTING_INCLUDE = {
  listedByProfile: { include: { user: { select: { name: true } } } },
} as const;

type ListingRow = {
  id: string;
  unitId: string;
  listedByProfileId: string;
  dealType: "JEONSE" | "WOLSE";
  deposit: number;
  monthlyRent: number;
  description: string | null;
  photos: unknown;
  availableFrom: Date | null;
  status: "OPEN" | "RESERVED" | "CLOSED";
  createdAt: Date;
  updatedAt: Date;
  listedByProfile: { type: ProfileType; user: { name: string } };
};

/** `@db.Date` → `YYYY-MM-DD` (UTC 자정으로 저장돼 있다 — 시드 주석 참고) */
const toDateString = (value: Date): string => value.toISOString().slice(0, 10);

/**
 * `Listing.photos` 는 Json 이라 무엇이든 들어올 수 있다.
 * 문자열 배열만 남긴다 — 화면이 `.map()` 하기 전에 여기서 한 번 정리한다.
 */
export function readPhotos(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

/** 중개인 프로필이 올렸으면 REALTOR, 그 밖에는 LANDLORD */
function toListedByRole(type: ProfileType): ListedByRole {
  return type === ProfileType.REALTOR ? "REALTOR" : "LANDLORD";
}

export function toListingDto(row: ListingRow): ListingDto {
  return {
    id: row.id,
    unitId: row.unitId,
    dealType: row.dealType,
    deposit: row.deposit,
    monthlyRent: row.monthlyRent,
    description: row.description,
    photos: readPhotos(row.photos),
    availableFrom: row.availableFrom ? toDateString(row.availableFrom) : null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    listedBy: {
      profileId: row.listedByProfileId,
      role: toListedByRole(row.listedByProfile.type),
      name: row.listedByProfile.user.name,
    },
  };
}

/** 매물 1건 (권한 판정 뒤 응답 조립용) */
export async function getListing(listingId: string): Promise<ListingDto | null> {
  const row = await prisma.listing.findUnique({
    where: { id: listingId },
    include: LISTING_INCLUDE,
  });
  return row ? toListingDto(row) : null;
}

/**
 * 호실 상태 — T1.1 판정을 그대로 쓴다.
 * 계약중/대기 호실에는 매물을 올릴 수 없다(409). 판정 기준을 여기 한 곳에 둔다.
 */
export async function getUnitStatus(unitId: string): Promise<UnitStatus> {
  const leases = await prisma.lease.findMany({
    where: {
      unitId,
      status: { in: [LeaseStatus.ACTIVE, LeaseStatus.PENDING_TENANT] },
    },
    select: {
      status: true,
      charges: {
        where: { NOT: { status: ChargeStatus.PAID } },
        select: { dueDate: true, totalDue: true, paidAmount: true },
      },
    },
  });

  const active = leases.find((lease) => lease.status === LeaseStatus.ACTIVE);
  const asOf = kstToday();
  return deriveUnitStatus({
    hasActiveLease: Boolean(active),
    hasPendingLease: leases.some((lease) => lease.status === LeaseStatus.PENDING_TENANT),
    hasOverdueCharge: (active?.charges ?? []).some(
      (charge) => resolveChargeStatus({ ...charge, asOf }) === ChargeStatus.OVERDUE,
    ),
  });
}

/** 공실이 아니면 계약(진행 중·대기)이 걸려 있다는 뜻 */
export function isOccupied(status: UnitStatus): boolean {
  return status !== "VACANT";
}

/** 아직 살아 있는 매물(OPEN·RESERVED). 호실당 1건만 허용한다 */
export async function findLiveListing(unitId: string): Promise<ListingDto | null> {
  const rows = await prisma.listing.findMany({
    where: { unitId },
    orderBy: { createdAt: "desc" },
    include: LISTING_INCLUDE,
  });
  const live = rows.find((row) => isLiveListing(row.status));
  return live ? toListingDto(live) : null;
}

/** 매물을 새로 올릴 수 없는 이유(화면 문구). 올릴 수 있으면 null */
export function listingBlockedReason(
  unitStatus: UnitStatus,
  liveListing: ListingDto | null,
): string | null {
  if (isOccupied(unitStatus)) {
    return "계약이 있는 호실에는 매물을 등록할 수 없습니다. 계약을 먼저 정리해 주세요.";
  }
  if (liveListing) {
    return "이미 등록된 매물이 있습니다. 기존 매물을 수정하거나 종료해 주세요.";
  }
  return null;
}

/**
 * `/landlord/units/[id]/listing` 화면 전체 데이터.
 * 권한 판정(`requireListingActorForUnit`)을 통과한 actor 를 그대로 받는다.
 */
export async function getListingPage(actor: ListingActor): Promise<ListingPageDto> {
  const [status, rows] = await Promise.all([
    getUnitStatus(actor.unit.id),
    prisma.listing.findMany({
      where: { unitId: actor.unit.id },
      orderBy: { createdAt: "desc" },
      include: LISTING_INCLUDE,
    }),
  ]);

  const listings = rows.map(toListingDto);
  const live = listings.find((listing) => isLiveListing(listing.status)) ?? null;
  const blockedReason = listingBlockedReason(status, live);

  const unit: ListingUnitDto = {
    id: actor.unit.id,
    label: actor.unit.label,
    floor: actor.unit.floor,
    areaM2: actor.unit.areaM2,
    rooms: actor.unit.rooms,
    status,
    building: {
      id: actor.unit.building.id,
      name: actor.unit.building.name,
      address: actor.unit.building.address,
      roadAddress: actor.unit.building.roadAddress,
      lat: actor.unit.building.lat,
      lng: actor.unit.building.lng,
    },
  };

  return {
    unit,
    listing: live ?? listings[0] ?? null,
    pastListings: listings.filter((listing) => listing.id !== (live ?? listings[0])?.id),
    canCreate: blockedReason === null,
    blockedReason,
    role: actor.role,
  };
}
