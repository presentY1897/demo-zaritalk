/**
 * 보호 라우트 그룹 (T0.5).
 *
 * 이 아래 화면은 전부 로그인이 필요하다 — 비로그인이면 `/login`(T0.4) 으로 리다이렉트한다.
 * 인증 판정은 `getCurrentUser()`(T0.3) 서버 조회 한 곳에서만 한다. `src/proxy.ts` 는 T0.7
 * 소유라 손대지 않았다.
 *
 * **랜딩(`/`)은 일부러 이 그룹 밖에 둔다.** 비로그인도 볼 수 있어야 하기 때문이다
 * (`e2e/smoke.spec.ts` 가 `/` 200 + h1 을 요구한다). 앞으로 추가될 비로그인 허용 화면
 * (`/search` T3.2, `/refund/calculator` T2.3, `/notice/[token]` T1.8)도 `(app)` 바로 아래에 둔다.
 */
import type { ReactNode } from "react";
import { requireUser } from "@/features/shell/session";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return <>{children}</>;
}
