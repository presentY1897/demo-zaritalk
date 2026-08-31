import type { Metadata } from "next";
import type { ReactNode } from "react";
import { css } from "styled-system/css";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "자리 데모 백오피스",
  description: "운영자용 백오피스 — 회원/계약/수납 조회, 환급 심사, 신고 처리, 지표",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className={css({ bg: "bg.page", color: "text", minH: "100dvh" })}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
