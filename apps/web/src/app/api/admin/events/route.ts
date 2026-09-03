/**
 * `GET /api/admin/events` — 트래킹 이벤트 로그 + **시간대별 카운트** (T6.3).
 *
 * - `?name=page_view,signup_start` — 콤마로 여러 개. 선택지는 응답의 `names` 가 준다
 * - `?from=2026-09-01&to=2026-09-03` — **KST 달력 날짜**, 끝 날짜 포함. 생략하면 최근 7일
 * - `hourly` 는 필터를 적용한 전체(페이지가 아니라)의 **KST 0~23시** 히스토그램이다
 *
 * 시각 → KST 시 변환은 원장 엔진의 `KST_OFFSET_MS` 를 그대로 쓴다(`features/admin/period.ts`) —
 * SQL 에 `interval '9 hours'` 를 또 적어 타임존 규칙을 두 벌로 만들지 않는다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 세션도 시크릿도 없음 | 401 `UNAUTHORIZED` |
 * | 비어드민 세션 | 403 `FORBIDDEN` |
 * | `page`·`pageSize` 범위 밖 | 400 `VALIDATION_ERROR` |
 *
 * (`from`·`to` 는 형식이 틀리면 400 이 아니라 **기본 구간으로 떨어진다** — 화면이 막히지 않게)
 */
import { requireAdmin } from "@/features/admin/guard";
import { listAdminEvents } from "@/features/admin/queries";
import { defaultEventRange } from "@/features/admin/period";
import { adminEventsQuerySchema } from "@/features/admin/schema";
import { ok, parseQuery } from "@/lib/api/response";

export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdmin(request);
  if (admin.response) return admin.response;

  const parsed = parseQuery(request, adminEventsQuerySchema);
  if (parsed.response) return parsed.response;

  const fallback = defaultEventRange();
  return ok(
    await listAdminEvents({
      ...parsed.data,
      from: parsed.data.from ?? fallback.from,
      to: parsed.data.to ?? fallback.to,
    }),
  );
}
