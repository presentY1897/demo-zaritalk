/**
 * `GET·POST·DELETE /api/transaction-alerts` — 실거래가 알림 구독 CRUD (T4.4).
 *
 * 구독은 "누구의" 가 곧 데이터라 **로그인이 필요하다**(조회 화면은 공개다 — `GET /api/deals` 참고).
 * 만들 때 주인은 **활성 프로필**(T0.5 쿠키)이고, 목록·삭제는 **계정의 모든 프로필**을 본다
 * (T4.1 의 "쓰기는 활성 프로필, 소유는 계정" 규칙 그대로).
 *
 * ```jsonc
 * // POST 본문 — 지역만 필수. 비운 칸은 "전부" 라는 뜻이다
 * { "lawdCd": "11200", "aptName": "신금호파크자이", "dealType": "JEONSE" }
 *
 * // 201 (새로 만들었을 때) · 200 (같은 조합이 이미 있을 때)
 * { "alert": { "id": "cmf0…", "summary": "서울 성동구 · 신금호파크자이 · 전세", … },
 *   "duplicated": false }
 *
 * // DELETE /api/transaction-alerts?id=cmf0…
 * { "deleted": true, "alertId": "cmf0…" }
 * ```
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 프로필 없음(온보딩 전) | 403 `FORBIDDEN` |
 * | 모르는 지역·유형, 단지명 60자 초과, `id` 없음 | 400 `VALIDATION_ERROR` |
 * | 없는 구독 | 404 `NOT_FOUND` |
 * | **남의 구독 삭제** | 403 `FORBIDDEN` |
 * | 계정당 구독 20개 초과 | 409 `CONFLICT` |
 *
 * **같은 조합을 두 번 만들어도 구독은 하나다** — `features/deals/subscriptions.ts` 가
 * advisory 락으로 막는다(nullable 컬럼이 섞인 `@@unique` 는 Postgres 에서 NULL 을 못 막는다).
 */
import { requireAlertProfile, requireOwnAlert } from "@/features/deals/ownership";
import { createAlertSchema, deleteAlertQuerySchema } from "@/features/deals/schema";
import { createAlert, deleteAlert, listAlerts, MAX_ALERTS_PER_ACCOUNT } from "@/features/deals/subscriptions";
import type { RealDealTypeValue } from "@/features/deals/types";
import { created, fail, ok, parseJson, parseQuery } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await requireAlertProfile();
  if (session.response) return session.response;

  return ok({ alerts: await listAlerts(session.data.profileIds) });
}

export async function POST(request: Request): Promise<Response> {
  const session = await requireAlertProfile();
  if (session.response) return session.response;

  const parsed = await parseJson(request, createAlertSchema);
  if (parsed.response) return parsed.response;

  const result = await createAlert({
    profileId: session.data.profile.id,
    profileIds: session.data.profileIds,
    lawdCd: parsed.data.lawdCd,
    aptName: parsed.data.aptName ?? null,
    dealType: (parsed.data.dealType ?? null) as RealDealTypeValue | null,
  });

  if (!result.ok) {
    return fail(
      "CONFLICT",
      `알림 구독은 계정당 ${MAX_ALERTS_PER_ACCOUNT}개까지 만들 수 있습니다. 쓰지 않는 구독을 지워 주세요.`,
    );
  }

  const body = { alert: result.alert, duplicated: result.duplicated };
  return result.duplicated ? ok(body) : created(body);
}

export async function DELETE(request: Request): Promise<Response> {
  const session = await requireAlertProfile();
  if (session.response) return session.response;

  const parsed = parseQuery(request, deleteAlertQuerySchema);
  if (parsed.response) return parsed.response;

  const owned = await requireOwnAlert(session.data, parsed.data.id);
  if (owned.response) return owned.response;

  await deleteAlert(owned.data.id);
  return ok({ deleted: true, alertId: owned.data.id });
}
