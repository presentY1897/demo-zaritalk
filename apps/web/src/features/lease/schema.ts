/**
 * 계약·납부 요청 스키마 (T1.2·T1.5).
 *
 * `@zari/db` 를 import 하지 않는다 — 클라이언트 폼도 같은 스키마로 미리 막는다.
 * 전화번호는 T0.3 의 `phoneSchema`(하이픈 허용 → 숫자만으로 정규화)를 그대로 쓴다.
 */
import { z } from "zod";
import { phoneSchema } from "@/lib/phone";

/** 금액(원) — Prisma Int 상한(약 21억) 안쪽으로 제한한다(스키마 주석 참고) */
const wonSchema = z
  .number()
  .int("금액은 원 단위 정수로 입력해 주세요.")
  .min(0, "금액은 0원 이상이어야 합니다.")
  .max(2_000_000_000, "금액이 너무 큽니다.");

const tenantNameSchema = z
  .string()
  .trim()
  .min(1, "세입자 이름을 입력해 주세요.")
  .max(30, "세입자 이름은 30자 이하로 입력해 주세요.");

const paymentDaySchema = z
  .number()
  .int("납부일은 정수로 입력해 주세요.")
  .min(1, "납부일은 1~31 사이여야 합니다.")
  .max(31, "납부일은 1~31 사이여야 합니다.");

/** `YYYY-MM-DD` 문자열. UTC 자정 Date 변환은 `rules.ts` 의 `parseDateOnly` 가 한다 */
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식으로 입력해 주세요.");

/** 월 연체이율(%). null 이면 연체료 없음(원장 엔진 `calcLateFee` 규칙) */
const lateFeeRateSchema = z
  .number()
  .min(0, "연체이율은 0 이상이어야 합니다.")
  .max(100, "연체이율은 100% 이하여야 합니다.");

/** `POST /api/leases` 본문 */
export const createLeaseSchema = z
  .object({
    unitId: z.string().min(1, "호실을 선택해 주세요."),
    tenantName: tenantNameSchema,
    tenantPhone: phoneSchema,
    deposit: wonSchema,
    monthlyRent: wonSchema,
    maintenanceFee: wonSchema.optional(),
    paymentDay: paymentDaySchema,
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    lateFeeRatePct: lateFeeRateSchema.nullish(),
  })
  // `YYYY-MM-DD` 는 사전순 비교가 곧 날짜 비교다
  .refine((value) => value.startDate <= value.endDate, {
    message: "계약 종료일은 시작일보다 빠를 수 없습니다.",
    path: ["endDate"],
  });
export type CreateLeaseInput = z.infer<typeof createLeaseSchema>;

/**
 * `PATCH /api/leases/[id]` 본문 — 보낸 필드만 바꾼다.
 *
 * `status` 는 **`ENDED` 만** 받는다. `ACTIVE` 전환(세입자 수락)은 T1.3 소유고,
 * 임대인이 임의로 계약을 성립시키면 안 된다.
 * 두 날짜 중 하나만 보낼 수도 있어 기간 역전 판정은 **저장된 값과 합친 뒤** 라우트에서 한다.
 */
export const updateLeaseSchema = z
  .object({
    tenantName: tenantNameSchema.optional(),
    tenantPhone: phoneSchema.optional(),
    deposit: wonSchema.optional(),
    monthlyRent: wonSchema.optional(),
    maintenanceFee: wonSchema.optional(),
    paymentDay: paymentDaySchema.optional(),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
    lateFeeRatePct: lateFeeRateSchema.nullish(),
    status: z.literal("ENDED").optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "수정할 값이 없습니다." });
export type UpdateLeaseInput = z.infer<typeof updateLeaseSchema>;

/** `GET /api/leases` 쿼리 — 호실·상태로 좁힌다 */
export const listLeasesQuerySchema = z.object({
  unitId: z.string().min(1).optional(),
  status: z.enum(["PENDING_TENANT", "ACTIVE", "ENDED", "CANCELLED"]).optional(),
});
export type ListLeasesQuery = z.infer<typeof listLeasesQuerySchema>;

/**
 * `POST /api/charges/[id]/payments` 본문.
 *
 * `CARD`(자리페이)는 T2.2 의 토스 확인 흐름에서만 만들어져야 하므로 여기서 받지 않는다.
 * `paidAt` 도 받지 않는다 — 임대인이 과거 시각을 임의로 적으면 장부(T1.6)의 월 집계가 흔들린다.
 */
export const createPaymentSchema = z.object({
  amount: z
    .number()
    .int("금액은 원 단위 정수로 입력해 주세요.")
    .positive("납부 금액은 1원 이상이어야 합니다.")
    .max(2_000_000_000, "금액이 너무 큽니다."),
  method: z.enum(["MANUAL_CHECK", "VIRTUAL_TRANSFER"], {
    message: "지원하지 않는 납부 수단입니다.",
  }),
  /** 가상 입금 시뮬레이션의 **입금자명**이 여기 담긴다 */
  memo: z.string().trim().max(60, "메모는 60자 이하로 입력해 주세요.").nullish(),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
