/**
 * 셸·보호 라우트가 쓰는 서버 세션 헬퍼 (T0.5).
 *
 * `lib/auth/session.ts`(T0.3) 를 감싸기만 한다 — 세션 규칙은 거기가 원본이다.
 * 여기서 하는 일은 둘:
 * 1. **요청 단위 캐시** — `(app)/layout.tsx`(셸)와 `(protected)/layout.tsx`(가드)가 각각
 *    사용자를 읽으므로 `React.cache` 로 한 요청에 DB 조회 1회로 묶는다.
 * 2. **비로그인 리다이렉트** — `requireUser()` 가 `/login`(T0.4) 으로 보낸다.
 *
 * 인증 리다이렉트를 `src/proxy.ts`(T0.7 소유)에 넣지 않고 서버 컴포넌트에서 처리하는 이유:
 * proxy 는 anonId 발급 한 가지만 담당하고, 보호 범위는 라우트 트리(`(app)/(protected)`)로
 * 드러나는 편이 읽기 쉽기 때문이다.
 */
import { redirect } from "next/navigation";
import { cache } from "react";
import type { ProfileSummary } from "@/features/profile/profile";
import { getActiveProfile, getCurrentUser, type SessionUser } from "@/lib/auth/session";

/** 요청 1회당 한 번만 세션을 조회한다(레이아웃·페이지가 여러 번 불러도 안전). */
export const currentUser = cache(getCurrentUser);

/** 보호 라우트용 — 비로그인이면 `/login` 으로 보낸다. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** 서버 → 클라이언트로 넘길 프로필 요약(직렬화 가능한 최소 형태). */
export function toProfileSummary(user: SessionUser): ProfileSummary[] {
  return user.profiles.map((profile) => ({ id: profile.id, type: profile.type }));
}

export { getActiveProfile };
