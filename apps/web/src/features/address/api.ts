/**
 * 주소 검색 fetch 래퍼 (T3.1·T3.4) — 우리 프록시(`/api/address/*`)만 부른다.
 * 카카오를 직접 부르지 않는다(REST 키는 서버 전용).
 */
import { ApiError } from "@/features/auth/api";
import type { AddressSearchResponse, ReverseAddressResponse } from "./types";

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string } })?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? "주소를 검색하지 못했습니다.",
    );
  }
  return body as T;
}

export function searchAddresses(query: string, size?: number): Promise<AddressSearchResponse> {
  const params = new URLSearchParams({ query });
  if (size) params.set("size", String(size));
  return requestJson<AddressSearchResponse>(`/api/address/search?${params}`);
}

export function reverseAddress(lat: number, lng: number): Promise<ReverseAddressResponse> {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  return requestJson<ReverseAddressResponse>(`/api/address/reverse?${params}`);
}
