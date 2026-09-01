/**
 * 활성 프로필 클라이언트 상태 (T0.5) — Jotai atom.
 *
 * ## 쿠키 ↔ atom 흐름
 *
 * ```
 * [서버] getCurrentUser() → user.profiles           ┐
 *        getActiveProfile(user) → 쿠키 zari_profile │  (app)/layout.tsx 가 읽어
 *                                                   ┘  AppShell props 로 내려준다
 * [클라] ActiveProfileHydrator 가 atom 을 하이드레이트
 *        └ TabBar·전환 시트는 atom 만 본다 → 전환 즉시(새로고침 없이) 화면이 바뀐다
 * [전환] POST /api/profiles/active → 쿠키 갱신(서버) + atom 갱신(클라) + router.refresh()
 * ```
 *
 * 쿠키(`ACTIVE_PROFILE_COOKIE`)가 원본이고 atom 은 그 사본이다. 새로고침·SSR 은 쿠키를,
 * 전환 직후의 화면은 atom 을 본다 — 둘을 맞추는 책임은 `ActiveProfileHydrator` 에 있다.
 */
import { atom } from "jotai";
import type { ProfileSummary } from "./profile";

/** 로그인 사용자의 프로필 목록. 비로그인이면 빈 배열. */
export const profilesAtom = atom<ProfileSummary[]>([]);

/** 활성 프로필 id — 쿠키 `zari_profile` 의 사본. */
export const activeProfileIdAtom = atom<string | null>(null);

/** 활성 프로필 객체. id 가 목록에 없으면(전환 직후 경합 등) 첫 프로필로 떨어진다. */
export const activeProfileAtom = atom<ProfileSummary | null>((get) => {
  const profiles = get(profilesAtom);
  const id = get(activeProfileIdAtom);
  return profiles.find((p) => p.id === id) ?? profiles[0] ?? null;
});
