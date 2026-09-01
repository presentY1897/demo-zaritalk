/**
 * 크론 엔드포인트 인증 (T1.4).
 *
 * 두 가지 호출자를 모두 받는다:
 * | 호출자 | 헤더 |
 * |---|---|
 * | Vercel Cron | `Authorization: Bearer <CRON_SECRET>` — Vercel 이 `CRON_SECRET` 환경변수가 있으면 이렇게 붙여 준다 |
 * | 어드민 수동 트리거 · curl | `x-cron-secret: <CRON_SECRET>` |
 *
 * `x-vercel-cron` 헤더는 **인증으로 쓰지 않는다** — 아무나 붙일 수 있는 값이다.
 * `CRON_SECRET` 이 아예 설정돼 있지 않으면 열린 엔드포인트가 되므로 그 경우도 401 로 막는다.
 */

export const CRON_SECRET_HEADER = "x-cron-secret";

export type CronAuthResult =
  | { ok: true }
  | { ok: false; reason: "SECRET_NOT_CONFIGURED" | "MISSING_CREDENTIAL" | "INVALID_CREDENTIAL" };

/** 길이가 같을 때 조기 종료하지 않는 비교 — 시크릿 값을 타이밍으로 흘리지 않는다. */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 요청에서 제시된 시크릿을 뽑는다. 전용 헤더가 우선, 없으면 Bearer 토큰. */
function readPresentedSecret(request: Request): string | null {
  const direct = request.headers.get(CRON_SECRET_HEADER);
  if (direct) return direct;

  const authorization = request.headers.get("authorization");
  if (authorization && /^bearer\s+/i.test(authorization)) {
    return authorization.replace(/^bearer\s+/i, "");
  }
  return null;
}

export function authorizeCronRequest(
  request: Request,
  secret: string | undefined = process.env.CRON_SECRET,
): CronAuthResult {
  if (!secret) return { ok: false, reason: "SECRET_NOT_CONFIGURED" };

  const presented = readPresentedSecret(request);
  if (!presented) return { ok: false, reason: "MISSING_CREDENTIAL" };
  if (!constantTimeEquals(presented, secret)) return { ok: false, reason: "INVALID_CREDENTIAL" };
  return { ok: true };
}

export const CRON_AUTH_MESSAGE: Record<
  Exclude<CronAuthResult, { ok: true }>["reason"],
  string
> = {
  SECRET_NOT_CONFIGURED: "CRON_SECRET 이 설정되지 않아 크론을 실행할 수 없습니다.",
  MISSING_CREDENTIAL: "크론 시크릿 헤더가 없습니다.",
  INVALID_CREDENTIAL: "크론 시크릿이 올바르지 않습니다.",
};
