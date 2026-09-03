/**
 * **어드민 앱의 인증 게이트** (T6.3) — 이 앱에서 "누가 들어왔는가" 를 아는 유일한 곳.
 *
 * ## 왜 필요했나
 *
 * T2.5(환급 심사)·T4.2(신고 처리)·T1.4(크론 트리거)는 web API 를 `User.isAdmin` 으로 단단히
 * 잠갔지만, **어드민 앱 자체에는 로그인이 없었다** — 주소를 아는 사람은 심사 화면도, 크론
 * 버튼도 그냥 열 수 있었다. 세 문서가 모두 "이 구멍은 T6.3 이 닫는다" 고 적어 뒀다.
 *
 * ## 어떻게 닫았나 — **세션은 web 의 것을 그대로 쓴다**
 *
 * ```
 * [브라우저]  ──쿠키 zari_admin(httpOnly, 어드민 도메인)──▶  어드민 서버(3001)
 *                                                            │  Cookie: zari_session=<토큰>
 *                                                            ▼
 *                                                    web(3000) GET /api/admin/session
 *                                                    → getCurrentUser() → isAdmin 판정
 * ```
 *
 * - 로그인은 `POST /api/admin/session`(web)이 처리하고 **web 의 `Session` 레코드**를 발급한다.
 *   어드민 앱은 그 토큰을 자기 도메인 쿠키에 담을 뿐, 인증 체계를 하나 더 만들지 않는다.
 * - **어드민 앱은 DB 를 모른다.** 판정은 지금까지처럼 전부 web 이 한다(T2.5·T4.2 와 같은 원칙).
 * - 토큰은 `httpOnly` 쿠키라 브라우저 JS 가 읽지 못하고, 서버 액션·서버 컴포넌트만 꺼내 쓴다.
 *
 * ## 게이트는 두 겹이다
 *
 * | 겹 | 어디 | 무엇을 막나 |
 * |---|---|---|
 * | 화면 | `layout.tsx` → `AdminGate` | 로그인 안 한 사람에게는 **어떤 화면도 렌더하지 않는다**(로그인 폼만) |
 * | 데이터 | **모든 서버 액션·라우트 핸들러**가 `requireAdminGate()` 를 먼저 부른다 | 화면을 건너뛴 직접 호출 |
 *
 * 두 번째 겹이 진짜 방어선이다 — Next 문서가 못 박아 둔 것처럼 레이아웃에서 막는 것만으로는
 * 서버 액션 호출을 막지 못한다(`node_modules/next/dist/docs/01-app/02-guides/authentication.md`
 * 의 "Server Actions" 절). 그리고 그 뒤에 **web 의 `isAdmin` 가드**가 세 번째 겹으로 남아 있다.
 *
 * > 이 모듈은 서버 전용이다 — `next/headers` 를 쓰므로 클라이언트 컴포넌트에서 import 하면
 * > 빌드가 깨진다. (`server-only` 패키지는 이 저장소에 없어 `pnpm-lock.yaml` 을 건드리지 않으려고
 * > 넣지 않았다.)
 */
import { cookies } from "next/headers";
import { cache } from "react";
import { resolveWebUrl } from "../cron/shared";

/** 어드민 도메인에 굽는 세션 쿠키. 값은 web 의 `Session.token` 이다 */
export const ADMIN_SESSION_COOKIE = "zari_admin";

/** web 이 세션을 읽을 때 보는 쿠키 이름 — `apps/web/src/lib/auth/session.ts` 와 같은 값 */
const WEB_SESSION_COOKIE = "zari_session";

export const SECRET_HEADER = "x-admin-secret";

export type AdminIdentity = { id: string; name: string; phone: string };

export function webBase(): string {
  return resolveWebUrl(process.env.NEXT_PUBLIC_WEB_URL);
}

/** 어드민 서버가 web 을 부를 때 쓰는 서비스 자격 — **로그인·로그아웃에만** 쓴다 */
export function adminServiceSecret(): string | undefined {
  return process.env.ADMIN_API_SECRET || process.env.CRON_SECRET || undefined;
}

export async function readSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(ADMIN_SESSION_COOKIE)?.value;
}

/**
 * 조회 API 호출 — **세션 쿠키만** 실어 보낸다.
 *
 * 시크릿을 함께 붙이지 않는 것이 중요하다. web 의 가드는 세션이 없으면 시크릿으로 넘어가는데,
 * 둘 다 보내면 세션이 끊긴 요청이 서비스 자격으로 슬쩍 통과한다. 조회 화면은 **언제나
 * 로그인한 그 사람**으로 동작해야 한다.
 */
export async function callWebAsAdmin(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; body: unknown } | { ok: false; status: number | null; message: string }> {
  const token = await readSessionToken();
  if (!token) return { ok: false, status: 401, message: "어드민 로그인이 필요합니다." };

  let response: Response;
  try {
    response = await fetch(`${webBase()}${path}`, {
      ...init,
      headers: { ...init.headers, cookie: `${WEB_SESSION_COOKIE}=${token}` },
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: null,
      message: `web 앱에 연결하지 못했습니다 (${detail}). NEXT_PUBLIC_WEB_URL 을 확인하세요.`,
    };
  }

  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? ((body as { error?: { message?: string } }).error?.message ?? "요청이 거부되었습니다.")
        : "요청이 거부되었습니다.";
    return { ok: false, status: response.status, message };
  }
  return { ok: true, body };
}

/**
 * 지금 로그인한 관리자. 없으면 null.
 *
 * `cache()` 로 감싸 **요청 한 번에 한 번만** web 에 물어본다 — 레이아웃·페이지·서버 액션이
 * 각자 불러도 왕복은 하나다.
 */
export const currentAdmin = cache(async (): Promise<AdminIdentity | null> => {
  const result = await callWebAsAdmin("/api/admin/session", { method: "GET" });
  if (!result.ok) return null;
  const body = result.body as { admin?: AdminIdentity };
  return body.admin ?? null;
});

/** 서버 액션·라우트 핸들러가 쓰는 실패 모양 — 화면들의 결과 타입과 그대로 맞는다 */
export type AdminGateDenied = { ok: false; status: number; message: string };

/**
 * **모든 서버 액션의 첫 줄.** 통과하면 null, 아니면 그대로 return 할 실패 객체를 준다.
 *
 * ```ts
 * const denied = await requireAdminGate();
 * if (denied) return denied;
 * ```
 */
export async function requireAdminGate(): Promise<AdminGateDenied | null> {
  const admin = await currentAdmin();
  if (admin) return null;
  return { ok: false, status: 401, message: "어드민 로그인이 필요합니다. 다시 로그인해 주세요." };
}
