"use client";

/**
 * 사이드바 내비게이션 (T0.5) — 현재 경로 강조 때문에 클라이언트 컴포넌트다
 * (`usePathname` 은 클라이언트 전용).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { css } from "styled-system/css";
import { ADMIN_MENU } from "./menu";

const navStyle = css({ display: "flex", flexDirection: "column", gap: "5" });
const groupTitleStyle = css({
  textStyle: "caption",
  color: "text.muted",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  px: "3",
  mb: "1",
});
const listStyle = css({ display: "flex", flexDirection: "column", gap: "0.5" });
const itemStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  px: "3",
  py: "2",
  rounded: "field",
  textStyle: "body",
  color: "text",
  textDecoration: "none",
  // 활성 표시를 왼쪽 굵은 선으로 준다 — 비활성도 같은 두께를 투명으로 둬 글자가 밀리지 않게
  borderInlineStartWidth: "thick",
  borderInlineStartStyle: "solid",
  borderInlineStartColor: "transparent",
  _hover: { bg: "bg.subtle" },
});
const itemActiveStyle = css({
  bg: "primary.subtle",
  color: "text",
  fontWeight: "600",
  borderInlineStartColor: "primary",
});
const ownerStyle = css({ textStyle: "caption", color: "text.muted", fontFamily: "numeric" });

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className={navStyle} aria-label="백오피스 메뉴">
      {ADMIN_MENU.map((group) => (
        <div key={group.title}>
          <p className={groupTitleStyle}>{group.title}</p>
          <div className={listStyle}>
            {group.items.map((item) => {
              const isActive =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={isActive ? `${itemStyle} ${itemActiveStyle}` : itemStyle}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span>{item.label}</span>
                  <span className={ownerStyle}>{item.owner}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
