/**
 * 고지서 API 요청 스키마 (T1.7) — zod 4 ([D1](../../../../../docs/DECISIONS.md#-d1-api-스타일)).
 */
import { z } from "zod";
import { NOTICE_KINDS } from "./constants";

export const sendNoticeSchema = z
  .object({
    kind: z.enum(NOTICE_KINDS),
    /** 월세·연체 고지서의 대상 청구. 만기 안내에는 쓰지 않는다 */
    chargeId: z.string().min(1).optional(),
    /** 임대인이 덧붙이는 한마디 */
    memo: z.string().trim().max(200, "메시지는 200자까지 쓸 수 있습니다.").optional(),
  })
  .strict();

export type SendNoticeInput = z.infer<typeof sendNoticeSchema>;

export const messagesQuerySchema = z
  .object({
    /** 특정 계약의 발송 이력만 (T1.2 계약 상세에서 쓸 수 있게) */
    leaseId: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

export type MessagesQuery = z.infer<typeof messagesQuerySchema>;
