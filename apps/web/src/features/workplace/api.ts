/**
 * 근무지 API 호출부 (T3.4). 에러는 D1 규약이라 `ApiError`(T0.4)로 바꿔 던진다.
 */
import { ApiError } from "@/features/auth/api";
import type { CreateWorkplaceInput, UpdateWorkplaceInput } from "./schema";
import type { WorkplaceDto } from "./types";

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

export function fetchWorkplaces(): Promise<WorkplaceDto[]> {
  return requestJson<{ workplaces: WorkplaceDto[] }>("/api/workplaces").then(
    (body) => body.workplaces,
  );
}

export function createWorkplace(input: CreateWorkplaceInput): Promise<WorkplaceDto> {
  return requestJson<{ workplace: WorkplaceDto }>("/api/workplaces", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((body) => body.workplace);
}

export function updateWorkplace(id: string, input: UpdateWorkplaceInput): Promise<WorkplaceDto> {
  return requestJson<{ workplace: WorkplaceDto }>(`/api/workplaces/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }).then((body) => body.workplace);
}

export function deleteWorkplace(id: string): Promise<void> {
  return requestJson<void>(`/api/workplaces/${id}`, { method: "DELETE" });
}
