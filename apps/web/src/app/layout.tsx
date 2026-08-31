import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { css } from "styled-system/css";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "자리 데모 — 임대관리",
  description: "임대인·세입자·중개인·마스터를 잇는 임대관리 데모 서비스",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body
        className={css({
          bg: "bg.page",
          color: "text",
          minH: "100dvh",
          // 모바일 웹(앱 웹뷰 가정): 콘텐츠 폭을 모바일 기준으로 제한
          maxW: "480px",
          mx: "auto",
        })}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
