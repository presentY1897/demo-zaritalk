/**
 * 환급 계산 요청 스키마 (T2.3) — `POST /api/refund/calculate` 본문.
 *
 * `@zari/db` 를 import 하지 않는다. **클라이언트 폼과 API 가 같은 스키마로 막는다**
 * (계약 폼 T1.2 와 같은 방식) — 화면에서 걸린 값이 서버에서 통과하거나 그 반대가 되면 안 된다.
 *
 * 여기서 막는 것은 **형식과 부호**뿐이다. "오늘"이 필요한 판정(미래 시작일)은
 * 시계를 알아야 하므로 라우트가 `asOf` 를 주입해서 처리한다(`calc.ts` 의 `isFutureStart`).
 * [T2.4](../../../../../docs/tasks/t2.4-refund-apply.md) 는 이 스키마를 신청서 본문에 그대로 얹으면 된다.
 */
import { z } from "zod";

/** 금액(원) — 0원·음수는 거부한다. 상한은 다른 금액 필드(T1.2)와 같은 20억. */
const grossSalarySchema = z
  .number()
  .int("총급여는 원 단위 정수로 입력해 주세요.")
  .positive("총급여는 1원 이상이어야 합니다.")
  .max(2_000_000_000, "총급여가 너무 큽니다.");

const monthlyRentSchema = z
  .number()
  .int("월세는 원 단위 정수로 입력해 주세요.")
  .positive("월세는 1원 이상이어야 합니다.")
  .max(2_000_000_000, "월세가 너무 큽니다.");

/** `YYYY-MM-DD` — UTC 자정 Date 변환·존재하는 날짜인지는 `parseDateOnly` 가 본다 */
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식으로 입력해 주세요.");

/** 계산 입력 4개 — 신청서(T2.4)가 여기에 `leaseId` 만 얹어 쓴다 */
export const refundCalcObject = z.object({
  /** 연 총급여(원) */
  grossSalary: grossSalarySchema,
  /** 월세(원/월) */
  monthlyRent: monthlyRentSchema,
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
});

/** `YYYY-MM-DD` 는 사전순 비교가 곧 날짜 비교다(T1.2 계약 스키마와 같은 방식) */
const periodOrder = {
  check: (value: { startDate: string; endDate: string }) => value.startDate <= value.endDate,
  message: "임차 종료일은 시작일보다 빠를 수 없습니다.",
  path: ["endDate"] as const,
};

export const refundCalcSchema = refundCalcObject.refine(periodOrder.check, {
  message: periodOrder.message,
  path: [...periodOrder.path],
});

export type RefundCalcRequest = z.infer<typeof refundCalcSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// T2.4 환급 신청 — 신청서·업로드·심사 요청 스키마
//
// 신청 본문은 위 `refundCalcSchema` 를 **그대로 얹는다**(T2.3 이 예고한 접합점).
// 화면 금액과 신청 금액이 갈라지지 않도록, 서버는 이 입력을 `calculateRefund` 에 넣어
// `annualIncome`·`startYear`·`endYear`·`expectedAmount` 를 **다시 계산해서** 저장한다.
// ─────────────────────────────────────────────────────────────────────────────

/** cuid 한 개 — 라우트 파라미터·본문의 id 형식 방어 */
const idSchema = z.string().min(1, "id 가 필요합니다.").max(64);

/**
 * 신청서 본문 — 계산 입력 + (선택) 내 계약 연결.
 * **계산기와 같은 필드·같은 검증**을 쓴다(기간 역전 refine 포함).
 */
export const createRefundApplicationSchema = refundCalcObject
  .extend({
    /** 자동 채움에 쓴 내 계약. 수동 입력이면 없다 */
    leaseId: idSchema.nullish(),
  })
  .refine(periodOrder.check, { message: periodOrder.message, path: [...periodOrder.path] });

export type CreateRefundApplicationInput = z.infer<typeof createRefundApplicationSchema>;

/**
 * 수정 — 생성과 같은 필드다(부분 수정을 받지 않는다).
 *
 * 금액은 네 값이 **한 벌로** 맞물려 계산되므로, 월세만 바꾸고 기간을 그대로 두는 식의
 * 부분 수정을 허용하면 서버가 절반짜리 입력으로 재계산하게 된다. 화면도 폼 전체를 들고 있다.
 */
export const updateRefundApplicationSchema = createRefundApplicationSchema;
export type UpdateRefundApplicationInput = z.infer<typeof updateRefundApplicationSchema>;

/** 목록 쿼리 — `scope=mine`(기본) 은 내 신청, `scope=review` 는 어드민 심사 큐 */
export const refundListQuerySchema = z.object({
  scope: z.enum(["mine", "review"]).optional(),
  /** 심사 큐 상태 필터. 쉼표로 여러 개 — 없으면 "손이 필요한" 상태들(SUBMITTED·REVIEWING·NEED_MORE_DOCS) */
  status: z.string().optional(),
});
export type RefundListQuery = z.infer<typeof refundListQuerySchema>;

/** 서류 업로드 폼 필드(파일 제외) — `multipart/form-data` 라 값은 문자열로 온다 */
export const uploadDocumentFieldsSchema = z.object({
  applicationId: idSchema,
  slot: z.enum(["LEASE_CONTRACT", "RESIDENT_REGISTRATION", "PAYMENT_PROOF"]),
});
export type UploadDocumentFields = z.infer<typeof uploadDocumentFieldsSchema>;

/**
 * 어드민 심사 액션.
 *
 * 목표 상태를 클라이언트가 고르지 않는다 — **액션 이름만** 받고 어디로 갈지는
 * 서버의 상태 전이표(`features/refund/status.ts`)가 정한다. 코멘트 필수 여부도 마찬가지다.
 */
export const refundReviewSchema = z.object({
  action: z.enum(["START", "NEED_MORE_DOCS", "APPROVE", "REJECT", "COMPLETE"]),
  note: z.string().trim().max(1_000, "심사 코멘트는 1,000자까지 입력할 수 있습니다.").optional(),
});
export type RefundReviewInput = z.infer<typeof refundReviewSchema>;
