/**
 * 실거래가 요청 스키마 (T4.3·T4.4).
 *
 * 라우트 핸들러와 화면이 **같은 스키마**를 본다. `@zari/db` 를 import 하지 않는다(T1.1 패턴).
 *
 * ## 시군구 코드는 **T4.1 상수표를 그대로 재사용**한다
 *
 * `LAWD_CD` 는 행정안전부 법정동코드의 앞 5자리 = 커뮤니티 `Post.regionCode` 와 **같은 코드**다.
 * 목록을 새로 만들면 두 화면의 선택지가 갈라지므로 `features/community/regions.ts` 를 읽어 쓴다
 * (그 파일은 이 task 소유가 아니라 **고치지 않는다** — 지역을 늘리려면 T4.1 이 그 배열에 줄을 더한다).
 * 표에 없는 코드는 400 이다. 국토부 API 는 엉뚱한 `LAWD_CD` 에도 200 + 빈 목록을 주므로
 * (실호출 확인) **우리가 막지 않으면 아무 코드나 통과**한다.
 */
import { z } from "zod";
import { COMMUNITY_REGIONS } from "@/features/community/regions";
import { MAX_DEAL_PAGE_SIZE } from "./cursor";
import { DEAL_YM_PATTERN } from "./period";
import { REAL_DEAL_TYPES } from "./types";

const REGION_CODES = COMMUNITY_REGIONS.map((region) => region.code) as [string, ...string[]];

/** 시군구 코드(=`LAWD_CD`) — T4.1 상수표에 있는 값만 받는다 */
export const lawdCdSchema = z.enum(REGION_CODES, { message: "지원하지 않는 지역입니다." });

export const dealTypeSchema = z.enum(REAL_DEAL_TYPES as unknown as [string, ...string[]], {
  message: "거래 유형은 SALE·JEONSE·WOLSE 중 하나여야 합니다.",
});

/** `DEAL_YMD` — `YYYYMM`. 달이 1~12 이고 2006년 이후여야 한다(국토부 데이터 시작) */
export const dealYmSchema = z
  .string()
  .regex(DEAL_YM_PATTERN, "수집 월은 YYYYMM 여섯 자리여야 합니다.")
  .refine((value) => {
    const month = Number(value.slice(4, 6));
    const year = Number(value.slice(0, 4));
    return month >= 1 && month <= 12 && year >= 2006 && year <= 2100;
  }, "수집 월이 올바르지 않습니다.");

/** 단지명 — 검색어·구독 대상. 공백만 보내면 "없음" 취급이라 trim 뒤 길이를 본다 */
const aptNameSchema = z
  .string()
  .trim()
  .min(1, "단지명을 입력해 주세요.")
  .max(60, "단지명은 60자 이하로 입력해 주세요.");

/** `GET /api/deals` 쿼리 */
export const listDealsQuerySchema = z.object({
  lawdCd: lawdCdSchema.optional(),
  type: dealTypeSchema.optional(),
  /** 단지 검색어 — 부분일치로 목록을 좁힌다 */
  q: z.string().trim().max(60).optional(),
  /** 정확한 단지명 — 추이 차트 대상. 목록도 이 단지로 좁힌다 */
  apt: aptNameSchema.optional(),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_DEAL_PAGE_SIZE).optional(),
});
export type ListDealsQuery = z.infer<typeof listDealsQuerySchema>;

/**
 * `POST /api/deals/sync` 본문 — **전부 선택**이다.
 * - `lawdCd` 생략 → 크론 대상(구독 지역 + 이미 수집분이 있는 지역)
 * - `months` 생략 → 당월 + 전월
 */
export const syncDealsSchema = z.object({
  lawdCd: lawdCdSchema.optional(),
  months: z.array(dealYmSchema).min(1).max(12).optional(),
  dealTypes: z.array(dealTypeSchema).min(1).max(3).optional(),
});
export type SyncDealsInput = z.infer<typeof syncDealsSchema>;

/** `POST /api/transaction-alerts` 본문 — 지역만 필수, 나머지는 비우면 "전부" */
export const createAlertSchema = z.object({
  lawdCd: lawdCdSchema,
  aptName: aptNameSchema.nullish(),
  dealType: dealTypeSchema.nullish(),
});
export type CreateAlertInput = z.infer<typeof createAlertSchema>;

/** `DELETE /api/transaction-alerts?id=` 쿼리 */
export const deleteAlertQuerySchema = z.object({
  id: z.string().min(1, "삭제할 구독을 찾을 수 없습니다.").max(64),
});
export type DeleteAlertQuery = z.infer<typeof deleteAlertQuerySchema>;
