/**
 * 인증·프로필 API 호출부 (T0.4).
 * 에러는 D1 규약대로 `{ error: { code, message } }` 한 형태라 여기서 `ApiError` 로 바꿔 던진다.
 */
import type { CreateProfileInput, UpdateProfileInput } from "@/features/profiles/schema";
import type {
  CreateProfileResult,
  DemoRoleValue,
  MeDto,
  OtpRequestResult,
  OtpVerifyResult,
} from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

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

export function fetchMe(): Promise<MeDto> {
  return requestJson<MeDto>("/api/me");
}

export function requestOtp(phone: string): Promise<OtpRequestResult> {
  return requestJson<OtpRequestResult>("/api/auth/otp/request", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export function verifyOtp(input: { phone: string; code: string }): Promise<OtpVerifyResult> {
  return requestJson<OtpVerifyResult>("/api/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function demoLogin(role: DemoRoleValue): Promise<MeDto> {
  return requestJson<MeDto>("/api/auth/demo-login", {
    method: "POST",
    body: JSON.stringify({ role }),
  });
}

export function logout(): Promise<void> {
  return requestJson<void>("/api/auth/logout", { method: "POST" });
}

export function createProfile(input: CreateProfileInput): Promise<CreateProfileResult> {
  return requestJson<CreateProfileResult>("/api/profiles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProfile(
  id: string,
  input: UpdateProfileInput,
): Promise<{ profile: CreateProfileResult["profile"]; me: MeDto }> {
  return requestJson(`/api/profiles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
