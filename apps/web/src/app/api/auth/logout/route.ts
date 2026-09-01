/**
 * `POST /api/auth/logout` — 세션 삭제.
 * DB 의 Session 레코드를 지우고 세션·활성프로필 쿠키를 제거한다. 본문 없음(204).
 * 로그인 상태가 아니어도 성공으로 본다(멱등).
 */
import { noContent } from "@/lib/api/response";
import { destroySession } from "@/lib/auth/session";

export async function POST(): Promise<Response> {
  await destroySession();
  return noContent();
}
