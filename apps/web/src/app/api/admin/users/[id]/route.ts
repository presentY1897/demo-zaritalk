/**
 * `GET /api/admin/users/[id]` — 회원 상세: 프로필 · 계약(양쪽 역할) · 이력 타임라인 (T6.3).
 *
 * 타임라인은 전용 감사 로그 테이블이 없어(T2.4·T4.2 가 같은 이유로 미뤘다) 각 도메인의
 * 시각 컬럼을 시간순으로 합친 것이다 — 가입·프로필·계약·환급·민원·신고·수신 발송.
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 세션도 시크릿도 없음 | 401 `UNAUTHORIZED` |
 * | 비어드민 세션 | 403 `FORBIDDEN` |
 * | 없는 회원 | 404 `NOT_FOUND` |
 */
import { requireAdmin } from "@/features/admin/guard";
import { getAdminUserDetail } from "@/features/admin/queries";
import { fail, ok } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  const admin = await requireAdmin(request);
  if (admin.response) return admin.response;

  const { id } = await context.params;
  const detail = await getAdminUserDetail(id);
  if (!detail) return fail("NOT_FOUND", "회원을 찾을 수 없습니다.");

  return ok(detail);
}
