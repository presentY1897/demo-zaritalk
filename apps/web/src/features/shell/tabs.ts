/**
 * 활성 프로필별 하단 탭바 구성표 (T0.5 · [D5](../../../../../docs/DECISIONS.md#-d5-웹모바일-셸)).
 *
 * **탭 목적지는 여기가 원본이다.** 뒤 Phase 의 화면은 여기 적힌 경로에 붙는다 —
 * 새 화면을 만들 때 경로를 새로 정하지 말고 이 표의 `href` 를 그대로 쓴다.
 * 경로 → 담당 task 배정표는 `docs/tasks/t0.5-shell-profile.md` 에도 같은 내용이 있다.
 *
 * 아직 없는 화면은 `apps/web/src/app/(app)/**` 에 "어느 task 가 채운다" 만 밝힌
 * 플레이스홀더 페이지로 깔아 뒀다. 담당 task 가 그 파일을 실제 화면으로 갈아 끼운다.
 */
import type { ProfileType } from "@zari/db";

/** 탭 아이콘 키 — 실제 SVG 는 `TabBar.tsx` 의 `TAB_ICONS` 에 있다. */
export type TabIcon =
  | "home"
  | "building"
  | "brokerage"
  | "community"
  | "me"
  | "search"
  | "refund"
  | "inbox"
  | "listings"
  | "quote";

export type ShellTab = {
  /** 탭 식별자 — 같은 프로필 안에서 유일 */
  key: string;
  label: string;
  /** 목적지 경로. 뒤 Phase 화면이 이 경로에 붙는다 */
  href: string;
  icon: TabIcon;
  /** 이 화면을 채우는 task (플레이스홀더 문구·문서 표와 같은 값) */
  owner: string;
};

/** 모든 프로필이 공유하는 탭 — 커뮤니티(T4.1)·마이(T0.5) */
const COMMUNITY_TAB: ShellTab = {
  key: "community",
  label: "커뮤니티",
  href: "/community",
  icon: "community",
  owner: "T4.1",
};

const MY_TAB: ShellTab = {
  key: "me",
  label: "마이",
  href: "/me",
  icon: "me",
  owner: "T0.5",
};

/** 마이페이지 경로 — 로그인 후 프로필 전환·로그아웃 진입점 */
export const MY_PAGE_HREF = MY_TAB.href;

/** 프로필 유형별 탭바 구성 (T0.5 task 문서의 표 그대로) */
export const PROFILE_TABS: Record<ProfileType, readonly ShellTab[]> = {
  LANDLORD: [
    { key: "home", label: "홈", href: "/landlord", icon: "home", owner: "T1.9" },
    {
      key: "assets",
      label: "자산",
      href: "/landlord/buildings",
      icon: "building",
      owner: "T1.1",
    },
    {
      key: "brokerage",
      label: "중개요청",
      href: "/landlord/brokerage",
      icon: "brokerage",
      owner: "T3.6",
    },
    COMMUNITY_TAB,
    MY_TAB,
  ],
  TENANT: [
    { key: "home", label: "홈", href: "/tenant", icon: "home", owner: "T1.3" },
    { key: "listings", label: "매물", href: "/search", icon: "search", owner: "T3.2" },
    {
      key: "refund",
      label: "환급",
      href: "/tenant/refund",
      icon: "refund",
      owner: "T2.4",
    },
    COMMUNITY_TAB,
    MY_TAB,
  ],
  REALTOR: [
    { key: "home", label: "홈", href: "/realtor", icon: "inbox", owner: "T3.7" },
    {
      key: "listings",
      label: "매물",
      href: "/realtor/listings",
      icon: "listings",
      owner: "T3.7",
    },
    COMMUNITY_TAB,
    MY_TAB,
  ],
  MASTER: [
    { key: "home", label: "홈", href: "/master", icon: "home", owner: "T5.2" },
    {
      key: "quotes",
      label: "견적",
      href: "/master/quotes",
      icon: "quote",
      owner: "T5.3",
    },
    COMMUNITY_TAB,
    MY_TAB,
  ],
};

/** 프로필 유형별 홈(첫 탭) 경로 — 로그인 직후 `/` 가 여기로 보낸다. */
export function homeHrefFor(type: ProfileType): string {
  return PROFILE_TABS[type][0]!.href;
}

/**
 * 현재 경로에 해당하는 탭 key. 가장 길게 일치하는 `href` 를 고른다 —
 * `/landlord` 와 `/landlord/buildings` 가 함께 있어도 자산 탭만 활성이 된다.
 */
export function activeTabKey(tabs: readonly ShellTab[], pathname: string): string | null {
  let matched: ShellTab | null = null;
  for (const tab of tabs) {
    const hit = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
    if (hit && (!matched || tab.href.length > matched.href.length)) matched = tab;
  }
  return matched?.key ?? null;
}
