/**
 * 근무지 요청 스키마 (T3.4).
 * `POST /api/workplaces` · `PATCH /api/workplaces/[id]` 가 공유한다.
 *
 * 좌표 범위(위 33~39 / 경 124~132)는 `features/address/coords.ts` 한 곳에서 온다 —
 * 주소 검색을 거치지 않고 API 를 직접 불러도 범위 밖 좌표는 400 이다.
 */
import { z } from "zod";
import { latSchema, lngSchema } from "@/features/address/coords";

/** 한 세입자가 등록할 수 있는 근무지 수 — 통근 조회(T3.5)가 쌍 단위로 도는 것을 고려한 상한 */
export const WORKPLACE_MAX = 5;

const labelSchema = z
  .string()
  .trim()
  .min(1, "근무지 이름을 입력해 주세요.")
  .max(20, "근무지 이름은 20자 이하로 입력해 주세요.");

const addressSchema = z
  .string()
  .trim()
  .min(2, "주소를 검색해 선택해 주세요.")
  .max(120, "주소는 120자 이하로 입력해 주세요.");

/** `POST /api/workplaces` 본문 */
export const createWorkplaceSchema = z.object({
  label: labelSchema,
  address: addressSchema,
  lat: latSchema,
  lng: lngSchema,
});
export type CreateWorkplaceInput = z.infer<typeof createWorkplaceSchema>;

/**
 * `PATCH /api/workplaces/[id]` 본문 — 보낸 필드만 바꾼다.
 * 주소만 바꾸면 좌표도 함께 와야 한다(주소와 좌표가 어긋나면 통근시간이 엉뚱해진다).
 */
export const updateWorkplaceSchema = z
  .object({
    label: labelSchema.optional(),
    address: addressSchema.optional(),
    lat: latSchema.optional(),
    lng: lngSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "수정할 값이 없습니다." })
  .refine(
    (value) =>
      (value.address === undefined && value.lat === undefined && value.lng === undefined) ||
      (value.address !== undefined && value.lat !== undefined && value.lng !== undefined),
    { message: "주소를 바꾸려면 주소와 좌표를 함께 보내야 합니다.", path: ["address"] },
  );
export type UpdateWorkplaceInput = z.infer<typeof updateWorkplaceSchema>;
