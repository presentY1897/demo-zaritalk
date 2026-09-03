import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { css } from "styled-system/css";
import { SITE_DESCRIPTION, SITE_NAME, siteUrlObject } from "@/lib/seo";
import { Providers } from "./providers";
import "./globals.css";

/**
 * `metadataBase` 를 여기 한 번만 둔다 — 하위 화면의 상대 경로 canonical·OG 가 전부 이걸 기준
 * 삼는다. 화면마다 각자 구하면 프리뷰 배포에서 도메인이 어긋난다(T6.4).
 */
export const metadata: Metadata = {
  metadataBase: siteUrlObject(),
  title: { default: `${SITE_NAME} — 임대관리`, template: `%s — ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * 루트 레이아웃 — 문서 골격과 Provider 만 담당한다.
 *
 * 480px 모바일 셸(D5)은 여기 인라인으로 두지 않고 `(app)/layout.tsx` 의
 * `AppShell`(폭 제한 + 하단 탭바 + 데스크톱 바탕)이 맡는다 — 로그인·온보딩(T0.4)처럼
 * 탭바가 없는 화면이 셸 밖에 있을 수 있기 때문이다.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className={css({ bg: "bg.page", color: "text", minH: "100dvh" })}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
