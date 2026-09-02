/**
 * 중개 요청·수신함 API 호출부 (T3.6·T3.7).
 * 에러는 D1 규약(`{ error: { code, message } }`)이라 `ApiError`(T0.4)로 바꿔 던진다.
 * 래퍼 모양은 T3.1 `features/listing/api.ts` 와 같다.
 */
import { ApiError } from "@/features/auth/api";
import type {
  CreateBrokerageRequestInput,
  RespondBrokerageTargetInput,
} from "./schema";
import type {
  BrokeragePreviewResult,
  CreateBrokerageRequestResult,
  ListBrokerageRequestsResult,
  RealtorInboxResult,
  RespondBrokerageTargetResult,
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

/** 임대인 — 내 요청 목록 + 요청을 보낼 수 있는 공실 호실 */
export function fetchBrokerageRequests(): Promise<ListBrokerageRequestsResult> {
  return requestJson<ListBrokerageRequestsResult>("/api/brokerage-requests");
}

/** 임대인 — 발송 전 대상 미리보기(쓰기 없음) */
export function fetchBrokeragePreview(unitId: string): Promise<BrokeragePreviewResult> {
  return requestJson<BrokeragePreviewResult>(
    `/api/brokerage-requests/preview?unitId=${encodeURIComponent(unitId)}`,
  );
}

/** 임대인 — 요청 발송(반경 매칭 + 타겟·알림 생성) */
export function createBrokerageRequest(
  input: CreateBrokerageRequestInput,
): Promise<CreateBrokerageRequestResult> {
  return requestJson<CreateBrokerageRequestResult>("/api/brokerage-requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** 중개인 — 받은 요청(거리 포함) */
export function fetchRealtorInbox(): Promise<RealtorInboxResult> {
  return requestJson<RealtorInboxResult>("/api/realtor/inbox");
}

/** 중개인 — 열람 표시·수락·거절 */
export function respondBrokerageTarget(
  targetId: string,
  input: RespondBrokerageTargetInput,
): Promise<RespondBrokerageTargetResult> {
  return requestJson<RespondBrokerageTargetResult>(
    `/api/brokerage-targets/${targetId}/respond`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
