/**
 * 인증 게이트 (T6.3) — 로그인하지 않았으면 **어떤 업무 화면도 렌더하지 않는다.**
 *
 * 루트 레이아웃에 두었기 때문에 `/`(지표)·`/refunds`·`/cron` 을 포함한 **모든 페이지**가
 * 자동으로 잠긴다. 새 화면이 생겨도 따로 챙길 것이 없다.
 *
 * 로그인 화면을 `/login` 라우트로 만들지 않고 **같은 자리에 대신 그린다.** 그러면
 * 리다이렉트 루프도, "게이트에서 제외할 경로" 목록도 필요 없다 — 예외가 없는 게이트가
 * 가장 새지 않는다.
 *
 * ⚠️ 이 게이트는 **화면만** 막는다. 서버 액션과 라우트 핸들러는 레이아웃을 거치지 않으므로
 * 각자 `requireAdminGate()` 를 부른다(`auth.ts` 의 "게이트는 두 겹이다" 참고).
 */
import type { ReactNode } from "react";
import { AdminLoginView } from "./AdminLoginView";
import { AdminShell } from "./AdminShell";
import { currentAdmin } from "./auth";

export async function AdminGate({ children }: { children: ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) return <AdminLoginView />;
  return <AdminShell admin={admin}>{children}</AdminShell>;
}
