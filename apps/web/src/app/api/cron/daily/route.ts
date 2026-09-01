/**
 * `POST /api/cron/daily` — 일일 원장 크론 (T1.4).
 *
 * 청구 생성(멱등)·이월 정정·연체 전환·만기 알림을 한 번에 돌린다. 실제 계산은
 * `@/lib/rent` 순수 함수, 읽고 쓰는 순서는 `@/lib/rent/cron-runner` 담당이고
 * 이 파일은 **인증과 응답 포장**만 한다.
 *
 * - 인증: `Authorization: Bearer <CRON_SECRET>`(Vercel Cron) 또는 `x-cron-secret`(어드민·curl).
 *   없거나 틀리면 401 `UNAUTHORIZED`.
 * - **GET 도 같은 일을 한다** — Vercel Cron 은 스케줄된 경로를 GET 으로 호출한다.
 *   (`apps/web/vercel.json` 의 `crons` 참조. Hobby 플랜이라 하루 1회.)
 */
import { fail, ok } from "@/lib/api/response";
import { runDailyCron } from "@/lib/rent/cron-runner";
import { authorizeCronRequest, CRON_AUTH_MESSAGE } from "./auth";

export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const auth = authorizeCronRequest(request);
  if (!auth.ok) return fail("UNAUTHORIZED", CRON_AUTH_MESSAGE[auth.reason]);

  const result = await runDailyCron();
  return ok({ ok: true, ...result });
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

/** Vercel Cron 이 GET 으로 호출하므로 같은 핸들러를 붙여 둔다. */
export async function GET(request: Request): Promise<Response> {
  return handle(request);
}
