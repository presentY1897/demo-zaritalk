"use server";

/**
 * 어드민 → web 크론 수동 트리거 (T1.4, 데모 시연용).
 *
 * 크론 시크릿은 **서버에서만** 읽는다. 버튼이 브라우저에서 직접 web 을 호출하면
 * `CRON_SECRET` 이 번들에 실려 나가므로, 서버 액션이 대신 호출하고 결과만 돌려준다.
 *
 * 필요한 환경변수(`.env.example` 참고):
 * - `CRON_SECRET` — web 과 **같은 값**
 * - `NEXT_PUBLIC_WEB_URL` — 호출할 web 앱 주소(로컬 기본값 http://localhost:3000)
 *
 * `"use server"` 파일은 async 함수만 export 할 수 있다 — 상수·타입은 `./shared` 에 있다.
 *
 * **T6.3 어드민 로그인**: 이 액션은 레이아웃 게이트를 거치지 않고 직접 POST 될 수 있어
 * 첫 줄에서 어드민 세션을 확인한다. 크론이 멱등이라 피해는 없었지만, "URL 만 알면 크론을
 * 돌릴 수 있다"(T1.4 문서의 경고)는 상태를 여기서 닫는다.
 */
import { requireAdminGate } from "../_shell/auth";
import { resolveWebUrl, type DailyCronSummary, type TriggerCronResult } from "./shared";

export async function getWebUrl(): Promise<string> {
  return resolveWebUrl(process.env.NEXT_PUBLIC_WEB_URL);
}

export async function triggerDailyCron(): Promise<TriggerCronResult> {
  const url = `${resolveWebUrl(process.env.NEXT_PUBLIC_WEB_URL)}/api/cron/daily`;

  const denied = await requireAdminGate();
  if (denied) return { ...denied, url };

  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return {
      ok: false,
      url,
      status: null,
      message:
        "CRON_SECRET 이 어드민에 설정돼 있지 않습니다. .env.local 에 web 과 같은 값을 넣어 주세요.",
    };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "x-cron-secret": secret },
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      url,
      status: null,
      message: `web 앱에 연결하지 못했습니다 (${detail}). NEXT_PUBLIC_WEB_URL 을 확인하세요.`,
    };
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? String(
            (body as { error?: { message?: string } }).error?.message ??
              "크론 실행이 거부되었습니다.",
          )
        : "크론 실행이 거부되었습니다.";
    return { ok: false, url, status: response.status, message };
  }

  return { ok: true, url, summary: body as DailyCronSummary };
}
