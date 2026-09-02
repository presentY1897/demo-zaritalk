"use server";

/**
 * 어드민 → web 실거래가 수집 트리거 (T4.3, 데모 시연용).
 *
 * 크론 시크릿은 **서버에서만** 읽는다 — 버튼이 브라우저에서 직접 web 을 호출하면
 * `CRON_SECRET` 이 번들에 실려 나가므로, 서버 액션이 대신 호출하고 결과만 돌려준다.
 * (T1.4 `/cron` 트리거와 **완전히 같은 구조**다 — 인증을 새로 만들지 않았다.)
 *
 * 필요한 환경변수(`.env.example` 참고):
 * - `CRON_SECRET` — web 과 **같은 값**
 * - `NEXT_PUBLIC_WEB_URL` — 호출할 web 앱 주소(로컬 기본값 http://localhost:3000)
 *
 * `"use server"` 파일은 async 함수만 export 할 수 있다 — 상수·타입은 `./shared` 에 있다.
 */
import { resolveWebUrl, type DealSyncSummary, type TriggerDealSyncResult } from "./shared";

export async function getWebUrl(): Promise<string> {
  return resolveWebUrl(process.env.NEXT_PUBLIC_WEB_URL);
}

export async function triggerDealSync(input: {
  lawdCd: string;
  months: string[];
}): Promise<TriggerDealSyncResult> {
  const url = `${resolveWebUrl(process.env.NEXT_PUBLIC_WEB_URL)}/api/deals/sync`;
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

  const body: Record<string, unknown> = {};
  if (input.lawdCd) body.lawdCd = input.lawdCd;
  if (input.months.length > 0) body.months = input.months;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "x-cron-secret": secret, "content-type": "application/json" },
      body: JSON.stringify(body),
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

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "error" in payload
        ? String(
            (payload as { error?: { message?: string } }).error?.message ??
              "수집 요청이 거부되었습니다.",
          )
        : "수집 요청이 거부되었습니다.";
    return { ok: false, url, status: response.status, message };
  }

  return { ok: true, url, summary: payload as DealSyncSummary };
}
