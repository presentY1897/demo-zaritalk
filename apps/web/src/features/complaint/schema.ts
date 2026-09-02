/**
 * 민원 요청 스키마 (T2.6).
 *
 * `POST /api/complaints` · `POST /api/complaints/[id]/messages` · `PATCH /api/complaints/[id]` 가 공유한다.
 * `@zari/db` 를 import 하지 않는다 — 클라이언트 폼도 같은 스키마로 미리 막는다(T1.1 패턴).
 */
import { z } from "zod";
import { COMPLAINT_STATUS_TARGETS } from "./status";

const titleSchema = z
  .string()
  .trim()
  .min(2, "제목을 2자 이상 입력해 주세요.")
  .max(60, "제목은 60자 이하로 입력해 주세요.");

const bodySchema = z
  .string()
  .trim()
  .min(5, "내용을 5자 이상 입력해 주세요.")
  .max(1000, "내용은 1,000자 이하로 입력해 주세요.");

/**
 * 사진 URL 목록 — **지금은 화면에서 보내지 않는다.**
 *
 * 업로드 엔드포인트(D3 Vercel Blob)는 [T2.4](../../../../docs/tasks/t2.4-refund-apply.md) 소유이고
 * 아직 세팅 전이라, 이 task 는 사진 없이 제목·내용만으로 완결한다.
 * 다만 저장 자리(`Complaint.photos`)와 이 필드는 미리 열어 둔다 — T2.4 가 업로드 URL을
 * 돌려주기 시작하면 폼에서 그 URL 배열을 그대로 실어 보내면 되고, 서버는 손댈 것이 없다.
 */
const photosSchema = z
  .array(z.url("사진 주소가 올바르지 않습니다.").max(500))
  .max(5, "사진은 5장까지 첨부할 수 있습니다.");

/** `POST /api/complaints` 본문 */
export const createComplaintSchema = z.object({
  leaseId: z.string().min(1, "계약을 선택해 주세요."),
  title: titleSchema,
  body: bodySchema,
  photos: photosSchema.optional(),
});
export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;

/** `POST /api/complaints/[id]/messages` 본문 */
export const createComplaintMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "메시지를 입력해 주세요.")
    .max(1000, "메시지는 1,000자 이하로 입력해 주세요."),
});
export type CreateComplaintMessageInput = z.infer<typeof createComplaintMessageSchema>;

/**
 * `PATCH /api/complaints/[id]` 본문 — 임대인만 부를 수 있다.
 * `OPEN` 은 목표 상태에 없다(접수 시점 전용 — `status.ts` 전이표 참고). 보내면 400 이다.
 */
export const updateComplaintStatusSchema = z.object({
  status: z.enum(COMPLAINT_STATUS_TARGETS),
});
export type UpdateComplaintStatusInput = z.infer<typeof updateComplaintStatusSchema>;

/** `GET /api/complaints` 쿼리 — 어느 쪽 시점으로 볼지. 생략하면 내 프로필로 정한다 */
export const listComplaintsQuerySchema = z.object({
  role: z.enum(["tenant", "landlord"]).optional(),
});
export type ListComplaintsQuery = z.infer<typeof listComplaintsQuerySchema>;
