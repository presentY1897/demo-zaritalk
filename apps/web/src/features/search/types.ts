/**
 * 매물 탐색 DTO (T3.2).
 *
 * **`@zari/db` 를 import 하지 않는다** — 지도·리스트가 클라이언트 컴포넌트다
 * (T1.1 `features/landlord/types.ts` 미러 패턴).
 */
import type { DealTypeValue, ListingStatusValue } from "@/features/landlord/types";
import type {
  ListingCommuteDto,
  PublicBuildingDto,
  PublicUnitDto,
} from "@/features/listing/types";
import type { Bounds } from "./bounds";
import type { SearchFilters } from "./filters";

/**
 * 지도 핀 + 리스트 카드 1건.
 *
 * **핀과 카드가 같은 객체를 본다** — 지도에서 고른 핀이 리스트의 어느 카드인지 id 로 바로 잇고,
 * 금액 문자열(`priceLabel`·`pinLabel`)도 서버가 한 번 만들어 둘이 어긋나지 않게 한다.
 */
export type ListingSummaryDto = {
  id: string;
  unitId: string;
  dealType: DealTypeValue;
  deposit: number;
  monthlyRent: number;
  /** 목록에는 `OPEN` 만 담긴다 — 그래도 화면이 상태를 그대로 읽게 실어 보낸다 */
  status: ListingStatusValue;
  priceLabel: string;
  pinLabel: string;
  /** 카드 미리보기 2줄 */
  description: string | null;
  /** 대표 사진(첫 장). 없으면 null */
  photo: string | null;
  photoCount: number;
  availableFrom: string | null;
  createdAt: string;
  unit: PublicUnitDto;
  building: PublicBuildingDto;
  /** T3.5 통근 배지 자리 — 캐시 히트분만 */
  commute: ListingCommuteDto | null;
};

/** `GET /api/listings` 응답 */
export type ListingSearchResult = {
  listings: ListingSummaryDto[];
  /** `listings.length` 와 같다 — 화면이 길이를 다시 세지 않게 */
  count: number;
  /** `limit` 에 걸려 잘렸는가. true 면 화면이 "지도를 확대해 주세요" 를 띄운다 */
  truncated: boolean;
  limit: number;
  /** 요청에 실렸던 영역(정규화된 값). 없었으면 null */
  bounds: Bounds | null;
  /** 서버가 실제로 적용한 필터 */
  filters: SearchFilters;
  /** 통근 배지가 실제로 적용된 근무지 id. 무시됐으면 null */
  commuteWorkplaceId: string | null;
};
