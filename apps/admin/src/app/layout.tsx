import type { Metadata } from "next";
import type { ReactNode } from "react";
import { css } from "styled-system/css";
import { AdminGate } from "./_shell/AdminGate";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "자리 데모 백오피스",
  description: "운영자용 백오피스 — 회원/계약/수납 조회, 환급 심사, 신고 처리, 지표",
};

/**
 * 세션 쿠키를 읽어 판정하므로 정적으로 굳으면 안 된다 — 로그인 여부가 빌드 시점에 박히면
 * 게이트가 무의미해진다(T6.3).
 */
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className={css({ bg: "bg.page", color: "text", minH: "100dvh" })}>
        <Providers>
          {/*
            인증 게이트(T6.3) → 데스크톱 사이드바 셸(T0.5).
            로그인 전에는 셸도 메뉴도 그리지 않고 로그인 화면만 나온다.
          */}
          <AdminGate>{children}</AdminGate>
        </Providers>
      </body>
    </html>
  );
}
