/**
 * 익명 방문자 식별자(anonId) — 1st-party 쿠키(T0.7).
 *
 * **왜 서버(proxy)가 굽는가**: `document.cookie` 로 굽는 클라이언트 쿠키는 Safari ITP 에서
 * 7일 만에 만료된다. 같은 도메인의 서버가 `Set-Cookie` 로 내려주는 1st-party 쿠키는
 * 그 제한을 받지 않아 방문자 식별이 오래 유지된다 — 그로스 퍼널(D2)의 전제.
 *
 * **왜 httpOnly=false 인가**: anonId 는 인증 수단이 아니라 "이 브라우저"라는 라벨일 뿐이라
 * 노출돼도 권한이 따라오지 않는다. 반대로 A/B 배정 조회·클라이언트 진단에서 읽을 수 있어야
 * 쓸모가 있다. 로그인 세션 토큰(`zari_session`)은 T0.3 에서 httpOnly 로 굽는다 — 둘을 섞지 않는다.
 *
 * 이 모듈은 순수 함수만 둔다(next/headers 의존 없음). proxy·Route Handler·테스트가 함께 쓴다.
 */

/** anonId 쿠키 이름 */
export const ANON_ID_COOKIE = "zari_anon";

/** 쿠키 수명 — 1년 */
export const ANON_ID_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** 발급 형식: UUID v4 에서 하이픈을 뺀 32자 hex */
const ANON_ID_PATTERN = /^[0-9a-f]{32}$/;

/** proxy 와 Route Handler 가 같은 옵션으로 굽도록 한 곳에 모아둔다. */
export const anonIdCookieOptions = {
  path: "/",
  maxAge: ANON_ID_MAX_AGE_SECONDS,
  sameSite: "lax",
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
} as const;

export function createAnonId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

/** 우리가 발급한 형식인지 — 아니면 proxy 가 새로 발급한다(쿠키 오염 방지). */
export function isAnonId(value: string | null | undefined): value is string {
  return typeof value === "string" && ANON_ID_PATTERN.test(value);
}

/**
 * `Cookie` 요청 헤더에서 anonId 를 읽는다.
 * Route Handler 는 `Request` 만으로 동작해야 테스트에서 직접 호출할 수 있어(D8)
 * `next/headers` 대신 헤더를 직접 판다.
 */
export function readAnonIdFromCookieHeader(header: string | null | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== ANON_ID_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    if (isAnonId(value)) return value;
  }
  return undefined;
}

/**
 * `Set-Cookie` 헤더 문자열. 공용 `ok()` 가 만든 Response 에 헤더로 붙이기 위해 직접 만든다
 * (`cookies().set()` 은 Response 를 우리가 만드는 경우엔 쓰지 않는다).
 */
export function serializeAnonIdCookie(anonId: string): string {
  const parts = [
    `${ANON_ID_COOKIE}=${anonId}`,
    `Path=${anonIdCookieOptions.path}`,
    `Max-Age=${anonIdCookieOptions.maxAge}`,
    "SameSite=Lax",
  ];
  if (anonIdCookieOptions.secure) parts.push("Secure");
  return parts.join("; ");
}
