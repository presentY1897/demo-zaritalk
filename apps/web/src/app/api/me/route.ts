/**
 * `GET /api/me` — 내 User + 프로필 목록 + 활성 프로필.
 * 비로그인(쿠키 없음·만료·삭제된 세션)이면 401. 중개인·마스터 프로필은 Detail 까지 포함한다.
 */
import { fail, ok } from "@/lib/api/response";
import { buildMeResponse } from "@/lib/auth/me";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요합니다.");

  return ok(await buildMeResponse(user));
}
