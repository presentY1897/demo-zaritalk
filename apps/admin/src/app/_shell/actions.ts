"use server";

/**
 * 어드민 로그인·로그아웃 서버 액션 (T6.3).
 *
 * 브라우저는 web(3000)을 직접 부를 수 없다 — 도메인이 달라 세션 쿠키가 붙지 않는다.
 * 그래서 **어드민 서버**가 대신 `POST /api/admin/session` 을 부르고, 받은 토큰을
 * 자기 도메인의 httpOnly 쿠키에 담는다. 패스코드는 브라우저 → 어드민 서버 → web 으로만
 * 흐르고 어디에도 저장되지 않는다.
 *
 * `"use server"` 파일은 async 함수만 export 할 수 있다 — 상수·타입은 `./auth.ts` 에 있다.
 */
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  ADMIN_SESSION_COOKIE,
  adminServiceSecret,
  readSessionToken,
  SECRET_HEADER,
  webBase,
} from "./auth";

export type AdminSignInState = { ok: boolean; message: string | null };

const MISSING_SECRET =
  "ADMIN_API_SECRET(또는 CRON_SECRET)이 어드민에 설정돼 있지 않습니다. .env.local 에 web 과 같은 값을 넣어 주세요.";

/**
 * 로그인 — `useActionState` 가 부른다.
 *
 * 실패 사유는 web 이 준 문구를 그대로 쓴다(관리자 번호를 떠보지 못하게 한 덩어리 문구다).
 */
export async function signInAdminAction(
  _prev: AdminSignInState,
  formData: FormData,
): Promise<AdminSignInState> {
  const phone = String(formData.get("phone") ?? "").trim();
  const passcode = String(formData.get("passcode") ?? "");
  if (!phone || !passcode) {
    return { ok: false, message: "관리자 전화번호와 패스코드를 모두 입력해 주세요." };
  }

  const secret = adminServiceSecret();
  if (!secret) return { ok: false, message: MISSING_SECRET };

  let response: Response;
  try {
    response = await fetch(`${webBase()}/api/admin/session`, {
      method: "POST",
      headers: { "content-type": "application/json", [SECRET_HEADER]: secret },
      body: JSON.stringify({ phone, passcode }),
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `web 앱에 연결하지 못했습니다 (${detail}). NEXT_PUBLIC_WEB_URL 을 확인하세요.`,
    };
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? ((body as { error?: { message?: string } }).error?.message ?? "로그인에 실패했습니다.")
        : "로그인에 실패했습니다.";
    return { ok: false, message };
  }

  const { token, expiresAt } = body as { token: string; expiresAt: string };
  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
  });

  // 레이아웃의 게이트가 다시 판정하도록 트리 전체를 무효화한다
  revalidatePath("/", "layout");
  return { ok: true, message: null };
}

/** 로그아웃 — web 의 세션 레코드까지 폐기하고 쿠키를 지운다 */
export async function signOutAdminAction(): Promise<void> {
  const token = await readSessionToken();
  const secret = adminServiceSecret();

  if (token && secret) {
    try {
      await fetch(`${webBase()}/api/admin/session`, {
        method: "DELETE",
        headers: { [SECRET_HEADER]: secret, cookie: `zari_session=${token}` },
        cache: "no-store",
      });
    } catch {
      // web 이 죽어 있어도 쿠키는 반드시 지운다 — 브라우저 쪽 흔적을 남기지 않는다
    }
  }

  const store = await cookies();
  store.delete(ADMIN_SESSION_COOKIE);
  revalidatePath("/", "layout");
}
