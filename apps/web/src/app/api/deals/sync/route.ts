/**
 * `POST /api/deals/sync` — 국토부 실거래가 수집 (T4.3).
 *
 * **크론 · 어드민 수동 트리거 · curl 이 같이 쓰는 하나의 엔드포인트**다. 온디맨드(화면 첫 조회)만
 * 예외로 HTTP 를 거치지 않고 `runDealsSync()` 를 서버 안에서 직접 부른다(왕복·인증이 필요 없다).
 *
 * ## 인증 — 새로 만들지 않았다
 *
 * `x-cron-secret`·`Authorization: Bearer <CRON_SECRET>`(T1.4) **또는** 어드민 세션(`isAdmin`)·
 * `x-admin-secret`(T2.5). 판정은 `features/deals/ownership.ts` 한 곳이다.
 *
 * ## 본문 — 전부 선택
 *
 * ```jsonc
 * { "lawdCd": "11200",              // 생략 → 구독 지역 + 최근 수집 지역(최대 20곳)
 *   "months": ["202608", "202609"], // 생략 → 당월 + 전월
 *   "dealTypes": ["SALE"] }         // 생략 → 매매·전세·월세 전부
 * ```
 *
 * 본문이 아예 없어도 된다(`Content-Length: 0`) — 크론이 그렇게 부른다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 시크릿 없음·틀림, 비로그인 | 401 `UNAUTHORIZED` |
 * | 비어드민 세션, `isAdmin` 계정 없음 | 403 `FORBIDDEN` |
 * | 모르는 지역, `YYYYMM` 아닌 월, 모르는 유형 | 400 `VALIDATION_ERROR` |
 *
 * **부분 실패는 200 이다.** 한 (지역·월·엔드포인트)가 죽어도 나머지는 저장되고, 실패는
 * `failures[]` 에 그대로 실려 온다 — 어드민 표가 그것을 보여 준다.
 */
import { requireDealsSyncCaller } from "@/features/deals/ownership";
import { syncDealsSchema } from "@/features/deals/schema";
import { runDealsSync } from "@/features/deals/sync";
import type { RealDealTypeValue } from "@/features/deals/types";
import { fail, ok } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const caller = await requireDealsSyncCaller(request);
  if (caller.response) return caller.response;

  // 본문 없이 부르는 것을 허용한다(크론) — 빈 본문은 `{}` 로 본다
  const text = await request.text().catch(() => "");
  let raw: unknown = {};
  if (text.trim() !== "") {
    try {
      raw = JSON.parse(text);
    } catch {
      return fail("VALIDATION_ERROR", "JSON 본문을 읽을 수 없습니다.");
    }
  }

  const parsed = syncDealsSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", parsed.error.issues);
  }

  const result = await runDealsSync({
    lawdCds: parsed.data.lawdCd ? [parsed.data.lawdCd] : undefined,
    months: parsed.data.months,
    dealTypes: parsed.data.dealTypes as RealDealTypeValue[] | undefined,
  });

  return ok({ ...result, triggeredBy: caller.data.via });
}
