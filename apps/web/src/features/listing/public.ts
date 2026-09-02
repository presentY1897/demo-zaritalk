/**
 * 매물 공개 상세 조회 (T3.3) — **서버 전용**(`@zari/db` 를 쓴다).
 *
 * `/listings/[id]` 페이지와 `GET /api/listings/[id]` 가 **같은 함수**를 쓴다(T1.1 부터의 규약).
 *
 * ## 비로그인 공개다 — 그래서 담지 않는 것
 *
 * | 담는다 | 담지 않는다 | 이유 |
 * |---|---|---|
 * | 건물 이름·주소·좌표, 호실 라벨·층·면적·방 수 | — | 매물을 고르는 데 필요한 정보다 |
 * | 등록자 **역할**(임대인/중개인) | 등록자 **이름**·연락처 | 이 페이지는 색인 대상이다(문서 robots 절). 개인 이름이 검색에 남으면 안 된다 |
 * | 상태(`OPEN`·`RESERVED`·`CLOSED`) | 계약·세입자·청구 어느 것도 | 매물과 무관하다 |
 *
 * T3.1 의 `ListingDto` 를 그대로 쓰지 않고 `PublicListingDto` 를 따로 둔 이유가 이것이다 —
 * `ListingDto.listedBy.name` 은 **임대인 관리 화면용**이다.
 *
 * ## 상태별 노출
 *
 * `CLOSED`·`RESERVED` 매물도 **404 로 감추지 않는다.** 링크(카카오톡 공유·북마크)가 이미
 * 돌아다니는데 갑자기 404 가 되면 "잘못 눌렀나" 가 되고, 검색엔진에는 소프트 404 가 쌓인다.
 * 대신 화면이 "예약된/종료된 매물입니다" 배너를 띄우고 **메타는 `noindex`** 로 내려간다
 * (`app/(app)/listings/[id]/page.tsx` 의 `generateMetadata`).
 */
import { prisma, type Prisma, ProfileType } from "@zari/db";
import { readCommuteForUnit, type CommuteWorkplace } from "./commute";
import { pinLabel, priceLabel } from "./price";
import { readPhotos } from "./queries";
import type { ListedByRole, PublicListingDto } from "./types";

const PUBLIC_INCLUDE = {
  unit: { include: { building: true } },
  listedByProfile: { select: { type: true } },
} as const;

type PublicRow = Prisma.ListingGetPayload<{ include: typeof PUBLIC_INCLUDE }>;

const toDateString = (value: Date): string => value.toISOString().slice(0, 10);

function toRole(type: ProfileType): ListedByRole {
  return type === ProfileType.REALTOR ? "REALTOR" : "LANDLORD";
}

export function toPublicListingDto(
  row: PublicRow,
  commute: PublicListingDto["commute"],
): PublicListingDto {
  const price = { dealType: row.dealType, deposit: row.deposit, monthlyRent: row.monthlyRent };

  return {
    id: row.id,
    unitId: row.unitId,
    dealType: row.dealType,
    deposit: row.deposit,
    monthlyRent: row.monthlyRent,
    status: row.status,
    priceLabel: priceLabel(price),
    pinLabel: pinLabel(price),
    description: row.description,
    photos: readPhotos(row.photos),
    availableFrom: row.availableFrom ? toDateString(row.availableFrom) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    listedBy: { role: toRole(row.listedByProfile.type) },
    unit: {
      id: row.unit.id,
      label: row.unit.label,
      floor: row.unit.floor,
      areaM2: row.unit.areaM2,
      rooms: row.unit.rooms,
    },
    building: {
      id: row.unit.building.id,
      name: row.unit.building.name,
      address: row.unit.building.address,
      roadAddress: row.unit.building.roadAddress,
      lat: row.unit.building.lat,
      lng: row.unit.building.lng,
    },
    commute,
  };
}

/** 공개 상세 1건. 없는 id 면 null(라우트 404 · 페이지 `notFound()`) */
export async function getPublicListing(
  listingId: string,
  options: { commuteWorkplace?: CommuteWorkplace | null } = {},
): Promise<PublicListingDto | null> {
  const row = await prisma.listing.findUnique({
    where: { id: listingId },
    include: PUBLIC_INCLUDE,
  });
  if (!row) return null;

  const commute = await readCommuteForUnit(row.unitId, options.commuteWorkplace ?? null);
  return toPublicListingDto(row, commute);
}

/** 화면에 보이는 주소 한 줄 — 도로명이 있으면 도로명(T3.1 `displayAddress` 와 같은 규칙) */
export function listingAddress(listing: PublicListingDto): string {
  return listing.building.roadAddress ?? listing.building.address;
}
