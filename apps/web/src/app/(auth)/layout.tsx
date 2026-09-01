import type { ReactNode } from "react";
import { css } from "styled-system/css";
import { ShellFrame } from "@/features/shell/AppShell";

/**
 * 인증 플로우 전용 레이아웃 (T0.4).
 *
 * 로그인·온보딩은 아직 프로필이 없거나 세션이 없는 상태라 **하단 탭바를 두지 않는다**.
 * 다만 480px 셸(D5)은 앱 전체에 걸리므로 `ShellFrame`(T0.5) 으로 감싼다 —
 * 루트 layout 은 문서 골격만 담당하고 폭 제한을 하지 않는다.
 */
const innerStyle = css({
  minH: "100dvh",
  px: "gutter",
  pb: "section",
  display: "flex",
  flexDirection: "column",
});

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <ShellFrame>
      <main className={innerStyle}>{children}</main>
    </ShellFrame>
  );
}
