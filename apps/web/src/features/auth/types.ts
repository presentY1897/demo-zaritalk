/**
 * 클라이언트가 쓰는 API 응답 타입 (T0.4).
 * `@zari/db` 타입을 그대로 쓰면 Prisma 클라이언트가 브라우저 번들에 섞이므로
 * 응답 모양만 손으로 옮겨 둔다(`GET /api/me` = `lib/auth/me.ts` 의 MeResponse).
 * 날짜는 JSON 직렬화를 거쳐 문자열로 온다.
 */
import type { MasterCategoryValue, ProfileTypeValue } from "@/features/profiles/schema";

export type RealtorDetailDto = {
  profileId: string;
  officeName: string;
  licenseNo: string | null;
  address: string;
  lat: number;
  lng: number;
  radiusKm: number;
  intro: string | null;
};

export type MasterDetailDto = {
  profileId: string;
  companyName: string;
  categories: MasterCategoryValue[];
  address: string;
  lat: number;
  lng: number;
  radiusKm: number;
  intro: string | null;
};

export type MeProfileDto = {
  id: string;
  type: ProfileTypeValue;
  createdAt: string;
  realtorDetail: RealtorDetailDto | null;
  masterDetail: MasterDetailDto | null;
};

export type MeDto = {
  user: { id: string; name: string; phone: string; isAdmin: boolean };
  profiles: MeProfileDto[];
  /** 프로필이 없으면(온보딩 전) null */
  activeProfile: MeProfileDto | null;
};

/** `POST /api/auth/otp/request` — code 는 데모 노출용 */
export type OtpRequestResult = { phone: string; code: string; expiresAt: string };

/** `POST /api/auth/otp/verify` — 기존 회원이면 세션, 신규면 가입 티켓 */
export type OtpVerifyResult =
  | ({ status: "SESSION" } & MeDto)
  | {
      status: "SIGNUP_REQUIRED";
      phone: string;
      signupTicket: string;
      ticketExpiresAt: string;
    };

/** `POST /api/profiles` — redirectTo 는 세입자 대기 계약 판정 결과 */
export type CreateProfileResult = {
  profile: MeProfileDto;
  me: MeDto;
  redirectTo: string;
};

export type DemoRoleValue = "landlord" | "tenant" | "realtor" | "master";

/** 로그인 화면 데모 버튼 — 서버 컴포넌트가 `DEMO_ACCOUNTS` 를 이 모양으로 넘겨 준다 */
export type DemoAccountOption = {
  role: DemoRoleValue;
  label: string;
  description: string;
  name: string;
  phone: string;
};
