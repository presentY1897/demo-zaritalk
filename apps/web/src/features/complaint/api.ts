/**
 * 민원 API 호출부 (T2.6).
 * 에러는 D1 규약대로 `{ error: { code, message } }` 한 형태라 `ApiError`(T0.4)로 바꿔 던진다.
 * 래퍼 모양은 T1.2 `features/lease/api.ts` · T1.3 `features/tenant/api.ts` 와 같다.
 */
import { ApiError } from "@/features/auth/api";
import type {
  CreateComplaintInput,
  CreateComplaintMessageInput,
  UpdateComplaintStatusInput,
} from "./schema";
import type {
  ComplaintDetailDto,
  ComplaintMessageDto,
  ComplaintSummaryDto,
  ComplaintParty,
} from "./types";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });

  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? "요청을 처리하지 못했습니다.",
      error?.details,
    );
  }
  return body as T;
}

const roleQuery: Record<ComplaintParty, string> = { TENANT: "tenant", LANDLORD: "landlord" };

export function fetchComplaints(role: ComplaintParty): Promise<ComplaintSummaryDto[]> {
  return requestJson<{ complaints: ComplaintSummaryDto[] }>(
    `/api/complaints?role=${roleQuery[role]}`,
  ).then((body) => body.complaints);
}

export function createComplaint(input: CreateComplaintInput): Promise<ComplaintDetailDto> {
  return requestJson<{ complaint: ComplaintDetailDto }>("/api/complaints", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((body) => body.complaint);
}

export function sendComplaintMessage(
  complaintId: string,
  input: CreateComplaintMessageInput,
): Promise<{ message: ComplaintMessageDto; complaint: ComplaintDetailDto }> {
  return requestJson(`/api/complaints/${complaintId}/messages`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateComplaintStatus(
  complaintId: string,
  input: UpdateComplaintStatusInput,
): Promise<ComplaintDetailDto> {
  return requestJson<{ complaint: ComplaintDetailDto }>(`/api/complaints/${complaintId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }).then((body) => body.complaint);
}
