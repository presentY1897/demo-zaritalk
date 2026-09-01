/**
 * 프로필 표시용 공용 타입·라벨 (T0.5).
 *
 * 서버(레이아웃)에서 클라이언트(셸·시트)로 넘기는 값은 **직렬화 가능한 최소 형태**만 쓴다.
 * Prisma 의 `Profile` 을 통째로 내려보내면 Date 등이 섞여 RSC 경계에서 다루기 번거롭다.
 */
import type { ProfileType } from "@zari/db";

/** 셸·전환 시트가 쓰는 프로필 요약 — 서버 컴포넌트가 만들어 클라이언트로 넘긴다. */
export type ProfileSummary = {
  id: string;
  type: ProfileType;
};

export const PROFILE_TYPE_LABEL: Record<ProfileType, string> = {
  LANDLORD: "임대인",
  TENANT: "세입자",
  REALTOR: "중개인",
  MASTER: "마스터",
};

/** 전환 시트에서 라벨 아래 한 줄 설명 */
export const PROFILE_TYPE_DESC: Record<ProfileType, string> = {
  LANDLORD: "수납관리 · 고지서 · 임대장부",
  TENANT: "월세 카드결제 · 환급 · 매물 탐색",
  REALTOR: "공실 중개 요청 수신 · 매물 관리",
  MASTER: "청소 · 인테리어 · 수리 견적",
};

/** 프로필 유형 4종 — 전환 시트에서 "추가 가능한 유형" 을 계산할 때 쓴다. */
export const PROFILE_TYPES: readonly ProfileType[] = [
  "LANDLORD",
  "TENANT",
  "REALTOR",
  "MASTER",
];
