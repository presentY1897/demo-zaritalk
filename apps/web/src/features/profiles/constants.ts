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

export type AreaPreset = {
  label: string;
  address: string;
  lat: number;
  lng: number;
};

/**
 * 활동지역 좌표 프리셋 — **임시 조치**.
 *
 * 카카오맵 키가 아직 없어 주소→좌표 지오코딩을 할 수 없다. 그래서 좌표는 수동 입력이고,
 * 시연에서 매번 위경도를 치지 않도록 서울 주요 지역을 프리셋으로 넣어 뒀다.
 * T3.x(매물 지도·통근)에서 카카오 로컬 API 지오코딩이 들어오면 이 배열과
 * 위경도 입력칸을 함께 걷어내고 주소 검색 한 칸으로 바꾼다.
 */
export const AREA_PRESETS: readonly AreaPreset[] = [
  { label: "왕십리", address: "서울 성동구 왕십리로 300", lat: 37.56133, lng: 127.03782 },
  { label: "성수", address: "서울 성동구 아차산로 100", lat: 37.54453, lng: 127.05599 },
  { label: "강남역", address: "서울 강남구 강남대로 396", lat: 37.49794, lng: 127.02762 },
  { label: "홍대입구", address: "서울 마포구 양화로 160", lat: 37.5572, lng: 126.9245 },
  { label: "잠실", address: "서울 송파구 올림픽로 240", lat: 37.51338, lng: 127.10021 },
  { label: "여의도", address: "서울 영등포구 여의대로 108", lat: 37.52508, lng: 126.92693 },
];

/** 활동반경 선택지(km) */
export const RADIUS_OPTIONS = [1, 3, 5, 10, 20] as const;
