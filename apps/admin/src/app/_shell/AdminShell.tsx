/**
 * 백오피스 데스크톱 셸 (T0.5) — 좌측 고정 사이드바 + 우측 콘텐츠.
 *
 * 웹(`apps/web`)이 480px 모바일 셸(D5)인 것과 반대로 어드민은 데스크톱 기준이다.
 * 좁은 화면에서는 사이드바가 위로 접혀 한 줄 메뉴가 된다(운영 화면은 데스크톱 전제라 딱 그만큼).
 * 색은 전부 `@zari/ui` semantic 토큰 — 하드코딩 색상 0.
 */
import type { ReactNode } from "react";
import { css } from "styled-system/css";
import { AdminNav } from "./AdminNav";

const frameStyle = css({
  minH: "100dvh",
  bg: "bg.page",
  display: "grid",
  gridTemplateColumns: { base: "1fr", lg: "248px 1fr" },
  alignItems: "start",
});

const sidebarStyle = css({
  bg: "bg.card",
  borderColor: "border",
  borderBottomWidth: { base: "hairline", lg: "0" },
  borderBottomStyle: "solid",
  borderInlineEndWidth: { base: "0", lg: "hairline" },
  borderInlineEndStyle: "solid",
  position: { base: "static", lg: "sticky" },
  top: "0",
  minH: { base: "auto", lg: "100dvh" },
  px: "3",
  py: "5",
  display: "flex",
  flexDirection: "column",
  gap: "6",
});

const brandStyle = css({ px: "3", display: "flex", flexDirection: "column", gap: "1" });
const brandTitleStyle = css({ textStyle: "subtitle", color: "text" });
const brandDescStyle = css({ textStyle: "caption", color: "text.muted" });
const contentStyle = css({ minW: "0", px: { base: "gutter", lg: "8" }, py: "8" });

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className={frameStyle}>
      <aside className={sidebarStyle}>
        <div className={brandStyle}>
          <span className={brandTitleStyle}>자리 데모 백오피스</span>
          <span className={brandDescStyle}>운영자 전용</span>
        </div>
        <AdminNav />
      </aside>
      <div className={contentStyle}>{children}</div>
    </div>
  );
}
