/**
 * 건물·호실 요청 스키마 (T1.1).
 *
 * `POST/PATCH /api/buildings*` · `POST /api/buildings/[id]/units` · `PATCH /api/units/[id]` 가 공유한다.
 * `@zari/db` 를 import 하지 않는다 — 클라이언트 폼도 같은 스키마로 미리 막는다.
 */
import { z } from "zod";

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

/**
 * 좌표는 지금 **수동 입력 + 지역 프리셋**이다 — 카카오맵 키가 없어 주소→좌표 지오코딩을 못 한다.
 * 프리셋은 T0.4 가 만든 `features/profiles/constants.ts` 의 `AREA_PRESETS` 를 그대로 재사용한다.
 * T3.x(매물 지도·통근)에서 카카오 로컬 API 주소 검색이 들어오면 위경도 입력칸과 함께 걷어낸다.
 * 범위는 T0.4 프로필 스키마와 같은 대한민국 범위를 쓴다.
 */
const latSchema = z
  .number()
  .min(33, "위도는 33~39 사이(대한민국)여야 합니다.")
  .max(39, "위도는 33~39 사이(대한민국)여야 합니다.");
const lngSchema = z
  .number()
  .min(124, "경도는 124~132 사이(대한민국)여야 합니다.")
  .max(132, "경도는 124~132 사이(대한민국)여야 합니다.");

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
