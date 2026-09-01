/**
 * 건물·호실 API 호출부 (T1.1).
 * 에러는 D1 규약대로 `{ error: { code, message } }` 한 형태라 `ApiError`(T0.4)로 바꿔 던진다.
 *
 * `features/auth/api.ts` 의 내부 `requestJson` 은 export 돼 있지 않고 그 파일은 T0.4 소유라
 * 손대지 않았다 — 같은 규약을 따르는 최소 래퍼를 여기 둔다(에러 클래스는 재사용).
 */
import { ApiError } from "@/features/auth/api";
import type {
  CreateBuildingInput,
  CreateUnitInput,
  UpdateBuildingInput,
  UpdateUnitInput,
} from "./schema";
import type { BuildingDetailDto, BuildingSummaryDto, UnitDetailDto, UnitSummaryDto } from "./types";

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

export function fetchBuildings(): Promise<BuildingSummaryDto[]> {
  return requestJson<{ buildings: BuildingSummaryDto[] }>("/api/buildings").then(
    (body) => body.buildings,
  );
}

export function fetchBuilding(id: string): Promise<BuildingDetailDto> {
  return requestJson<{ building: BuildingDetailDto }>(`/api/buildings/${id}`).then(
    (body) => body.building,
  );
}

export function fetchUnit(id: string): Promise<UnitDetailDto> {
  return requestJson<{ unit: UnitDetailDto }>(`/api/units/${id}`).then((body) => body.unit);
}

export function createBuilding(input: CreateBuildingInput): Promise<BuildingSummaryDto> {
  return requestJson<{ building: BuildingSummaryDto }>("/api/buildings", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((body) => body.building);
}

export function updateBuilding(
  id: string,
  input: UpdateBuildingInput,
): Promise<BuildingSummaryDto> {
  return requestJson<{ building: BuildingSummaryDto }>(`/api/buildings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }).then((body) => body.building);
}

export function deleteBuilding(id: string): Promise<void> {
  return requestJson<void>(`/api/buildings/${id}`, { method: "DELETE" });
}

export function createUnit(buildingId: string, input: CreateUnitInput): Promise<UnitSummaryDto> {
  return requestJson<{ unit: UnitSummaryDto }>(`/api/buildings/${buildingId}/units`, {
    method: "POST",
    body: JSON.stringify(input),
  }).then((body) => body.unit);
}

export function updateUnit(id: string, input: UpdateUnitInput): Promise<UnitDetailDto> {
  return requestJson<{ unit: UnitDetailDto }>(`/api/units/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }).then((body) => body.unit);
}

export function deleteUnit(id: string): Promise<void> {
  return requestJson<void>(`/api/units/${id}`, { method: "DELETE" });
}
