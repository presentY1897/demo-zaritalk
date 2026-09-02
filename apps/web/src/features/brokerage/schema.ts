/**
 * 중개 요청·응답 요청 스키마 (T3.6·T3.7).
 *
 * `POST·GET /api/brokerage-requests` · `GET /api/brokerage-requests/preview` ·
 * `POST /api/brokerage-targets/[id]/respond` 가 공유한다.
 * `@zari/db` 를 import 하지 않는다 — 클라이언트 폼도 같은 스키마로 미리 막는다(T1.1·T5.1 패턴).
 */
import { z } from "zod";
import { BROKERAGE_RESPOND_TARGETS } from "./status";

/**
 * 중개인에게 함께 보내는 메시지 — **선택**이다(`BrokerageRequest.message String?`).
 * 빈 문자열은 "안 적었다"와 같으므로 null 로 접는다.
 */
const messageSchema = z
  .string()
  .trim()
  .max(500, "요청 메시지는 500자 이하로 적어 주세요.")
  .nullish()
  .transform((value) => (value ? value : null));

/** `POST /api/brokerage-requests` 본문 — 대상은 **공실 호실 하나**다 */
export const createBrokerageRequestSchema = z.object({
  unitId: z.string().min(1, "호실을 선택해 주세요."),
  message: messageSchema,
});
export type CreateBrokerageRequestInput = z.infer<typeof createBrokerageRequestSchema>;

/** `GET /api/brokerage-requests/preview?unitId=` 쿼리 */
export const brokeragePreviewQuerySchema = z.object({
  unitId: z.string().min(1, "호실을 선택해 주세요."),
});
export type BrokeragePreviewQuery = z.infer<typeof brokeragePreviewQuerySchema>;

/**
 * `POST /api/brokerage-targets/[id]/respond` 본문.
 *
 * `VIEWED` 까지 받는 이유는 열람 표시가 **같은 전이표**를 지나야 하기 때문이다 —
 * 상태를 옮기는 길이 둘이면 규칙이 둘로 갈라진다(`features/brokerage/status.ts` 참고).
 */
export const respondBrokerageTargetSchema = z.object({
  status: z.enum(BROKERAGE_RESPOND_TARGETS),
});
export type RespondBrokerageTargetInput = z.infer<typeof respondBrokerageTargetSchema>;
