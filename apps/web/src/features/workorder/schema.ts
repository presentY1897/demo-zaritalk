/**
 * 작업 의뢰 요청 스키마 (T5.1·T5.2).
 *
 * `POST·GET /api/work-orders` · `PATCH /api/work-orders/[id]` ·
 * `POST /api/complaints/[id]/convert` · `POST /api/master/plan` 이 공유한다.
 * `@zari/db` 를 import 하지 않는다 — 클라이언트 폼도 같은 스키마로 미리 막는다(T1.1·T2.6 패턴).
 */
import { z } from "zod";
import { MASTER_CATEGORY_ORDER, WORK_ORDER_STATUS_TARGETS } from "./status";

/** 업종 — 스키마 enum `MasterCategory` 와 값이 같다(`status.ts` 의 노출 순서를 그대로 읽는다) */
export const categorySchema = z.enum(MASTER_CATEGORY_ORDER);

const descriptionSchema = z
  .string()
  .trim()
  .min(5, "작업 내용을 5자 이상 적어 주세요.")
  .max(1000, "작업 내용은 1,000자 이하로 적어 주세요.");

/** `YYYY-MM-DD` 희망일. 생략하거나 null 이면 "협의" 다 */
const desiredDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "희망일은 YYYY-MM-DD 형식으로 입력해 주세요.");

/**
 * `POST /api/work-orders` 본문.
 *
 * **건물은 필수, 호실은 선택이다** — 옥상 방수처럼 호실이 없는 공용부 작업이 있고,
 * push 추천의 원점 좌표는 호실이 아니라 **건물**이 가지고 있기 때문이다
 * (`Unit` 에는 좌표가 없다).
 */
export const createWorkOrderSchema = z.object({
  category: categorySchema,
  buildingId: z.string().min(1, "건물을 선택해 주세요."),
  unitId: z.string().min(1).nullish(),
  description: descriptionSchema,
  desiredDate: desiredDateSchema.nullish(),
});
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;

/**
 * `PATCH /api/work-orders/[id]` 본문 — 임대인만. 완료·취소 둘뿐이다.
 * `QUOTED`·`ASSIGNED` 는 견적(T5.3)이 옮기는 값이라 enum 에 없다(보내면 400).
 */
export const updateWorkOrderSchema = z.object({
  status: z.enum(WORK_ORDER_STATUS_TARGETS),
});
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;

/**
 * `POST /api/complaints/[id]/convert` 본문 — 민원 → 작업 의뢰 전환.
 *
 * 대상(건물·호실)은 **민원이 이미 알고 있다**(민원 → 계약 → 호실 → 건물). 그래서
 * 임대인이 고를 것은 업종뿐이고, 작업 내용은 비워 두면 민원 제목·본문을 그대로 옮겨 적는다.
 */
export const convertComplaintSchema = z.object({
  category: categorySchema,
  description: descriptionSchema.optional(),
  desiredDate: desiredDateSchema.nullish(),
});
export type ConvertComplaintInput = z.infer<typeof convertComplaintSchema>;

/** `POST /api/master/plan` 본문 — 데모용 FREE ↔ PRO 토글(결제 없음) */
export const updateMasterPlanSchema = z.object({
  plan: z.enum(["FREE", "PRO"]),
});
export type UpdateMasterPlanInput = z.infer<typeof updateMasterPlanSchema>;

/**
 * `POST /api/work-orders/[id]/quotes` 본문 — 마스터의 견적 제안 (T5.3).
 *
 * 대상 의뢰는 경로가 정하고, 제안자는 세션이 정한다. 마스터가 적을 것은 **금액과 메시지**뿐이다.
 * 금액은 원 단위 정수다(`WorkOrderQuote.amount Int`) — 소수·문자열을 보내면 400.
 */
export const createQuoteSchema = z.object({
  amount: z
    .number("견적 금액을 숫자로 입력해 주세요.")
    .int("견적 금액은 원 단위 정수로 입력해 주세요.")
    .min(1_000, "견적 금액은 1,000원 이상이어야 합니다.")
    // Int 상한(약 21억)보다 훨씬 낮게 잡는다 — 데모에서 다룰 작업 금액의 상식적 상한
    .max(100_000_000, "견적 금액은 1억원 이하로 입력해 주세요."),
  message: z
    .string()
    .trim()
    .max(500, "제안 메시지는 500자 이하로 적어 주세요.")
    .nullish(),
});
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
