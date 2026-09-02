/**
 * `GET /api/listings` 쿼리 스키마 (T3.2).
 *
 * 값은 전부 **문자열**로 온다(`parseQuery` 가 `URLSearchParams` 를 그대로 객체로 만든다).
 * 그래서 숫자는 정규식으로 모양을 먼저 보고 숫자로 바꾼다 — `z.coerce.number()` 만 쓰면
 * `?depositMax=` (빈 값)이 **0** 으로 읽혀 "보증금 0원 이하" 라는 조용한 오답이 된다.
 * 빈 값·공백·소수점·문자는 전부 400 이다. **필터를 끄고 싶으면 파라미터를 빼야 한다.**
 *
 * `@zari/db` 를 import 하지 않는다 — 화면(`features/search/api.ts`)도 같은 상수를 쓴다.
 */
import { z } from "zod";
import { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT, SEARCH_AMOUNT_MAX } from "./filters";

const AMOUNT_MESSAGE = "금액은 원 단위 정수로 보내 주세요.";

/** 원 단위 정수 문자열 → number. 앞자리 0 도 허용한다(`0` 자체가 유효한 하한이다). */
const amountQuery = z
  .string()
  .regex(/^\d{1,13}$/, AMOUNT_MESSAGE)
  .transform(Number)
  .refine((value) => value <= SEARCH_AMOUNT_MAX, "금액이 너무 큽니다.");

const limitQuery = z
  .string()
  .regex(/^\d{1,3}$/, "limit 은 정수로 보내 주세요.")
  .transform(Number)
  .refine(
    (value) => value >= 1 && value <= MAX_SEARCH_LIMIT,
    `limit 은 1~${MAX_SEARCH_LIMIT} 사이여야 합니다.`,
  );

export const listListingsQuerySchema = z.object({
  /** `swLat,swLng,neLat,neLng`. 없으면 영역 제한 없이 최신순으로 준다(첫 진입) */
  bounds: z.string().min(1, "bounds 값이 비어 있습니다.").max(80).optional(),
  dealType: z.enum(["JEONSE", "WOLSE"]).optional(),
  depositMin: amountQuery.optional(),
  depositMax: amountQuery.optional(),
  rentMin: amountQuery.optional(),
  rentMax: amountQuery.optional(),
  limit: limitQuery.optional(),
  /**
   * 통근 배지 기준 근무지(T3.5 자리). 로그인 세입자의 **자기 근무지**일 때만 반영되고,
   * 아니면 **조용히 무시**한다 — 공개 API 라 "그 근무지가 있는지" 를 알려 주지 않는다.
   * 반영 여부는 응답의 `commuteWorkplaceId` 로 확인한다.
   */
  workplaceId: z.string().min(1).max(64).optional(),
});
export type ListListingsQuery = z.infer<typeof listListingsQuerySchema>;

/** `GET /api/listings/[id]` 쿼리 — 통근 배지 근무지만 받는다 */
export const listingDetailQuerySchema = z.object({
  workplaceId: z.string().min(1).max(64).optional(),
});

export { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT };
