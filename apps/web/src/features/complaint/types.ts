/**
 * 민원 화면 DTO (T2.6).
 *
 * **`@zari/db` 를 import 하지 않는다** — 접수 폼·스레드가 클라이언트 컴포넌트라
 * Prisma 타입을 끌어오면 클라이언트 번들이 깨진다(T1.1 `features/landlord/types.ts` 미러 패턴).
 */

/** `ComplaintStatus` 미러 — 스키마 enum 과 값이 같아야 한다 */
export type ComplaintStatusValue = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";

/** 스레드에 글을 쓸 수 있는 두 당사자 */
export type ComplaintParty = "TENANT" | "LANDLORD";

/**
 * 스레드의 말풍선 한 개.
 *
 * `kind: "OPENING"` 은 **접수 본문**(`Complaint.body`)을 첫 말풍선으로 세운 합성 항목이다 —
 * `ComplaintMessage` 행이 아니므로 `id` 는 `opening:<complaintId>` 형태다.
 * 접수 본문을 메시지 테이블에 한 번 더 복사하지 않으려고 이렇게 한다(원본은 `Complaint.body` 하나뿐).
 */
export type ComplaintMessageDto = {
  id: string;
  kind: "OPENING" | "REPLY";
  authorProfileId: string;
  authorRole: ComplaintParty;
  authorName: string;
  body: string;
  createdAt: string;
};

/** 목록 카드 1장 */
export type ComplaintSummaryDto = {
  id: string;
  leaseId: string;
  title: string;
  status: ComplaintStatusValue;
  createdAt: string;
  updatedAt: string;
  /** 접수 본문 포함 — 말풍선 개수 */
  messageCount: number;
  /** 마지막 활동 시각(마지막 메시지, 없으면 접수 시각) */
  lastMessageAt: string;
  /** 첨부 사진 URL. **지금은 항상 빈 배열**(T2.4 업로드가 붙으면 채워진다) */
  photos: string[];
  tenantName: string;
  landlordName: string;
  unit: {
    id: string;
    label: string;
    buildingId: string;
    buildingName: string;
    buildingAddress: string;
  };
};

/** 스레드 상세 = 목록 카드 + 본문 + 말풍선 전체 */
export type ComplaintDetailDto = ComplaintSummaryDto & {
  body: string;
  /** 오래된 순. `messages[0]` 은 접수 본문(`kind: "OPENING"`) */
  messages: ComplaintMessageDto[];
  /** 작업 의뢰로 전환됐으면 그 `WorkOrder.id` — Phase 5(T5.1)가 채운다. 지금은 항상 null */
  workOrderId: string | null;
};

/** 접수 폼의 계약 선택지 — 내가 세입자로 연결된 진행 중(ACTIVE) 계약 */
export type ComplaintLeaseOptionDto = {
  leaseId: string;
  unitLabel: string;
  buildingName: string;
  landlordName: string;
};

/** `POST /api/complaints` 응답 */
export type CreateComplaintResult = { complaint: ComplaintDetailDto };

/** `POST /api/complaints/[id]/messages` 응답 */
export type CreateComplaintMessageResult = {
  message: ComplaintMessageDto;
  complaint: ComplaintDetailDto;
};

/** `PATCH /api/complaints/[id]` 응답 */
export type UpdateComplaintStatusResult = { complaint: ComplaintDetailDto };
