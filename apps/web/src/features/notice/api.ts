/**
 * 고지서 API 호출부 (T1.7 · T1.8).
 * 에러는 D1 규약대로 `{ error: { code, message } }` 한 형태라 `ApiError`(T0.4)로 바꿔 던진다.
 */
import { ApiError } from "@/features/auth/api";
import type { NoticeCtaVariant } from "./cta";
import type { SendNoticeInput } from "./schema";
import type { MessageLogDto, NoticeTargetDto, PublicNoticeDto } from "./types";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });

  if (response.status === 204) return undefined as T;

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

/** 발송 시트가 쓰는 계약 정보 */
export function fetchNoticeTarget(leaseId: string): Promise<NoticeTargetDto> {
  return requestJson<{ target: NoticeTargetDto }>(`/api/leases/${leaseId}/notices`).then(
    (body) => body.target,
  );
}

export function sendNotice(
  leaseId: string,
  input: SendNoticeInput,
): Promise<{ message: MessageLogDto; noticeUrl: string }> {
  return requestJson<{ message: MessageLogDto; noticeUrl: string }>(
    `/api/leases/${leaseId}/notices`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function fetchLandlordMessages(params: { leaseId?: string } = {}): Promise<MessageLogDto[]> {
  const query = params.leaseId ? `?leaseId=${encodeURIComponent(params.leaseId)}` : "";
  return requestJson<{ messages: MessageLogDto[] }>(`/api/landlord/messages${query}`).then(
    (body) => body.messages,
  );
}

/**
 * 공개 고지서 조회 — **열람 기록(openedAt)과 `notice_view` 적재가 이 호출에서 일어난다.**
 * 페이지는 이미 서버에서 그려져 있으므로, 이 호출은 "사람이 실제로 열었다"는 신호를 남기는 용도다.
 */
export function fetchPublicNotice(
  token: string,
  variant?: NoticeCtaVariant,
): Promise<PublicNoticeDto> {
  const query = variant ? `?variant=${variant}` : "";
  return requestJson<{ notice: PublicNoticeDto }>(`/api/notices/${token}${query}`).then(
    (body) => body.notice,
  );
}
