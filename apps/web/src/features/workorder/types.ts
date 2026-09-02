/**
 * 작업 의뢰 화면 DTO (T5.1·T5.2).
 *
 * **`@zari/db` 를 import 하지 않는다** — 목록·생성 시트·마스터 피드가 전부 클라이언트
 * 컴포넌트라 Prisma 타입을 끌어오면 번들이 깨진다(T1.1·T2.6 이 세운 미러 패턴).
 */

/** `WorkOrderStatus` 미러 — 스키마 enum 과 값이 같아야 한다 */
export type WorkOrderStatusValue = "REQUESTED" | "QUOTED" | "ASSIGNED" | "DONE" | "CANCELLED";

/** `MasterCategory` 미러 */
export type MasterCategoryValue = "CLEANING" | "INTERIOR" | "REPAIR" | "ETC";

/** `MasterPlan` 미러 — FREE 는 pull 만, PRO 는 push 추천까지 (D4) */
export type MasterPlanValue = "FREE" | "PRO";

/**
 * `WorkOrderTargetStatus` 미러. **코드가 실제로 쓰는 값은 `SENT` 하나다.**
 *
 * T5.3 이 `VIEWED`·`ACCEPTED`·`DECLINED` 를 채우지 않기로 한 근거는
 * [t5.3-quote.md](../../../../../docs/tasks/t5.3-quote.md#workordertargetstatus-를-쓰지-않는다)
 * 에 적었다 — 요약하면 견적 생애주기의 단일 출처는 `WorkOrderQuote.status` 이고,
 * `WorkOrderTarget` 은 "그때 이 조건이라 보냈다" 는 **발송 기록**이라 사후에 덮어쓰지 않는다.
 */
export type WorkOrderTargetStatusValue = "SENT" | "VIEWED" | "ACCEPTED" | "DECLINED";

/** `QuoteStatus` 미러 — 스키마 enum 과 값이 같아야 한다 (T5.3) */
export type QuoteStatusValue = "PROPOSED" | "ACCEPTED" | "REJECTED";

/**
 * 이 견적이 **어느 길로 온 의뢰**에 낸 것인가 (T5.3).
 *
 * 스키마에 컬럼을 두지 않고 `WorkOrderTarget` 행의 유무로 판정한다 —
 * T5.2 의 `recommended` 판정과 **같은 값**이라 두 화면이 어긋날 수 없다.
 */
export type QuoteSource = "PUSH" | "PULL";

/** 의뢰가 어디서 왔는가 — 임대인이 직접 쓴 것과 민원에서 넘어온 것 */
export type WorkOrderSource = "DIRECT" | "COMPLAINT";

/**
 * 의뢰 대상 위치 — 건물은 필수, 호실은 선택(옥상 방수 같은 공용부 작업은 호실이 없다).
 * 스키마상 `WorkOrder.buildingId` 가 `String?` 이라 DTO 에서는 `place` 자체가 null 일 수 있다.
 * 이 프로젝트의 두 생성 경로(직접 생성·민원 전환)는 **항상 건물을 채운다.**
 */
export type WorkOrderPlaceDto = {
  buildingId: string;
  buildingName: string;
  buildingAddress: string;
  unitId: string | null;
  unitLabel: string | null;
};

/** 임대인·마스터가 함께 보는 의뢰의 뼈대 */
export type WorkOrderBaseDto = {
  id: string;
  category: MasterCategoryValue;
  description: string;
  /** `YYYY-MM-DD` 또는 null(희망일 미지정) */
  desiredDate: string | null;
  status: WorkOrderStatusValue;
  createdAt: string;
  updatedAt: string;
  /** 건물이 지정되지 않은 의뢰(스키마상 가능)면 null — 화면은 `formatWorkOrderPlace` 로 그린다 */
  place: WorkOrderPlaceDto | null;
};

/** 임대인 목록·상세 카드 */
export type LandlordWorkOrderDto = WorkOrderBaseDto & {
  source: WorkOrderSource;
  /** 민원에서 전환된 의뢰면 그 민원 id (스레드로 되돌아가는 링크) */
  complaintId: string | null;
  complaintTitle: string | null;
  /** push 추천을 받은 PRO 마스터 수 */
  targetCount: number;
  /** 받은 견적 수(제안·수락·거절 전부) — 상세의 「받은 견적」 배지가 읽는다 */
  quoteCount: number;
};

/** 마스터 피드·추천함 카드 */
export type MasterWorkOrderDto = WorkOrderBaseDto & {
  /** 내 사무소에서 의뢰 건물까지의 거리(km, 소수 3자리) */
  distanceKm: number;
  landlordName: string;
  /** 나에게 push 추천으로 발송된 의뢰인가 */
  recommended: boolean;
  /** 추천 발송 시각(추천이 아니면 null) */
  sentAt: string | null;
};

/**
 * 임대인 견적 비교 카드 (T5.3) — 「업체·금액·메시지」 한 장.
 *
 * `distanceKm` 은 의뢰 건물 ↔ 마스터 사무소 거리다. 건물이 없는 의뢰(스키마상 가능)면 null 이고,
 * 화면은 거리 줄을 그리지 않는다.
 */
export type LandlordQuoteDto = {
  id: string;
  workOrderId: string;
  amount: number;
  message: string | null;
  status: QuoteStatusValue;
  createdAt: string;
  masterProfileId: string;
  companyName: string;
  masterName: string;
  categories: MasterCategoryValue[];
  distanceKm: number | null;
  /** 이 마스터가 추천(push)을 받은 의뢰인가 — 임대인에게도 "어떻게 닿았는지" 를 보여 준다 */
  source: QuoteSource;
};

/** 마스터 「내 견적」 카드 (T5.3) — 의뢰 요약을 함께 들고 다닌다 */
export type MasterQuoteDto = {
  id: string;
  amount: number;
  message: string | null;
  status: QuoteStatusValue;
  createdAt: string;
  /** 추천(push)으로 받은 건인가, 전체 피드(pull)에서 찾은 건인가 */
  source: QuoteSource;
  workOrder: WorkOrderBaseDto & {
    landlordName: string;
    /** 내 사무소 → 의뢰 건물(km). 건물이 없는 의뢰면 null */
    distanceKm: number | null;
  };
};

/** 의뢰 생성 시트의 대상 선택지 — 내 건물과 그 호실들 */
export type WorkOrderPlaceOptionDto = {
  buildingId: string;
  buildingName: string;
  buildingAddress: string;
  units: { id: string; label: string }[];
};

/** 마스터 홈 상단에 보이는 내 플랜 상태 */
export type MasterPlanDto = {
  plan: MasterPlanValue;
  /** ISO 문자열. null 이면 만료 없음 */
  planUntil: string | null;
  companyName: string;
  categories: MasterCategoryValue[];
  radiusKm: number;
};

/** `GET·POST /api/work-orders` 응답 */
export type ListWorkOrdersResult = {
  workOrders: LandlordWorkOrderDto[];
  places: WorkOrderPlaceOptionDto[];
};
export type CreateWorkOrderResult = {
  workOrder: LandlordWorkOrderDto;
  /** 이번 생성으로 새로 발송된 push 추천 수 */
  dispatchedCount: number;
};

/** `PATCH /api/work-orders/[id]` 응답 */
export type UpdateWorkOrderResult = {
  workOrder: LandlordWorkOrderDto;
  /**
   * 완료 처리로 함께 닫힌 민원의 상태 (T5.3). 연결 민원이 없으면 null.
   * 전이표(T2.6 `canTransition`)가 막은 경우에는 **바뀌지 않은 원래 상태**가 온다.
   */
  complaintStatus: ComplaintStatusMirror | null;
};

/** `ComplaintStatus` 미러 — T2.6 `features/complaint/types.ts` 와 값이 같다 */
export type ComplaintStatusMirror = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";

/** 임대인 의뢰 상세가 한 번에 읽는 것 — 의뢰 + 받은 견적(최신순) (T5.3) */
export type LandlordWorkOrderDetail = {
  workOrder: LandlordWorkOrderDto;
  quotes: LandlordQuoteDto[];
};

/** `POST /api/work-orders/[id]/quotes` 응답 (T5.3) */
export type CreateQuoteResult = { quote: MasterQuoteDto };

/**
 * `POST /api/quotes/[id]/accept` 응답 (T5.3).
 * 수락 한 건만이 아니라 **갱신된 견적 전부**를 돌려준다 — 나머지가 거절로 바뀐 것도
 * 같은 응답에 실려 와야 화면이 서버를 다시 묻지 않고 그대로 그린다.
 */
export type AcceptQuoteResult = LandlordWorkOrderDetail & { acceptedQuoteId: string };

/** `POST /api/complaints/[id]/convert` 응답 — 스레드가 그대로 갈아 끼운다 */
export type ConvertComplaintResult = {
  workOrder: LandlordWorkOrderDto;
  dispatchedCount: number;
  /** 전환으로 `IN_PROGRESS` 가 된 민원의 상태 */
  complaintStatus: ComplaintStatusMirror;
};

/** `GET /api/master/feed` 응답 (pull — 전 마스터) */
export type MasterFeedResult = {
  workOrders: MasterWorkOrderDto[];
  master: MasterPlanDto;
};

/** `GET /api/master/targets` 응답 (push — PRO 전용) */
export type MasterTargetsResult = {
  workOrders: MasterWorkOrderDto[];
  master: MasterPlanDto;
  /** FREE 면 true — 화면은 빈 목록 대신 업그레이드 안내를 그린다 */
  upgradeRequired: boolean;
};

/** `POST /api/master/plan` 응답 */
export type UpdateMasterPlanResult = {
  master: MasterPlanDto;
  /** PRO 로 켜면서 그 자리에서 채워진 추천 수(FREE 로 끄면 0) */
  backfilledCount: number;
};
