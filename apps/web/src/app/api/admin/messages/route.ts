/**
 * `GET /api/admin/messages` — 알림톡 시뮬 발송 이력 전체 (T6.3).
 *
 * 임대인 화면(`GET /api/landlord/messages`, T1.7)이 "내 건물" 로 좁혀 보는 것과 달리
 * 여기는 **전부** 본다 — OTP·중개 요청·작업 의뢰까지.
 *
 * - `?kind=RENT_NOTICE,OTP` · `?opened=opened|unopened|all` · `?q=`(수신 번호)
 * - 응답의 `body` 는 미리보기(알림톡 말풍선)에 그대로 쓴다. **OTP 본문의 인증번호는 가려서** 온다
 *   (`features/admin/mask.ts`) — 로그를 보는 것만으로 남의 계정에 들어갈 수 있기 때문이다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 세션도 시크릿도 없음 | 401 `UNAUTHORIZED` |
 * | 비어드민 세션 | 403 `FORBIDDEN` |
 * | `opened` 가 세 값이 아님 · `page`·`pageSize` 범위 밖 | 400 `VALIDATION_ERROR` |
 */
import { requireAdmin } from "@/features/admin/guard";
import { listAdminMessages } from "@/features/admin/queries";
import { adminMessagesQuerySchema } from "@/features/admin/schema";
import { ok, parseQuery } from "@/lib/api/response";

export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdmin(request);
  if (admin.response) return admin.response;

  const parsed = parseQuery(request, adminMessagesQuerySchema);
  if (parsed.response) return parsed.response;

  return ok(await listAdminMessages(parsed.data));
}
