/**
 * `(app)` 라우트 그룹 레이아웃 — 480px 모바일 셸 + 활성 프로필별 하단 탭바 (T0.5 · D5).
 *
 * 그룹 이름은 URL 에 들어가지 않는다(`(app)/me` → `/me`).
 * - 여기: 셸·탭바만 담당한다. 비로그인도 들어올 수 있는 화면(`/`, 나중에 `/search`)이 있어서
 *   레이아웃에서 리다이렉트하지 않는다 — 걸면 `/` 까지 막혀 `e2e/smoke.spec.ts` 가 깨진다.
 * - 로그인 강제: 한 겹 안쪽 `(app)/(protected)/layout.tsx` 가 담당한다.
 *
 * 레이아웃은 네비게이션마다 다시 렌더되지 않으므로(Next 16), 프로필 전환 뒤의 즉시 반영은
 * 서버가 아니라 Jotai atom 이 맡는다. `AppShell` 주석 참고.
 */
import type { ReactNode } from "react";
import { AppShell } from "@/features/shell/AppShell";
import { currentUser, getActiveProfile, toProfileSummary } from "@/features/shell/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  const activeProfile = user ? await getActiveProfile(user) : null;

  return (
    <AppShell
      profiles={user ? toProfileSummary(user) : []}
      activeProfileId={activeProfile?.id ?? null}
    >
      {children}
    </AppShell>
  );
}
