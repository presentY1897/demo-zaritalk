/**
 * 프로필 생성·수정 요청 스키마 (T0.4).
 *
 * `POST /api/profiles` · `PATCH /api/profiles/[id]` 가 공유한다.
 * **`@zari/db` 를 import 하지 않는다** — 클라이언트 폼에서도 같은 상수를 쓰기 위해
 * 유형·업종을 문자열 리터럴로 두고, 서버에서 Prisma enum 으로 그대로 넘긴다
 * (Prisma 생성 enum 은 문자열 유니온이라 값이 1:1로 맞는다).
 */
import { z } from "zod";

export const PROFILE_TYPES = ["LANDLORD", "TENANT", "REALTOR", "MASTER"] as const;
export type ProfileTypeValue = (typeof PROFILE_TYPES)[number];

export const MASTER_CATEGORIES = ["CLEANING", "INTERIOR", "REPAIR", "ETC"] as const;
export type MasterCategoryValue = (typeof MASTER_CATEGORIES)[number];

/** 계정 이름 — 가입 플로우에서 User.name 으로 저장된다 */
export const profileNameSchema = z
  .string()
  .trim()
  .min(2, "이름은 2자 이상이어야 합니다.")
  .max(20, "이름은 20자 이하로 입력해 주세요.");

const addressSchema = z.string().trim().min(2, "주소를 입력해 주세요.").max(120);
/**
 * 좌표는 지금 **수동 입력**이다 — 카카오맵 키가 아직 없어 주소→좌표 지오코딩을 못 한다.
 * 시연 편의를 위해 화면에서 서울 주요 지역 프리셋을 고를 수 있게 해 뒀다
 * (`constants.ts` 의 `AREA_PRESETS`). T3.x 에서 카카오 로컬 API 지오코딩으로 교체한다.
 */
const latSchema = z
  .number()
  .min(33, "위도는 33~39 사이(대한민국)여야 합니다.")
  .max(39, "위도는 33~39 사이(대한민국)여야 합니다.");
const lngSchema = z
  .number()
  .min(124, "경도는 124~132 사이(대한민국)여야 합니다.")
  .max(132, "경도는 124~132 사이(대한민국)여야 합니다.");
const radiusKmSchema = z
  .number()
  .min(0.5, "활동반경은 0.5km 이상이어야 합니다.")
  .max(50, "활동반경은 50km 이하여야 합니다.");

/** 중개인 Detail — officeName·address·lat·lng·radiusKm 필수 */
export const realtorDetailSchema = z.object({
  officeName: z.string().trim().min(1, "사무소명을 입력해 주세요.").max(40),
  licenseNo: z.string().trim().max(40).optional(),
  address: addressSchema,
  lat: latSchema,
  lng: lngSchema,
  radiusKm: radiusKmSchema,
  intro: z.string().trim().max(200).optional(),
});
export type RealtorDetailInput = z.infer<typeof realtorDetailSchema>;

/** 마스터 Detail — companyName·categories(1개 이상)·address·lat·lng·radiusKm 필수 */
export const masterDetailSchema = z.object({
  companyName: z.string().trim().min(1, "업체명을 입력해 주세요.").max(40),
  categories: z
    .array(z.enum(MASTER_CATEGORIES))
    .min(1, "업종을 1개 이상 선택해 주세요.")
    .max(MASTER_CATEGORIES.length),
  address: addressSchema,
  lat: latSchema,
  lng: lngSchema,
  radiusKm: radiusKmSchema,
  intro: z.string().trim().max(200).optional(),
});
export type MasterDetailInput = z.infer<typeof masterDetailSchema>;

const commonCreateFields = {
  /** 가입 플로우에서는 필수(User.name), 로그인 상태에서 프로필만 추가할 때는 선택 */
  name: profileNameSchema.optional(),
  /** OTP 검증으로 받은 가입 티켓. 있으면 User 생성까지 한다 */
  signupTicket: z.string().trim().min(1).optional(),
};

/**
 * `POST /api/profiles` 본문.
 * 유형별로 필요한 Detail 을 discriminatedUnion 으로 강제한다 —
 * REALTOR 에 `realtor` 가 없거나 MASTER 에 `master` 가 없으면 400 VALIDATION_ERROR.
 */
export const createProfileSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("LANDLORD"), ...commonCreateFields }),
  z.object({ type: z.literal("TENANT"), ...commonCreateFields }),
  z.object({ type: z.literal("REALTOR"), ...commonCreateFields, realtor: realtorDetailSchema }),
  z.object({ type: z.literal("MASTER"), ...commonCreateFields, master: masterDetailSchema }),
]);
export type CreateProfileInput = z.infer<typeof createProfileSchema>;

/**
 * `PATCH /api/profiles/[id]` 본문. 유형은 바꿀 수 없으므로(= `@@unique([userId, type])`)
 * **저장된 프로필 유형**에 맞는 Detail 을 필수로 건다. Detail 은 부분 수정이 아니라 통째로 받는다.
 */
export function updateProfileSchemaFor(type: ProfileTypeValue) {
  return z
    .object({
      name: profileNameSchema.optional(),
      realtor: realtorDetailSchema.optional(),
      master: masterDetailSchema.optional(),
    })
    .superRefine((value, ctx) => {
      if (type === "REALTOR" && !value.realtor) {
        ctx.addIssue({ code: "custom", path: ["realtor"], message: "중개인 정보가 필요합니다." });
      }
      if (type === "MASTER" && !value.master) {
        ctx.addIssue({ code: "custom", path: ["master"], message: "마스터 정보가 필요합니다." });
      }
    });
}

export type UpdateProfileInput = z.infer<ReturnType<typeof updateProfileSchemaFor>>;
