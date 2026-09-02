/**
 * 쿼리 → 조회 입력 변환 (T3.2).
 *
 * `GET /api/listings`(400 을 낸다)와 `/search` 페이지(잘못된 값은 조용히 버리고 기본값으로
 * 그린다)가 **같은 변환**을 쓴다. 두 곳이 각자 파싱하면 "주소창에 남은 필터" 와
 * "API 가 실제로 적용한 필터" 가 어긋난다.
 *
 * 순수 함수다 — `@zari/db` 를 import 하지 않는다.
 */
import { parseBounds, type Bounds } from "./bounds";
import {
  DEFAULT_SEARCH_LIMIT,
  EMPTY_FILTERS,
  invalidRangeMessage,
  type SearchFilters,
} from "./filters";
import { listListingsQuerySchema, type ListListingsQuery } from "./schema";

export type SearchRequest = {
  bounds: Bounds | null;
  filters: SearchFilters;
  limit: number;
  workplaceId: string | undefined;
};

export type SearchRequestResult =
  | { data: SearchRequest; error?: undefined }
  | { data?: undefined; error: string };

/** 검증까지 끝난 쿼리를 조회 입력으로. 실패 사유는 사람이 읽는 한 줄이다 */
export function toSearchRequest(query: ListListingsQuery): SearchRequestResult {
  let bounds: Bounds | null = null;
  if (query.bounds !== undefined) {
    bounds = parseBounds(query.bounds);
    if (!bounds) {
      return {
        error:
          "bounds 는 swLat,swLng,neLat,neLng 형식이어야 하고 남서 좌표가 북동 좌표보다 작아야 합니다.",
      };
    }
  }

  const filters: SearchFilters = {
    dealType: query.dealType ?? null,
    depositMin: query.depositMin ?? null,
    depositMax: query.depositMax ?? null,
    rentMin: query.rentMin ?? null,
    rentMax: query.rentMax ?? null,
  };

  const rangeError = invalidRangeMessage(filters);
  if (rangeError) return { error: rangeError };

  return {
    data: {
      bounds,
      filters,
      limit: query.limit ?? DEFAULT_SEARCH_LIMIT,
      workplaceId: query.workplaceId,
    },
  };
}

/**
 * 페이지 `searchParams`(Next 16 — 값이 `string | string[] | undefined`) → 조회 입력.
 * **잘못된 값은 버리고 기본값으로 돌아간다** — 링크를 잘못 받은 사람에게 500·400 을 보여
 * 주는 대신 전체 매물을 보여 주는 편이 낫다. API 는 같은 값에 400 을 낸다(그쪽은 프로그램이 부른다).
 */
export function searchRequestFromParams(
  params: Record<string, string | string[] | undefined>,
): SearchRequest {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string" && first !== "") flat[key] = first;
  }

  const parsed = listListingsQuerySchema.safeParse(flat);
  if (!parsed.success) {
    return { bounds: null, filters: EMPTY_FILTERS, limit: DEFAULT_SEARCH_LIMIT, workplaceId: undefined };
  }

  const result = toSearchRequest(parsed.data);
  return (
    result.data ?? {
      bounds: null,
      filters: EMPTY_FILTERS,
      limit: DEFAULT_SEARCH_LIMIT,
      workplaceId: undefined,
    }
  );
}
