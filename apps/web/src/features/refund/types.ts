/**
 * 환급 신청 화면 DTO (T2.4·T2.5).
 *
 * **`@zari/db` 를 import 하지 않는다** — 신청서·상태 화면이 클라이언트 컴포넌트라
 * Prisma 타입을 끌어오면 클라이언트 번들이 깨진다(T1.1·T2.6 미러 패턴).
 *
 * 어드민 앱(`apps/admin`)은 `@/features/**` 를 import 할 수 없으므로 이 DTO 의
 * **필요한 부분만** `apps/admin/src/app/refunds/shared.ts` 에 미러로 둔다.
 * 상태 머신 자체는 옮기지 않는다 — 어드민이 누를 수 있는 버튼은 `availableActions` 로
 * **응답에 실려 온다**(판정은 언제나 web 의 `features/refund/status.ts` 한 곳).
 */
import type { RefundCalcResult } from "./calc";
import type { RefundDocumentSlot } from "./documents";
import type { RefundReviewAction, RefundStatusValue, StatusTone } from "./status";

/** 화면에 내려보내는 서류 1건 — **Blob URL 은 빼고** 뷰어 경로만 준다 */
export type RefundDocumentDto = {
  id: string;
  slot: RefundDocumentSlot;
  slotLabel: string;
  name: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  stage: "INITIAL" | "SUPPLEMENT";
  /** `GET /api/refunds/[id]/documents/[documentId]` — 세션을 확인하고 스트리밍한다 */
  viewHref: string;
};

/** 어드민 화면이 버튼 하나를 그리는 데 필요한 전부 */
export type RefundReviewActionDto = {
  action: RefundReviewAction;
  label: string;
  targetStatus: RefundStatusValue;
  requiresNote: boolean;
};

/** 신청서에 붙일 수 있는 내 계약(자동 채움 선택지) */
export type RefundLeaseOptionDto = {
  leaseId: string;
  unitLabel: string;
  buildingName: string;
  landlordName: string;
  monthlyRent: number;
  startDate: string;
  endDate: string;
};

/** 신청 1건 — 세입자 화면·어드민 상세가 같은 DTO 를 본다 */
export type RefundApplicationDto = {
  id: string;
  status: RefundStatusValue;
  statusLabel: string;
  statusTone: StatusTone;
  statusDescription: string;

  /** 계산 입력 — 응답만으로 산출 내역을 재현할 수 있다 */
  annualIncome: number;
  monthlyRent: number;
  startDate: string;
  endDate: string;
  /** 금액을 굳힌 기준일(소급 5년 창의 기준). 재계산이 언제나 같은 값을 내게 한다 */
  asOf: string;

  startYear: number;
  endYear: number;
  expectedAmount: number;

  leaseId: string | null;
  lease: RefundLeaseOptionDto | null;

  documents: RefundDocumentDto[];
  missingSlots: RefundDocumentSlot[];

  reviewNote: string | null;
  reviewedByName: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;

  /** 저장된 입력으로 다시 돌린 산출 내역(연도별 표) */
  calc: RefundCalcResult;

  /** 세입자 화면 버튼 활성화 판정 — 상태 머신에서 나온 값이다 */
  canEdit: boolean;
  canUpload: boolean;
  canSubmit: boolean;
  /** 어드민이 지금 누를 수 있는 액션 */
  availableActions: RefundReviewActionDto[];
};

/** 어드민 큐의 행 — 신청 DTO + 누가 낸 것인지 */
export type RefundReviewItemDto = RefundApplicationDto & {
  tenantName: string;
  tenantPhone: string;
  tenantProfileId: string;
};

/** `GET /api/refunds` (세입자) */
export type RefundListResult = {
  applications: RefundApplicationDto[];
  /** 신청서에서 고를 수 있는 내 계약 */
  leases: RefundLeaseOptionDto[];
};

/** `GET /api/refunds?scope=review` (어드민) */
export type RefundReviewListResult = {
  applications: RefundReviewItemDto[];
  /** 상태별 건수 — 필터 탭의 뱃지 */
  counts: Record<RefundStatusValue, number>;
};

/** `POST /api/refunds` · `PATCH /api/refunds/[id]` · `GET /api/refunds/[id]` */
export type RefundApplicationResult = { application: RefundApplicationDto };

/** `POST /api/refunds/[id]/submit` */
export type RefundSubmitResult = { application: RefundApplicationDto };

/** `POST /api/refunds/[id]/review` — 어드민. 알림톡 시뮬 1건이 함께 남는다 */
export type RefundReviewResult = {
  application: RefundReviewItemDto;
  notification: { id: string; title: string; toPhone: string; sentAt: string };
};

/** `POST /api/uploads` */
export type RefundUploadResult = {
  document: RefundDocumentDto;
  application: RefundApplicationDto;
};
