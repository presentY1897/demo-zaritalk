/**
 * 매물 요청 스키마 (T3.1). `POST /api/listings` · `PATCH /api/listings/[id]` 가 공유한다.
 * `@zari/db` 를 import 하지 않는다 — 등록 폼도 같은 스키마로 미리 막는다.
 */
import { z } from "zod";

/** 사진은 URL 로만 받는다 — 업로더 연결은 T2.4 일반화 이후(문서 참고) */
export const LISTING_PHOTO_MAX = 5;

/** Int 컬럼 상한(약 21억) 아래로 잡은 금액 상한 — 스키마 주석과 같은 기준 */
const AMOUNT_MAX = 2_000_000_000;

const depositSchema = z
  .number()
  .int("보증금은 원 단위 정수로 입력해 주세요.")
  .min(0, "보증금은 0 이상이어야 합니다.")
  .max(AMOUNT_MAX, "보증금이 너무 큽니다.");

const monthlyRentSchema = z
  .number()
  .int("월세는 원 단위 정수로 입력해 주세요.")
  .min(0, "월세는 0 이상이어야 합니다.")
  .max(AMOUNT_MAX, "월세가 너무 큽니다.");

const descriptionSchema = z.string().trim().max(500, "설명은 500자 이하로 입력해 주세요.");

/** `YYYY-MM-DD` — 입주가능일. 없으면 즉시 입주 */
const availableFromSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "입주가능일은 YYYY-MM-DD 형식으로 입력해 주세요.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
    message: "입주가능일이 올바른 날짜가 아닙니다.",
  });

const photosSchema = z
  .array(
    z
      .url("사진은 http(s) 주소로 입력해 주세요.")
      .max(500, "사진 주소가 너무 깁니다.")
      .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
        message: "사진은 http(s) 주소로 입력해 주세요.",
      }),
  )
  .max(LISTING_PHOTO_MAX, `사진은 ${LISTING_PHOTO_MAX}장까지 등록할 수 있습니다.`);

export const listingStatusSchema = z.enum(["OPEN", "RESERVED", "CLOSED"]);

/**
 * 전세는 월세가 0 이어야 하고, 월세는 월세가 1원 이상이어야 한다.
 * (`DealType` 과 `monthlyRent` 가 어긋나면 `/search` 필터가 틀어진다.)
 */
const dealTypeRefine = <T extends { dealType: "JEONSE" | "WOLSE"; monthlyRent?: number }>(
  value: T,
  ctx: z.RefinementCtx,
) => {
  if (value.monthlyRent === undefined) return;
  if (value.dealType === "JEONSE" && value.monthlyRent !== 0) {
    ctx.addIssue({ code: "custom", path: ["monthlyRent"], message: "전세는 월세가 0원이어야 합니다." });
  }
  if (value.dealType === "WOLSE" && value.monthlyRent <= 0) {
    ctx.addIssue({ code: "custom", path: ["monthlyRent"], message: "월세 금액을 입력해 주세요." });
  }
};

/** `POST /api/listings` 본문 */
export const createListingSchema = z
  .object({
    unitId: z.string().trim().min(1, "호실을 선택해 주세요."),
    dealType: z.enum(["JEONSE", "WOLSE"]),
    deposit: depositSchema,
    monthlyRent: monthlyRentSchema.default(0),
    description: descriptionSchema.optional(),
    photos: photosSchema.optional(),
    availableFrom: availableFromSchema.nullish(),
  })
  .superRefine(dealTypeRefine);
export type CreateListingInput = z.infer<typeof createListingSchema>;

/**
 * `PATCH /api/listings/[id]` 본문 — 보낸 필드만 바꾼다.
 * 거래유형만 바꾸고 월세를 안 보내는 경우가 있어 `dealType`·`monthlyRent` 정합성은
 * **저장된 값과 합친 뒤** 라우트에서 한 번 더 본다(여기서는 둘 다 온 경우만 막는다).
 */
export const updateListingSchema = z
  .object({
    dealType: z.enum(["JEONSE", "WOLSE"]).optional(),
    deposit: depositSchema.optional(),
    monthlyRent: monthlyRentSchema.optional(),
    description: descriptionSchema.or(z.literal("")).optional(),
    photos: photosSchema.optional(),
    availableFrom: availableFromSchema.nullish(),
    status: listingStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "수정할 값이 없습니다." })
  .superRefine((value, ctx) => {
    if (value.dealType === undefined) return;
    dealTypeRefine({ dealType: value.dealType, monthlyRent: value.monthlyRent }, ctx);
  });
export type UpdateListingInput = z.infer<typeof updateListingSchema>;
