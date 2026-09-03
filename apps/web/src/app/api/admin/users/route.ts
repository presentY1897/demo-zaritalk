/**
 * `GET /api/admin/users` — 회원 검색 (T6.3).
 *
 * `?q=` 는 **이름과 전화번호를 함께** 찾는다(하이픈을 넣어도 된다). 검색어의 `%`·`_` 는
 * 글자 그대로 취급된다(`features/admin/search.ts`). 페이지네이션 규약은 `features/admin/pagination.ts`.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 세션도 시크릿도 없음 | 401 `UNAUTHORIZED` |
 * | **비어드민 세션** | 403 `FORBIDDEN` |
 * | `page`·`pageSize` 가 정수가 아니거나 범위 밖 | 400 `VALIDATION_ERROR` |
 */
import { requireAdmin } from "@/features/admin/guard";
import { listAdminUsers } from "@/features/admin/queries";
import { adminUsersQuerySchema } from "@/features/admin/schema";
import { ok, parseQuery } from "@/lib/api/response";

export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdmin(request);
  if (admin.response) return admin.response;

  const parsed = parseQuery(request, adminUsersQuerySchema);
  if (parsed.response) return parsed.response;

  return ok(await listAdminUsers(parsed.data));
}
