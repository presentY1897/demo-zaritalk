/**
 * 중개 요청·수신함 DTO (T3.6·T3.7).
 *
 * **`@zari/db` 를 import 하지 않는다** — 요청 시트·수신함이 전부 클라이언트 컴포넌트라
 * Prisma 타입을 끌어오면 번들이 깨진다(T1.1·T5.1 이 세운 미러 패턴).
 * 날짜는 전부 문자열(ISO), 금액은 원(KRW) 정수다.
 */
import type { DealTypeValue, ListingStatusValue, UnitStatus } from "@/features/landlord/types";

export type { DealTypeValue, ListingStatusValue, UnitStatus };

/** `BrokerageRequestStatus` 미러 — 스키마 enum 과 값이 같아야 한다 */
export type BrokerageRequestStatusValue = "OPEN" | "MATCHED" | "CLOSED";

/** `BrokerageTargetStatus` 미러 */
export type BrokerageTargetStatusValue = "SENT" | "VIEWED" | "ACCEPTED" | "DECLINED";

/**
 * 요청 대상 호실 — **좌표는 건물이 가지고 있다**(`Unit` 에 lat/lng 가 없다).
 * 반경 매칭의 원점도 이 `lat`·`lng` 다.
 */
export type BrokeragePlaceDto = {
  unitId: string;
  unitLabel: string;
  floor: number | null;
  areaM2: number | null;
  rooms: number | null;
  buildingId: string;
  buildingName: string;
  buildingAddress: string;
  lat: number;
  lng: number;
};

/**
 * **발송 전 미리보기에 보이는 중개인** — 사무소 정보와 거리까지만이다.
 *
 * 이름·전화번호는 담지 않는다. 요청을 보내기도 전에 반경 안 중개인의 연락처가
 * 임대인 화면에 통째로 떨어지면 그건 매칭이 아니라 명부 유출이다.
 * 연락처는 **수락한 중개인**에 한해 `BrokerageRealtorContactDto` 로 열린다.
 */
export type BrokerageRealtorPreviewDto = {
  profileId: string;
  officeName: string;
  address: string;
  lat: number;
  lng: number;
  /** 그 중개인이 스스로 정한 활동반경(km) — 반경 판정은 이 값으로 한다 */
  radiusKm: number;
  /** 요청 건물 → 사무소 거리(km, 소수 3자리) */
  distanceKm: number;
};

/** **수락한 중개인**의 연락 카드 — 임대인이 실제로 전화를 걸 수 있는 정보 */
export type BrokerageRealtorContactDto = BrokerageRealtorPreviewDto & {
  /** 이 중개인에게 간 타겟 id */
  targetId: string;
  /** 중개인 계정 이름(User.name) */
  name: string;
  phone: string;
  licenseNo: string | null;
  intro: string | null;
  /** 수락 시각(ISO) */
  respondedAt: string | null;
};

/** 응답 현황 — 상태별 대상 수 */
export type BrokerageTargetCounts = Record<BrokerageTargetStatusValue, number>;

/** 임대인이 보는 중개 요청 1건 */
export type BrokerageRequestDto = {
  id: string;
  status: BrokerageRequestStatusValue;
  message: string | null;
  createdAt: string;
  place: BrokeragePlaceDto;
  /** 발송된 대상 수(= counts 합계) */
  targetCount: number;
  counts: BrokerageTargetCounts;
  /** 수락한 중개인 연락 카드 — 복수 수락을 허용하므로 배열이다 */
  accepted: BrokerageRealtorContactDto[];
  /** 그 호실에 살아 있는 매물(OPEN·RESERVED)이 있으면 요약 */
  listing: BrokerageListingSummaryDto | null;
};

/** 호실에 올라간 매물 요약 — 임대인·중개인 양쪽 화면이 함께 쓴다 */
export type BrokerageListingSummaryDto = {
  id: string;
  status: ListingStatusValue;
  dealType: DealTypeValue;
  deposit: number;
  monthlyRent: number;
  /** 이 매물을 올린 사람이 지금 보고 있는 중개인인가 (임대인 화면에서는 항상 false) */
  mine: boolean;
  /** 등록자 이름(User.name) */
  listedByName: string;
};

/** 요청 시트가 고를 수 있는 공실 호실 */
export type BrokerageUnitOptionDto = BrokeragePlaceDto & {
  status: UnitStatus;
  /** 이미 열려 있는(OPEN) 요청이 있으면 그 id — 다시 보내면 그 요청에 재발송된다 */
  openRequestId: string | null;
};

/** `GET /api/brokerage-requests` */
export type ListBrokerageRequestsResult = {
  requests: BrokerageRequestDto[];
  units: BrokerageUnitOptionDto[];
};

/** `GET /api/brokerage-requests/preview?unitId=` */
export type BrokeragePreviewResult = {
  unit: BrokeragePlaceDto;
  realtors: BrokerageRealtorPreviewDto[];
  /** 실제 발송될 인원 = `realtors.length` (같은 함수가 고른다) */
  count: number;
  /** 거리순 상한 — 반경 안 중개인이 이보다 많아도 여기까지만 간다 */
  limit: number;
  /** 요청을 보낼 수 없는 이유(계약중 호실 등). 보낼 수 있으면 null */
  blockedReason: string | null;
  /** 열린 요청이 이미 있으면 그 id — 새 요청 대신 **재발송**이 된다 */
  openRequestId: string | null;
};

/** `POST /api/brokerage-requests` */
export type CreateBrokerageRequestResult = {
  request: BrokerageRequestDto;
  /** 이번에 새로 발송된 대상 수(이미 보낸 중개인은 세지 않는다) */
  dispatchedCount: number;
  /** 열린 요청에 재발송한 것이면 true(새 요청을 만들지 않았다) */
  reused: boolean;
};

/** 중개인이 보는 요청 1건(수신함 카드 = 상세) */
export type RealtorInboxItemDto = {
  targetId: string;
  status: BrokerageTargetStatusValue;
  /** 내 사무소 → 요청 건물 거리(km) — **발송 시점에 굳은 값**이다 */
  distanceKm: number;
  respondedAt: string | null;
  requestId: string;
  requestStatus: BrokerageRequestStatusValue;
  message: string | null;
  createdAt: string;
  place: BrokeragePlaceDto;
  /** 임대인 — **연락처는 수락한 뒤에만** 채워진다 */
  landlord: { name: string; phone: string | null };
  /** 그 호실에 살아 있는 매물이 있으면 요약(`mine` 은 내가 올린 것인지) */
  listing: BrokerageListingSummaryDto | null;
  /** 지금 이 호실에 매물을 올릴 수 있는가(수락 + 공실 + 살아 있는 매물 없음) */
  canCreateListing: boolean;
  /** 올릴 수 없다면 그 이유(화면 문구) */
  listingBlockedReason: string | null;
};

/** 중개인 프로필 요약 — 수신함 상단의 "어디서 · 반경 몇 km" */
export type RealtorProfileDto = {
  officeName: string;
  address: string;
  lat: number;
  lng: number;
  radiusKm: number;
  licenseNo: string | null;
};

/** `GET /api/realtor/inbox` */
export type RealtorInboxResult = {
  requests: RealtorInboxItemDto[];
  realtor: RealtorProfileDto;
};

/** `POST /api/brokerage-targets/[id]/respond` */
export type RespondBrokerageTargetResult = {
  target: RealtorInboxItemDto;
  /** 첫 수락으로 요청이 `MATCHED` 로 넘어갔는가 */
  matched: boolean;
};

/** `/realtor/listings` — 내가 맡은 매물 1건 */
export type RealtorListingDto = {
  id: string;
  status: ListingStatusValue;
  dealType: DealTypeValue;
  deposit: number;
  monthlyRent: number;
  availableFrom: string | null;
  createdAt: string;
  updatedAt: string;
  place: BrokeragePlaceDto;
};

/** `/realtor/listings` 화면 전체 */
export type RealtorListingsResult = {
  listings: RealtorListingDto[];
  /** 수락했지만 아직 매물을 올리지 않은 호실 — 여기서 바로 등록으로 넘어간다 */
  pending: RealtorInboxItemDto[];
};
