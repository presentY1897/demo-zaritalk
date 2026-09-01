"use client";

/**
 * 활성 프로필별 하단 탭바 (T0.5 · D5).
 *
 * 구성은 `tabs.ts` 의 `PROFILE_TABS` 가 원본이고, **활성 프로필은 Jotai atom** 에서 읽는다.
 * 그래서 마이페이지에서 프로필을 바꾸면 서버 왕복 없이 그 자리에서 탭 구성이 바뀐다.
 * 비로그인(프로필 없음)이면 탭바를 그리지 않는다 — 랜딩(`/`)에는 탭이 없다.
 */
import { useAtomValue } from "jotai";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { css } from "styled-system/css";
import { activeProfileAtom } from "@/features/profile/atoms";
import { activeTabKey, PROFILE_TABS, type TabIcon } from "./tabs";

const navStyle = css({
  position: "fixed",
  bottom: "0",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: "tabbar",
  w: "100%",
  maxW: "shell",
  display: "flex",
  bg: "bg.card",
  borderTopWidth: "hairline",
  borderTopStyle: "solid",
  borderTopColor: "border",
  // 홈 인디케이터가 있는 기기에서 탭이 가려지지 않게
  pb: "env(safe-area-inset-bottom)",
});

const tabStyle = css({
  flex: "1",
  minH: "tap",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "1",
  py: "2",
  textStyle: "caption",
  color: "text.muted",
  textDecoration: "none",
  _hover: { color: "text" },
});

const activeTabStyle = css({ color: "text.brand", fontWeight: "600" });

const iconStyle = css({ w: "22px", h: "22px", display: "block" });

export function TabBar() {
  const activeProfile = useAtomValue(activeProfileAtom);
  const pathname = usePathname();

  if (!activeProfile) return null;

  const tabs = PROFILE_TABS[activeProfile.type];
  const currentKey = activeTabKey(tabs, pathname);

  return (
    <nav className={navStyle} aria-label="주요 메뉴" data-profile-type={activeProfile.type}>
      {tabs.map((tab) => {
        const isActive = tab.key === currentKey;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={isActive ? `${tabStyle} ${activeTabStyle}` : tabStyle}
            aria-current={isActive ? "page" : undefined}
            data-tab={tab.key}
          >
            {TAB_ICONS[tab.icon]}
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** 아이콘은 외부 의존 없이 인라인 SVG(선 아이콘, `currentColor` 상속)로 둔다. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className={iconStyle}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const TAB_ICONS: Record<TabIcon, ReactNode> = {
  home: (
    <Icon>
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </Icon>
  ),
  building: (
    <Icon>
      <path d="M4 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M14 21V9h5a1 1 0 0 1 1 1v11M3 21h18M7 7h4M7 11h4M7 15h4" />
    </Icon>
  ),
  brokerage: (
    <Icon>
      <path d="M3 11.5 21 4l-6.5 16.5-3-6.5z" />
    </Icon>
  ),
  community: (
    <Icon>
      <path d="M4 5h13a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H9l-5 4z" />
      <path d="M8 9h5" />
    </Icon>
  ),
  me: (
    <Icon>
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </Icon>
  ),
  search: (
    <Icon>
      <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z" />
      <path d="m20 20-4-4" />
    </Icon>
  ),
  refund: (
    <Icon>
      <path d="M7 3h10v18l-2.5-1.6L12 21l-2.5-1.6L7 21z" />
      <path d="M10 8h4M10 12h4M11 8l1 4 1-4" />
    </Icon>
  ),
  inbox: (
    <Icon>
      <path d="M4 13h4l1 3h6l1-3h4" />
      <path d="M4.5 13 6 5h12l1.5 8v6a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" />
    </Icon>
  ),
  listings: (
    <Icon>
      <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </Icon>
  ),
  quote: (
    <Icon>
      <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </Icon>
  ),
};
