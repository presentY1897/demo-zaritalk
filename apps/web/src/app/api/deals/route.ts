/**
 * `GET /api/deals` — 실거래가 목록 (T4.4).
 *
 * ```
 * ?lawdCd=11200&type=JEONSE&q=자이&apt=신금호파크자이&cursor=MTEyMDB8SkVPTlNF…&limit=20
 * ```
 *
 * - **비로그인도 읽는다.** 국토부 실거래가는 공개 데이터이고 개인정보가 없다
 *   (근거는 `docs/tasks/t4.4-deals-view.md` 의 "접근 정책"). 구독 API 만 로그인을 요구한다.
 * - **캐시 우선**이다. 우리 DB(`RealTransaction`)를 먼저 읽고, 그 지역에 수집분이 한 줄도 없을
 *   때만 국토부를 부른다(최근 3개월, 쿨다운 10분). 온디맨드는 **첫 페이지에서만** 시도한다 —
 *   커서를 들고 오는 요청은 이미 목록을 보고 있다는 뜻이라 수집을 다시 걸 이유가 없다.
 * - 응답의 `sync` 가 이번 요청에서 무엇을 했는지 알려 주고, 화면이 그것을 문구로 그린다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 모르는 지역·유형, limit 범위 밖, 단지명 60자 초과 | 400 `VALIDATION_ERROR` |
 * | **다른 지역·탭의 커서 · 깨진 커서** | 400 `VALIDATION_ERROR` |
 */
import { DEFAULT_REGION_CODE } from "@/features/community/regions";
import { DEFAULT_DEAL_PAGE_SIZE, decodeDealCursor } from "@/features/deals/cursor";
import { loadDealsPage } from "@/features/deals/queries";
import { listDealsQuerySchema } from "@/features/deals/schema";
import type { RealDealTypeValue } from "@/features/deals/types";
import { fail, ok, parseQuery } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const parsed = parseQuery(request, listDealsQuerySchema);
  if (parsed.response) return parsed.response;

  const lawdCd = parsed.data.lawdCd ?? DEFAULT_REGION_CODE;
  const dealType = (parsed.data.type ?? "SALE") as RealDealTypeValue;
  const limit = parsed.data.limit ?? DEFAULT_DEAL_PAGE_SIZE;

  const cursor = parsed.data.cursor
    ? decodeDealCursor(parsed.data.cursor, { lawdCd, dealType })
    : null;
  if (parsed.data.cursor && !cursor) {
    return fail(
      "VALIDATION_ERROR",
      "커서가 이 지역·유형에 맞지 않습니다. 처음부터 다시 읽어 주세요.",
    );
  }

  const page = await loadDealsPage({
    lawdCd,
    dealType,
    q: parsed.data.q ?? null,
    apt: parsed.data.apt ?? null,
    cursor,
    limit,
    allowOnDemand: !cursor,
  });

  return ok(page);
}
