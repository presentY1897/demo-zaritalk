/**
 * 공개 고지서 토큰 (T1.7 · T1.8).
 *
 * `MessageLog.token` 은 `@unique` 다. 토큰만 알면 **비로그인으로 청구 내역이 열리므로**
 * 추측 가능한 값(계약 id·순번)을 쓰지 않는다 — 128비트 난수를 32자 hex 로 쓴다.
 * (시드의 `demo-notice-hong` 처럼 사람이 읽는 토큰은 데모 고정 링크용 예외다.)
 */

/** 발급 형식: UUID v4 에서 하이픈을 뺀 32자 hex — anonId(T0.7)와 같은 형식이다. */
const TOKEN_PATTERN = /^[0-9a-z][0-9a-z-]{7,63}$/;

export function createNoticeToken(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

/**
 * URL 로 들어온 토큰이 우리가 다룰 형태인가 — 길이·문자를 제한해 DB 조회 전에 거른다.
 * 시드 토큰(`demo-notice-hong`)처럼 하이픈이 섞인 값도 통과해야 한다.
 */
export function isNoticeTokenShape(value: string | null | undefined): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}
