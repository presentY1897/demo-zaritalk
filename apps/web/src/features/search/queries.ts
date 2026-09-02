/**
 * 매물 탐색 조회 (T3.2) — **서버 전용**(`@zari/db` 를 쓴다).
 *
 * 라우트 핸들러(`GET /api/listings`)와 서버 컴포넌트(`/search`)가 **같은 함수**를 쓴다
 * (T1.1 부터 이어 온 규약 — 페이지 첫 데이터와 API 응답이 어긋나지 않아야 Tanstack Query
 * `initialData` 가 성립한다).
 *
 * ## 노출 규칙
 *
 * - **`status = OPEN` 만.** 예약(`RESERVED`)·종료(`CLOSED`)는 탐색에 뜨지 않는다
 *   (T3.1 `LISTING_STATUS_META.OPEN.description` 이 이미 "매물 탐색에 노출됩니다" 라고 적어 뒀다).
 * - 좌표는 **매물이 아니라 건물**의 것이다(`Listing.unit.building.lat/lng`) — 매물에는 좌표가 없다.
 * - 정렬은 최신순(`createdAt desc, id desc`). 마지막 키를 `id` 로 둔 것은 같은 밀리초에 들어온
 *   두 매물의 순서가 요청마다 뒤집히지 않게 하기 위해서다(T4.1 커서 규약과 같은 이유).
 *
 * ## 페이지네이션 대신 `limit` + `truncated`
 *
 * 커서 페이지네이션을 두지 않았다. 지도 탐색에서 "다음 페이지" 는 뜻이 약하다 —
 * 사용자가 하는 행동은 **지도를 좁히는 것**이지 더 읽는 것이 아니다. 그래서 상한까지만 주고
 * 잘렸다는 사실(`truncated`)을 응답에 담아 화면이 "지도를 확대해 주세요" 로 안내한다.
 * (T4.1 커뮤니티는 반대로 무한 스크롤이 자연스러워 커서를 뒀다.)
 */
import { ListingStatus, prisma, type Prisma } from "@zari/db";
import { readCommuteCache, type CommuteWorkplace } from "@/features/listing/commute";
import { pinLabel, priceLabel } from "@/features/listing/price";
import { readPhotos } from "@/features/listing/queries";
import type { ListingCommuteDto } from "@/features/listing/types";
import type { Bounds } from "./bounds";
import { DEFAULT_SEARCH_LIMIT, type SearchFilters } from "./filters";
import type { ListingSearchResult, ListingSummaryDto } from "./types";

/** 매물 카드 한 장을 그리는 데 필요한 만큼만 조인한다 */
const SEARCH_INCLUDE = {
  unit: { include: { building: true } },
} as const;

type SearchRow = Prisma.ListingGetPayload<{ include: typeof SEARCH_INCLUDE }>;

const toDateString = (value: Date): string => value.toISOString().slice(0, 10);

function toSummary(row: SearchRow, commute: ListingCommuteDto | null): ListingSummaryDto {
  const photos = readPhotos(row.photos);
  const price = {
    dealType: row.dealType,
    deposit: row.deposit,
    monthlyRent: row.monthlyRent,
  };

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
    photo: photos[0] ?? null,
    photoCount: photos.length,
    availableFrom: row.availableFrom ? toDateString(row.availableFrom) : null,
    createdAt: row.createdAt.toISOString(),
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

export type SearchListingsInput = {
  bounds: Bounds | null;
  filters: SearchFilters;
  limit?: number;
  /** 이미 소유가 확인된 근무지(`features/listing/commute.ts` 의 `resolveCommuteWorkplace` 결과) */
  commuteWorkplace?: CommuteWorkplace | null;
};

/** 영역 + 필터로 공개(OPEN) 매물을 찾는다 */
export async function searchListings(input: SearchListingsInput): Promise<ListingSearchResult> {
  const limit = input.limit ?? DEFAULT_SEARCH_LIMIT;
  const { bounds, filters } = input;
  const workplace = input.commuteWorkplace ?? null;

  const deposit: Prisma.IntFilter = {};
  if (filters.depositMin !== null) deposit.gte = filters.depositMin;
  if (filters.depositMax !== null) deposit.lte = filters.depositMax;

  const monthlyRent: Prisma.IntFilter = {};
  if (filters.rentMin !== null) monthlyRent.gte = filters.rentMin;
  if (filters.rentMax !== null) monthlyRent.lte = filters.rentMax;

  const where: Prisma.ListingWhereInput = {
    status: ListingStatus.OPEN,
    ...(filters.dealType ? { dealType: filters.dealType } : {}),
    ...(Object.keys(deposit).length > 0 ? { deposit } : {}),
    ...(Object.keys(monthlyRent).length > 0 ? { monthlyRent } : {}),
    ...(bounds
      ? {
          unit: {
            building: {
              // 경계 포함(gte/lte) — 화면 쪽 `withinBounds` 와 같은 규칙이어야
              // "지도에 보이는데 목록에 없다" 가 생기지 않는다
              lat: { gte: bounds.swLat, lte: bounds.neLat },
              lng: { gte: bounds.swLng, lte: bounds.neLng },
            },
          },
        }
      : {}),
  };

  // limit + 1 을 읽어 "더 있는가"(truncated)를 한 번의 조회로 안다
  const rows = await prisma.listing.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: SEARCH_INCLUDE,
  });

  const truncated = rows.length > limit;
  const page = truncated ? rows.slice(0, limit) : rows;
  const commutes = await readCommuteCache(
    page.map((row) => row.unitId),
    workplace,
  );

  const listings = page.map((row) => toSummary(row, commutes.get(row.unitId) ?? null));

  return {
    listings,
    count: listings.length,
    truncated,
    limit,
    bounds,
    filters,
    commuteWorkplaceId: workplace?.id ?? null,
  };
}
