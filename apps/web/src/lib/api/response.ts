/**
 * Route Handler 공통 응답 규약([D1](../../../../docs/DECISIONS.md#-d1-api-스타일)).
 *
 * 성공: 도메인 데이터를 그대로 200(또는 201)으로 반환.
 * 실패: `{ error: { code, message, details? } }` 한 가지 형태로만 반환한다.
 * 요청 본문·쿼리 검증은 zod 4 로 하고, 실패 시 400 `VALIDATION_ERROR`.
 */
import type { ZodType } from "zod";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export type ApiErrorBody = {
  error: { code: ApiErrorCode; message: string; details?: unknown };
};

const STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, { status: 200, ...init });
}

export function created<T>(data: T): Response {
  return Response.json(data, { status: 201 });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function fail(code: ApiErrorCode, message: string, details?: unknown): Response {
  const body: ApiErrorBody = { error: { code, message, ...(details ? { details } : {}) } };
  return Response.json(body, { status: STATUS[code] });
}

/** 성공하면 `{ data }`, 실패하면 `{ response }` — 호출부에서 early return 한다. */
export type Parsed<T> = { data: T; response?: undefined } | { data?: undefined; response: Response };

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<Parsed<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { response: fail("VALIDATION_ERROR", "JSON 본문을 읽을 수 없습니다.") };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      response: fail("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", result.error.issues),
    };
  }
  return { data: result.data };
}

export function parseQuery<T>(request: Request, schema: ZodType<T>): Parsed<T> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const result = schema.safeParse(params);
  if (!result.success) {
    return {
      response: fail("VALIDATION_ERROR", "쿼리 값이 올바르지 않습니다.", result.error.issues),
    };
  }
  return { data: result.data };
}
