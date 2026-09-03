/**
 * `POST /api/brokerage-targets/[id]/respond` — 중개인의 **열람·수락·거절** (T3.7).
 *
 * 상태 전이 규칙은 `features/brokerage/status.ts` 의 전이표 **한 곳**에 있고
 * (`SENT → VIEWED → ACCEPTED | DECLINED`), 적용은 `features/brokerage/respond.ts` 가 한다.
 *
 * `VIEWED` 까지 이 라우트가 받는 이유: 상태를 옮기는 길이 둘이면 규칙이 둘로 갈라진다.
 * 열람은 **멱등**이라 이미 열어본 요청에 다시 보내도 200 이고 아무 것도 바뀌지 않는다.
 *
 * 수락은 세 가지를 함께 한다 — 타겟 `ACCEPTED`(+`respondedAt`) · **첫 수락이면 요청 `MATCHED`** ·
 * 임대인 알림톡 시뮬. 그리고 그 순간 T3.1 이 열어 둔 **매물 등록 권한**
 * (`hasAcceptedBrokerage`)이 코드 변경 없이 열린다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 중개인 프로필·활동지역 없음 | 403 `FORBIDDEN` |
 * | 없는 타겟 id | 404 `NOT_FOUND` |
 * | **다른 중개인에게 간 타겟** | 403 `FORBIDDEN` |
 * | 전이표가 막는 상태 변경(안 보고 수락·이미 응답함) | 409 `CONFLICT` |
 * | 모르는 상태 값 | 400 `VALIDATION_ERROR` |
 */
import { requireOwnedTarget, requireRealtor } from "@/features/brokerage/ownership";
import { getRealtorInboxItem } from "@/features/brokerage/queries";
import { applyBrokerageResponse } from "@/features/brokerage/respond";
import { respondBrokerageTargetSchema } from "@/features/brokerage/schema";
import { fail, ok, parseJson } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  const realtor = await requireRealtor();
  if (realtor.response) return realtor.response;

  const parsed = await parseJson(request, respondBrokerageTargetSchema);
  if (parsed.response) return parsed.response;

  const target = await requireOwnedTarget(realtor.data, id);
  if (target.response) return target.response;

  const outcome = await applyBrokerageResponse(target.data, parsed.data.status);
  if (!outcome.ok) return fail("CONFLICT", outcome.reason);

  const item = await getRealtorInboxItem(realtor.data, id);
  if (!item) return fail("INTERNAL_ERROR", "응답을 저장하지 못했습니다.");
  return ok({ target: item, matched: outcome.matched });
}
