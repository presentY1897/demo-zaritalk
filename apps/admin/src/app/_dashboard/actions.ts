"use server";

/**
 * 어드민 → web 지표 조회 (T6.2).
 *
 * ## 어드민 앱에는 로그인이 없다 (T6.3 범위)
 *
 * 그래서 브라우저가 web API 를 직접 부를 수 없다 — 세션 쿠키가 없어서 **401** 이다.
 * 대신 **서버 액션**이 대신 부르고 `x-admin-secret` 헤더를 붙인다. T2.5 환급 심사·T4.2 신고
 * 처리와 **완전히 같은 구조**이고, 시크릿은 어드민 서버에만 있어 브라우저 번들에 실리지 않는다.
 *
 * **판정은 web 이 한다.** 시크릿이 맞아도 web 은 DB 에서 `isAdmin: true` 인 계정을 찾고,
 * 없으면 403 이다(`apps/web/src/features/metrics/ownership.ts` → T2.5 `requireRefundAdmin`).
 * T6.3 이 어드민 로그인을 붙이면 이 파일이 세션 쿠키를 전달하는 것으로 바뀐다.
 *
 * 필요한 환경변수(`.env.example` 의 크론 항목과 같은 값이면 된다):
 * - `ADMIN_API_SECRET` — 없으면 `CRON_SECRET` 을 쓴다(web 과 **같은 값**)
 * - `NEXT_PUBLIC_WEB_URL` — 호출할 web 앱 주소(로컬 기본값 http://localhost:3000)
 */
import { resolveWebUrl } from "../cron/shared";
import type {
  FunnelFetchResult,
  FunnelResult,
  MetricsOverview,
  OverviewResult,
} from "./shared";

const SECRET_HEADER = "x-admin-secret";

const MISSING_SECRET =
  "ADMIN_API_SECRET(또는 CRON_SECRET)이 어드민에 설정돼 있지 않습니다. .env.local 에 web 과 같은 값을 넣어 주세요.";

function adminSecret(): string | undefined {
  return process.env.ADMIN_API_SECRET || process.env.CRON_SECRET || undefined;
}

function errorMessage(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = (body as { error?: { message?: string } }).error;
    if (error?.message) return error.message;
  }
  return fallback;
}

/** web API 호출 한 번 — 시크릿·JSON·에러 처리를 한 곳에 모은다 */
async function callWeb(
  path: string,
): Promise<{ ok: true; body: unknown } | { ok: false; status: number | null; message: string }> {
  const secret = adminSecret();
  if (!secret) return { ok: false, status: null, message: MISSING_SECRET };

  let response: Response;
  try {
    response = await fetch(`${resolveWebUrl(process.env.NEXT_PUBLIC_WEB_URL)}${path}`, {
      headers: { [SECRET_HEADER]: secret },
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: null,
      message: `web 앱에 연결하지 못했습니다 (${detail}). NEXT_PUBLIC_WEB_URL 을 확인하세요.`,
    };
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, status: response.status, message: errorMessage(body, "요청이 거부되었습니다.") };
  }
  return { ok: true, body };
}

export async function fetchMetricsOverview(range: {
  days: number;
  months: number;
}): Promise<OverviewResult> {
  const query = new URLSearchParams({ days: String(range.days), months: String(range.months) });
  const result = await callWeb(`/api/admin/metrics/overview?${query.toString()}`);
  if (!result.ok) return result;
  return { ok: true, overview: result.body as MetricsOverview };
}

export async function fetchMetricsFunnel(experiment?: string): Promise<FunnelFetchResult> {
  const query = experiment ? `?experiment=${encodeURIComponent(experiment)}` : "";
  const result = await callWeb(`/api/admin/metrics/funnel${query}`);
  if (!result.ok) return result;
  return { ok: true, funnel: (result.body as { funnel: FunnelResult }).funnel };
}
