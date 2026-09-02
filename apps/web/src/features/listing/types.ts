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

/**
 * 통근시간 배지 — **[T3.5](../../../../docs/tasks/t3.5-commute.md) 가 채운다.**
 *
 * T3.2·T3.3 은 `CommuteCache` 에 **이미 있는 행만 읽어** 배지/버튼 자리에 흘려보낸다.
 * 외부 API 를 부르지도, 캐시를 만들지도 않는다(그 일은 `POST /api/commute` 소유).
 * 지금은 캐시를 채우는 곳이 없어 언제나 `null` 이지만, 배선과 화면은 이미 완성돼 있어
 * T3.5 가 캐시를 쓰기 시작하면 **코드 변경 없이** 배지가 켜진다.
 */
export type ListingCommuteDto = {
  workplaceId: string;
  /** 근무지 이름("회사"·"본가") — 배지 문구에 쓴다 */
  workplaceLabel: string;
  /** 대중교통 분. 한쪽만 성공했을 수 있어 각각 null 을 허용한다(T3.5 부분 결과 규약) */
  transitMinutes: number | null;
  /** 자동차 분 */
  drivingMinutes: number | null;
  /** 캐시에 담긴 시각(ISO) — "언제 기준" 인지 화면에 밝힌다 */
  fetchedAt: string;
};

/** 공개 화면(`/search`·`/listings/[id]`)이 쓰는 호실 정보 */
export type PublicUnitDto = {
  id: string;
  label: string;
  floor: number | null;
  areaM2: number | null;
  rooms: number | null;
};

/** 공개 화면이 쓰는 건물 정보 — 좌표가 지도 핀이 된다 */
export type PublicBuildingDto = {
  id: string;
  name: string;
  address: string;
  roadAddress: string | null;
  lat: number;
  lng: number;
};

/**
 * `/listings/[id]` 공개 상세 (T3.3) — `GET /api/listings/[id]` 응답이기도 하다.
 *
 * **등록자 이름을 담지 않는다.** 이 페이지는 검색 색인 대상이라(문서의 robots 절)
 * 개인 이름이 실리면 색인에 사람 이름이 남는다. 화면에는 역할(임대인/중개인)만 보여 준다.
 */
export type PublicListingDto = {
  id: string;
  unitId: string;
  dealType: DealTypeValue;
  deposit: number;
  monthlyRent: number;
  status: ListingStatusValue;
  /** `월세 1,000만/50만` — 서버가 만들어 카드·상세·핀이 같은 문자열을 쓴다 */
  priceLabel: string;
  /** 지도 핀용 짧은 표기 */
  pinLabel: string;
  description: string | null;
  photos: string[];
  availableFrom: string | null;
  createdAt: string;
  updatedAt: string;
  listedBy: { role: ListedByRole };
  unit: PublicUnitDto;
  building: PublicBuildingDto;
  /** 로그인 세입자 + 근무지 지정 + 캐시 히트일 때만. T3.5 자리 */
  commute: ListingCommuteDto | null;
};
