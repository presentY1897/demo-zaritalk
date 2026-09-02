/**
 * 주소 검색 프록시 요청 스키마 (T3.1·T3.4).
 * `@zari/db` 를 import 하지 않는다 — 클라이언트 fetch 래퍼도 같은 상한을 쓴다.
 */
import { z } from "zod";
import { latQuerySchema, lngQuerySchema } from "./coords";

/** 후보 개수 상한 — 카카오 키워드 검색의 size 상한(15)에 맞춘다 */
export const ADDRESS_SEARCH_SIZE_DEFAULT = 8;
export const ADDRESS_SEARCH_SIZE_MAX = 15;

/** `GET /api/address/search` 쿼리 */
export const addressSearchQuerySchema = z.object({
  query: z
    .string()
    .trim()
    .min(2, "검색어를 2자 이상 입력해 주세요.")
    .max(50, "검색어는 50자 이하로 입력해 주세요."),
  size: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADDRESS_SEARCH_SIZE_MAX)
    .optional()
    .default(ADDRESS_SEARCH_SIZE_DEFAULT),
});
export type AddressSearchQuery = z.infer<typeof addressSearchQuerySchema>;

/** `GET /api/address/reverse` 쿼리 — 좌표 범위 검증은 `coords.ts` 가 한다 */
export const reverseAddressQuerySchema = z.object({
  lat: latQuerySchema,
  lng: lngQuerySchema,
});
export type ReverseAddressQuery = z.infer<typeof reverseAddressQuerySchema>;
