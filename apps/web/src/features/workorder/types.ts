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

/** `WorkOrderTargetStatus` 미러. 지금은 `SENT` 만 쓴다(나머지는 T5.3) */
export type WorkOrderTargetStatusValue = "SENT" | "VIEWED" | "ACCEPTED" | "DECLINED";

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
  /** 받은 견적 수 — 견적 제안은 T5.3 이 연다. 지금은 항상 0 */
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
export type UpdateWorkOrderResult = { workOrder: LandlordWorkOrderDto };

/** `POST /api/complaints/[id]/convert` 응답 — 스레드가 그대로 갈아 끼운다 */
export type ConvertComplaintResult = {
  workOrder: LandlordWorkOrderDto;
  dispatchedCount: number;
  /** 전환으로 `IN_PROGRESS` 가 된 민원의 상태 */
  complaintStatus: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";
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
