/**
 * 온보딩 폼이 쓰는 표시용 상수 (T0.4).
 * 클라이언트 컴포넌트에서 import 하므로 `@zari/db` 를 절대 끌어오지 않는다
 * (Prisma 클라이언트가 브라우저 번들에 섞이면 빌드가 깨진다).
 */
import type { MasterCategoryValue, ProfileTypeValue } from "./schema";

export type ProfileTypeOption = {
  value: ProfileTypeValue;
  label: string;
  description: string;
};

/** 온보딩 유형 선택 카드 4종 */
export const PROFILE_TYPE_OPTIONS: readonly ProfileTypeOption[] = [
  { value: "LANDLORD", label: "임대인", description: "수납관리 · 고지서 · 임대장부" },
  { value: "TENANT", label: "세입자", description: "월세 카드결제 · 환급 · 매물 탐색" },
  { value: "REALTOR", label: "중개인", description: "공실 중개 요청 수신" },
  { value: "MASTER", label: "마스터", description: "청소 · 인테리어 · 수리 견적" },
];

export type MasterCategoryOption = { value: MasterCategoryValue; label: string };

/** 마스터 업종(복수 선택) */
export const MASTER_CATEGORY_OPTIONS: readonly MasterCategoryOption[] = [
  { value: "CLEANING", label: "청소" },
  { value: "INTERIOR", label: "인테리어" },
  { value: "REPAIR", label: "수리 · 설비" },
  { value: "ETC", label: "기타" },
];

/* 좌표 프리셋(`AREA_PRESETS`)은 T3.1 에서 걷어냈다 — 카카오맵 키가 없던 동안 좌표를 수동
   입력받으면서 시연 편의로 두었던 임시 조치다. 이제 활동지역·건물 주소·근무지 모두 공용
   주소 검색(`features/address/AddressSearchField`)으로 좌표를 받는다. */

/** 활동반경 선택지(km) */
export const RADIUS_OPTIONS = [1, 3, 5, 10, 20] as const;
