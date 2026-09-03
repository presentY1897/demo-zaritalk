/**
 * `/api/admin/session` — **어드민 앱의 로그인 엔드포인트** (T6.3).
 *
 * 어드민 앱(3001)은 web(3000)과 도메인이 달라 세션 쿠키를 공유할 수 없다. 그래서 어드민
 * **서버**가 여기로 로그인을 대신 치고, 받은 토큰을 자기 도메인 쿠키에 담는다.
 * 발급되는 것은 web 의 `Session` 레코드 그대로다 — 인증 체계를 하나 더 만들지 않는다.
 * 설계 근거는 `features/admin/session.ts` 주석 참고.
 *
 * | 메서드 | 하는 일 |
 * |---|---|
 * | `POST` | 로그인 — `x-admin-secret` + `{ phone, passcode }` → 세션 토큰 |
 * | `GET` | 세션 확인 — 어드민 앱이 매 요청 게이트에서 부른다. `Cookie: zari_session=…` 로 판정 |
 * | `DELETE` | 로그아웃 — 그 토큰만 폐기(멱등) |
 *
 * | 실패 | status · code |
 * |---|---|
 * | `POST` 에 서비스 시크릿 없음 | 401 `UNAUTHORIZED` |
 * | `POST` 시크릿 불일치 · **패스코드 불일치** · 패스코드 미설정 · `isAdmin` 아닌 번호 | 403 `FORBIDDEN` |
 * | `GET` 세션 없음 | 401 `UNAUTHORIZED` · 비어드민 세션 403 `FORBIDDEN` |
 *
 * **왜 실패 사유를 나눠 주지 않는가** — "그 번호는 관리자가 아니다" 와 "패스코드가 틀렸다" 를
 * 구분해 주면 어드민 계정 번호를 밖에서 찾아낼 수 있다. 응답은 전부 같은 문구다.
 */
import { requireAdmin } from "@/features/admin/guard";
import { maskPhone } from "@/features/admin/mask";
import { adminServiceSecret, secretEquals, signInAdmin, signOutAdmin } from "@/features/admin/session";
import { adminSignInSchema } from "@/features/admin/schema";
import { ADMIN_SECRET_HEADER } from "@/features/refund/ownership";
import { fail, noContent, ok, parseJson } from "@/lib/api/response";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/phone";
import { cookies } from "next/headers";

const DENIED = "관리자 번호 또는 패스코드가 올바르지 않습니다.";

export async function POST(request: Request): Promise<Response> {
  // ① "이 요청이 어드민 서버에서 왔는가" — 시크릿은 신분이 아니라 통로의 자격이다
  const provided = request.headers.get(ADMIN_SECRET_HEADER);
  if (!provided) return fail("UNAUTHORIZED", "어드민 서버에서만 호출할 수 있습니다.");
  if (!secretEquals(provided, adminServiceSecret())) {
    return fail("FORBIDDEN", "어드민 서버에서만 호출할 수 있습니다.");
  }

  const parsed = await parseJson(request, adminSignInSchema);
  if (parsed.response) return parsed.response;

  // ② 사람이 아는 값(패스코드) + ③ 실재하는 isAdmin 계정
  const result = await signInAdmin({
    phone: normalizePhone(parsed.data.phone),
    passcode: parsed.data.passcode,
  });
  if (!result.ok) return fail("FORBIDDEN", DENIED);

  return ok({
    token: result.token,
    expiresAt: result.expiresAt.toISOString(),
    admin: { id: result.user.id, name: result.user.name, phone: maskPhone(result.user.phone) },
  });
}

export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdmin(request);
  if (admin.response) return admin.response;
  const { user } = admin.data;
  return ok({ admin: { id: user.id, name: user.name, phone: maskPhone(user.phone) } });
}

export async function DELETE(): Promise<Response> {
  const store = await cookies();
  await signOutAdmin(store.get(SESSION_COOKIE)?.value);
  return noContent();
}
