"use server";

/**
 * 어드민 → web 신고 처리 호출 (T4.2).
 *
 * ## 어드민 앱에는 로그인이 없다 (T6.3 범위)
 *
 * 그래서 브라우저가 web API 를 직접 부를 수 없다 — 세션 쿠키가 없어서 **401** 이다.
 * 대신 **서버 액션**이 대신 부르고, 요청에 `x-admin-secret` 헤더를 붙인다.
 * T1.4 크론 트리거·T2.5 환급 심사와 **완전히 같은 방식**이고, 시크릿은 어드민 **서버에만** 있어
 * 브라우저 번들에 실리지 않는다.
 *
 * **판정은 web 이 한다.** 시크릿이 맞아도 web 은 DB 에서 `isAdmin: true` 인 계정을 찾아
 * 그 사람을 처리자(`Report.handledById`)로 기록한다 — 관리자 계정이 하나도 없으면 403 이다
 * (`apps/web/src/features/community/ownership.ts` → `features/refund/ownership.ts` 참고).
 * 어드민 로그인이 붙으면(T6.3) 이 파일은 세션 쿠키를 전달하는 것으로 바뀐다.
 *

 * ## 어드민 로그인이 붙었다 (T6.3)
 *
 * 이 파일의 서버 액션은 **레이아웃 게이트를 거치지 않고도 POST 로 직접 불릴 수 있다.**
 * 그래서 액션마다 첫 줄에서 `requireAdminGate()` 로 어드민 세션을 확인한다.
 * web 호출 방식(서비스 시크릿)은 **그대로 두었다** — 시크릿은 신분이 아니라 통로의 자격이고,
 * web 은 여전히 `isAdmin` 계정을 찾아 행위자로 기록한다(설계 근거는 `_shell/auth.ts`).
 *
 * 필요한 환경변수(`.env.example` 의 크론 항목과 같은 값이면 된다):
 * - `ADMIN_API_SECRET` — 없으면 `CRON_SECRET` 을 쓴다(web 과 **같은 값**)
 * - `NEXT_PUBLIC_WEB_URL` — 호출할 web 앱 주소(로컬 기본값 http://localhost:3000)
 */
import { requireAdminGate } from "../_shell/auth";
import { resolveWebUrl } from "../cron/shared";
import type { AdminReportItem, QueueResult, ReportActionResult } from "./shared";

const SECRET_HEADER = "x-admin-secret";

function webBase(): string {
  return resolveWebUrl(process.env.NEXT_PUBLIC_WEB_URL);
}

function adminSecret(): string | undefined {
  return process.env.ADMIN_API_SECRET || process.env.CRON_SECRET || undefined;
}

const MISSING_SECRET =
  "ADMIN_API_SECRET(또는 CRON_SECRET)이 어드민에 설정돼 있지 않습니다. .env.local 에 web 과 같은 값을 넣어 주세요.";

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
  init: RequestInit,
): Promise<{ ok: true; body: unknown } | { ok: false; status: number | null; message: string }> {
  const secret = adminSecret();
  if (!secret) return { ok: false, status: null, message: MISSING_SECRET };

  let response: Response;
  try {
    response = await fetch(`${webBase()}${path}`, {
      ...init,
      headers: { ...init.headers, [SECRET_HEADER]: secret },
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
    return {
      ok: false,
      status: response.status,
      message: errorMessage(body, "요청이 거부되었습니다."),
    };
  }
  return { ok: true, body };
}

/** 신고 큐 조회 — 상태 필터는 web 의 `?status=` 쿼리로 넘긴다 */
export async function fetchReportQueue(statuses: string[]): Promise<QueueResult> {
  const denied = await requireAdminGate();
  if (denied) return denied;

  const query = new URLSearchParams({ status: statuses.join(",") });
  const result = await callWeb(`/api/reports?${query.toString()}`, { method: "GET" });
  if (!result.ok) return result;

  const body = result.body as { reports?: AdminReportItem[]; counts?: Record<string, number> };
  return { ok: true, reports: body.reports ?? [], counts: body.counts ?? {} };
}

/**
 * 신고 처리 — **액션 이름만** 보낸다.
 * 무엇이 바뀌는지(대상 블라인드·형제 신고 종결)는 web 이 정한다(여기에 규칙을 두지 않는다).
 */
export async function runReportAction(input: {
  reportId: string;
  action: string;
}): Promise<ReportActionResult> {
  const denied = await requireAdminGate();
  if (denied) return denied;

  const result = await callWeb(`/api/reports/${input.reportId}/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: input.action }),
  });
  if (!result.ok) return result;

  const body = result.body as { report: AdminReportItem; alsoClosedReportIds?: string[] };
  return { ok: true, report: body.report, alsoClosedReportIds: body.alsoClosedReportIds ?? [] };
}
