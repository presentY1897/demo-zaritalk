"use client";

/**
 * 서버가 읽은 활성 프로필(쿠키)을 Jotai atom 으로 하이드레이트한다 (T0.5).
 *
 * - **첫 렌더**: `useHydrateAtoms` 로 SSR 결과와 atom 초기값을 맞춘다(하이드레이션 불일치 방지).
 * - **이후**: 서버 값이 실제로 바뀔 때만(`router.refresh()`·로그인·로그아웃) atom 에 반영한다.
 *   매 렌더마다 덮어쓰면 전환 직후의 낙관적 갱신(atom) 을 오래된 서버 값이 되돌릴 수 있다.
 */
import { useSetAtom } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import { useEffect, useRef } from "react";
import { activeProfileIdAtom, profilesAtom } from "./atoms";
import type { ProfileSummary } from "./profile";

export type ActiveProfileHydratorProps = {
  profiles: ProfileSummary[];
  activeProfileId: string | null;
};

export function ActiveProfileHydrator({
  profiles,
  activeProfileId,
}: ActiveProfileHydratorProps) {
  useHydrateAtoms([
    [profilesAtom, profiles],
    [activeProfileIdAtom, activeProfileId],
  ] as const);

  const setProfiles = useSetAtom(profilesAtom);
  const setActiveProfileId = useSetAtom(activeProfileIdAtom);

  // 직전에 본 "서버 값" — 이 값이 바뀐 경우에만 atom 을 덮어쓴다.
  const lastServer = useRef({ profiles: serialize(profiles), activeProfileId });

  useEffect(() => {
    const key = serialize(profiles);
    if (lastServer.current.profiles !== key) {
      lastServer.current.profiles = key;
      setProfiles(profiles);
    }
    if (lastServer.current.activeProfileId !== activeProfileId) {
      lastServer.current.activeProfileId = activeProfileId;
      setActiveProfileId(activeProfileId);
    }
  }, [profiles, activeProfileId, setProfiles, setActiveProfileId]);

  return null;
}

/** props 는 매 렌더 새 배열이라 참조 비교가 안 된다 — 내용으로 비교한다. */
function serialize(profiles: ProfileSummary[]): string {
  return profiles.map((p) => `${p.id}:${p.type}`).join("|");
}
