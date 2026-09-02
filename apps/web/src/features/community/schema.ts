/**
 * 커뮤니티·신고 요청 스키마 (T4.1·T4.2).
 *
 * 라우트 핸들러와 클라이언트 폼이 **같은 스키마**를 본다 — 화면에서 미리 막고 서버가 다시 막는다.
 * `@zari/db` 를 import 하지 않는다(T1.1 패턴).
 */
import { z } from "zod";
import { MAX_PAGE_SIZE, POST_SORTS } from "./cursor";
import { COMMUNITY_REGIONS } from "./regions";

const REGION_CODES = COMMUNITY_REGIONS.map((region) => region.code) as [string, ...string[]];

/** 시군구 코드 — 상수표에 있는 값만 받는다(표에 없으면 400) */
export const regionCodeSchema = z.enum(REGION_CODES, {
  message: "지원하지 않는 지역입니다.",
});

const titleSchema = z
  .string()
  .trim()
  .min(2, "제목을 2자 이상 입력해 주세요.")
  .max(60, "제목은 60자 이하로 입력해 주세요.");

const bodySchema = z
  .string()
  .trim()
  .min(5, "내용을 5자 이상 입력해 주세요.")
  .max(2000, "내용은 2,000자 이하로 입력해 주세요.");

/** `GET /api/posts` 쿼리 — 지역·정렬·커서·페이지 크기 */
export const listPostsQuerySchema = z.object({
  region: regionCodeSchema.optional(),
  sort: z.enum(POST_SORTS).optional(),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;

/** `POST /api/posts` 본문 */
export const createPostSchema = z.object({
  regionCode: regionCodeSchema,
  title: titleSchema,
  body: bodySchema,
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

/** `PATCH /api/posts/[id]` 본문 — 보낸 필드만 바꾼다 */
export const updatePostSchema = z
  .object({
    regionCode: regionCodeSchema.optional(),
    title: titleSchema.optional(),
    body: bodySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "바꿀 내용을 보내 주세요." });
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

/** `POST /api/posts/[id]/comments` 본문 */
export const createCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "댓글을 입력해 주세요.")
    .max(500, "댓글은 500자 이하로 입력해 주세요."),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

/**
 * `POST /api/reports` 본문 — **사유는 필수다.**
 * 선택지(`REPORT_REASONS`)를 고르든 직접 쓰든 서버는 문자열 한 줄로만 본다.
 * 공백만 보내면 `trim` 뒤 길이가 0이라 400 이다.
 */
export const createReportSchema = z.object({
  targetType: z.enum(["POST", "COMMENT"]),
  targetId: z.string().min(1, "신고 대상을 찾을 수 없습니다."),
  reason: z
    .string()
    .trim()
    .min(2, "신고 사유를 입력해 주세요.")
    .max(500, "신고 사유는 500자 이하로 입력해 주세요."),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

/** `GET /api/reports` 쿼리(어드민) — 콤마로 이은 상태 목록. 생략하면 대기(OPEN) */
export const reportQueueQuerySchema = z.object({
  status: z.string().min(1).max(100).optional(),
});
export type ReportQueueQuery = z.infer<typeof reportQueueQuerySchema>;

/**
 * `POST /api/reports/[id]/action` 본문 — **액션 이름만** 보낸다.
 * 무엇이 바뀌는지(대상 블라인드·형제 신고 종결)는 서버가 정한다(T2.5 심사 API 와 같은 방식).
 */
export const reportActionSchema = z.object({
  action: z.enum(["BLIND", "DISMISS"]),
});
export type ReportActionInput = z.infer<typeof reportActionSchema>;
