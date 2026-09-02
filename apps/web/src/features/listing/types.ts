/**
 * 매물 DTO (T3.1).
 *
 * **`@zari/db` 를 import 하지 않는다** — 매물 등록 화면이 클라이언트 컴포넌트다
 * (T1.1 `features/landlord/types.ts` 미러 패턴). 날짜는 전부 문자열(ISO / `YYYY-MM-DD`).
 */
import type { DealTypeValue, ListingStatusValue, UnitStatus } from "@/features/landlord/types";

export type { DealTypeValue, ListingStatusValue };

/** 이 매물을 누가 올렸는가 — 임대인 본인인지 중개인인지 화면에서 구분한다 */
export type ListedByRole = "LANDLORD" | "REALTOR";

/** 매물 1건 */
export type ListingDto = {
  id: string;
  unitId: string;
  dealType: DealTypeValue;
  deposit: number;
  /** 전세면 0 */
  monthlyRent: number;
  description: string | null;
  /** 사진 URL 배열 — 업로더는 T2.4 일반화 후 붙인다(지금은 URL 입력) */
  photos: string[];
  /** `YYYY-MM-DD` — 즉시 입주면 null */
  availableFrom: string | null;
  status: ListingStatusValue;
  createdAt: string;
  updatedAt: string;
  listedBy: {
    profileId: string;
    role: ListedByRole;
    /** 등록자 이름(User.name) */
    name: string;
  };
};

/** 매물 등록 화면이 필요한 호실 정보 — 권한·409 판정 결과까지 서버가 미리 계산해 준다 */
export type ListingUnitDto = {
  id: string;
  label: string;
  floor: number | null;
  areaM2: number | null;
  rooms: number | null;
  /** 호실 상태(T1.1 `deriveUnitStatus`) — 공실이 아니면 새 매물을 올릴 수 없다 */
  status: UnitStatus;
  building: {
    id: string;
    name: string;
    address: string;
    roadAddress: string | null;
    lat: number;
    lng: number;
  };
};

/** `/landlord/units/[id]/listing` 화면 전체 */
export type ListingPageDto = {
  unit: ListingUnitDto;
  /** 현재 살아 있는 매물(OPEN·RESERVED) 또는 가장 최근 매물. 없으면 null */
  listing: ListingDto | null;
  /** 과거 매물(CLOSED) — 최신순 */
  pastListings: ListingDto[];
  /** 지금 이 사용자가 이 호실에 매물을 올릴 수 있는가 */
  canCreate: boolean;
  /** 올릴 수 없다면 그 이유(화면 문구) */
  blockedReason: string | null;
  /** 내 권한 — 임대인은 삭제까지, 중개인은 등록·수정·상태변경까지 */
  role: ListedByRole;
};
