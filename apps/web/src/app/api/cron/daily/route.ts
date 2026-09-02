/**
 * `POST /api/cron/daily` — 일일 크론 (T1.4 원장 + T4.3 실거래가).
 *
 * 청구 생성(멱등)·이월 정정·연체 전환·만기 알림을 한 번에 돌리고, **이어서 실거래가를 수집한다.**
 * 실제 계산은 `@/lib/rent` 순수 함수, 읽고 쓰는 순서는 `@/lib/rent/cron-runner` 와
 * `@/features/deals/sync` 담당이고 이 파일은 **인증과 응답 포장**만 한다.
 *
 * - 인증: `Authorization: Bearer <CRON_SECRET>`(Vercel Cron) 또는 `x-cron-secret`(어드민·curl).
 *   없거나 틀리면 401 `UNAUTHORIZED`.
 * - **GET 도 같은 일을 한다** — Vercel Cron 은 스케줄된 경로를 GET 으로 호출한다.
 *   (`apps/web/vercel.json` 의 `crons` 참조. Hobby 플랜이라 하루 1회.)
 *
 * ## 왜 실거래가를 **같은 크론에 얹었나** (T4.3)
 *
 * `vercel.json` 의 `crons` 는 배포 설정이고 Hobby 플랜은 스케줄 수·빈도가 제한된다. 수집도
 * "하루 한 번" 이면 충분하므로 **스케줄을 늘리는 대신 이미 있는 하루치 크론에 이어 붙였다.**
 * 인증 통로도 새로 만들지 않는다 — T1.4 의 시크릿을 그대로 쓴다.
 *
 * 두 작업은 **서로를 막지 않는다**: 실거래가 수집은 어떤 실패도 던지지 않고 결과 표에 담으므로
 * 국토부가 죽어 있어도 원장 크론 결과(`ok: true` 와 기존 필드 전부)는 그대로 나간다.
 * 응답에는 기존 필드가 한 글자도 바뀌지 않고 **`deals` 블록만 추가**된다.
 *
 * 수집 대상은 스스로 고른다 — **구독 지역 + 최근 수집분이 있는 지역**(최대 20곳)의 당월·전월.
 * 서버에 `DATA_GO_KR_API_KEY` 가 없으면 국토부를 부르지 않고 `skipped: "NO_KEY"` 로 지나간다.
 */
import { getMolitServiceKey } from "@/features/deals/molit";
import { runDealsSyncCron } from "@/features/deals/sync";
import { fail, ok } from "@/lib/api/response";
import { runDailyCron } from "@/lib/rent/cron-runner";
import { authorizeCronRequest, CRON_AUTH_MESSAGE } from "./auth";

export const dynamic = "force-dynamic";

/** 응답의 `deals` 블록 — 원장 결과와 섞이지 않게 한 겹 감싼다 */
type DealsCronBlock =
  | { skipped: "NO_KEY" }
  | {
      skipped: null;
      regionsScanned: number;
      monthsScanned: number;
      requests: number;
      fetched: number;
      created: number;
      alreadyHad: number;
      discarded: number;
      failed: number;
      alertsSent: number;
      durationMs: number;
    };

async function runDealsBlock(): Promise<DealsCronBlock> {
  if (!getMolitServiceKey()) return { skipped: "NO_KEY" };
  const result = await runDealsSyncCron();
  return {
    skipped: null,
    regionsScanned: result.regionsScanned,
    monthsScanned: result.monthsScanned,
    requests: result.requests,
    fetched: result.fetched,
    created: result.created,
    alreadyHad: result.skipped,
    discarded: result.discarded,
    failed: result.failures.length,
    alertsSent: result.alertsSent,
    durationMs: result.durationMs,
  };
}

async function handle(request: Request): Promise<Response> {
  const auth = authorizeCronRequest(request);
  if (!auth.ok) return fail("UNAUTHORIZED", CRON_AUTH_MESSAGE[auth.reason]);

  const result = await runDailyCron();
  const deals = await runDealsBlock();
  return ok({ ok: true, ...result, deals });
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

/** Vercel Cron 이 GET 으로 호출하므로 같은 핸들러를 붙여 둔다. */
export async function GET(request: Request): Promise<Response> {
  return handle(request);
}
