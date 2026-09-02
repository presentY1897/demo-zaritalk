/**
 * 건물·호실 요청 스키마 (T1.1).
 *
 * `POST/PATCH /api/buildings*` · `POST /api/buildings/[id]/units` · `PATCH /api/units/[id]` 가 공유한다.
 * `@zari/db` 를 import 하지 않는다 — 클라이언트 폼도 같은 스키마로 미리 막는다.
 */
import { z } from "zod";
/**
 * 좌표 범위(위 33~39 / 경 124~132)는 T3.1 이 만든 단일 출처에서 온다.
 * 건물 주소는 이제 주소 검색(`AddressSearchField`)으로만 입력되지만 — 화면에 위경도 칸이 없다 —
 * API 를 직접 부를 수 있으므로 서버 스키마에서 여전히 범위를 막는다.
 */
import { latSchema, lngSchema } from "@/features/address/coords";

const nameSchema = z
  .string()
  .trim()
  .min(1, "건물 이름을 입력해 주세요.")
  .max(40, "건물 이름은 40자 이하로 입력해 주세요.");

const addressSchema = z
  .string()
  .trim()
  .min(2, "주소를 입력해 주세요.")
  .max(120, "주소는 120자 이하로 입력해 주세요.");

const noteSchema = z.string().trim().max(200, "메모는 200자 이하로 입력해 주세요.");

/** `POST /api/buildings` 본문 */
export const createBuildingSchema = z.object({
  name: nameSchema,
  address: addressSchema,
  roadAddress: addressSchema.optional(),
  lat: latSchema,
  lng: lngSchema,
  note: noteSchema.optional(),
});
export type CreateBuildingInput = z.infer<typeof createBuildingSchema>;

/** `PATCH /api/buildings/[id]` 본문 — 보낸 필드만 바꾼다 */
export const updateBuildingSchema = z
  .object({
    name: nameSchema.optional(),
    address: addressSchema.optional(),
    /** 빈 문자열이면 지운다(null 저장) */
    roadAddress: addressSchema.or(z.literal("")).optional(),
    lat: latSchema.optional(),
    lng: lngSchema.optional(),
    note: noteSchema.or(z.literal("")).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "수정할 값이 없습니다.",
  });
export type UpdateBuildingInput = z.infer<typeof updateBuildingSchema>;

const labelSchema = z
  .string()
  .trim()
  .min(1, "호실 이름을 입력해 주세요.")
  .max(20, "호실 이름은 20자 이하로 입력해 주세요.");

/** 반지하·지하 주차장을 고려해 음수 층도 받는다 */
const floorSchema = z
  .number()
  .int("층은 정수로 입력해 주세요.")
  .min(-5, "층은 -5 이상이어야 합니다.")
  .max(200, "층은 200 이하여야 합니다.");
const areaM2Schema = z
  .number()
  .positive("면적은 0보다 커야 합니다.")
  .max(10_000, "면적은 10,000㎡ 이하여야 합니다.");
const roomsSchema = z
  .number()
  .int("방 개수는 정수로 입력해 주세요.")
  .min(0, "방 개수는 0 이상이어야 합니다.")
  .max(20, "방 개수는 20 이하여야 합니다.");

/** `POST /api/buildings/[id]/units` 본문 — 라벨은 건물 안에서 유일하다(`@@unique([buildingId,label])`) */
export const createUnitSchema = z.object({
  label: labelSchema,
  floor: floorSchema.nullish(),
  areaM2: areaM2Schema.nullish(),
  rooms: roomsSchema.nullish(),
  note: noteSchema.nullish(),
});
export type CreateUnitInput = z.infer<typeof createUnitSchema>;

/** `PATCH /api/units/[id]` 본문 — 보낸 필드만 바꾼다. `null` 을 보내면 비운다 */
export const updateUnitSchema = z
  .object({
    label: labelSchema.optional(),
    floor: floorSchema.nullish(),
    areaM2: areaM2Schema.nullish(),
    rooms: roomsSchema.nullish(),
    note: noteSchema.nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "수정할 값이 없습니다.",
  });
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
