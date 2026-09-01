import type { ReactNode } from "react";
import { css } from "styled-system/css";

/**
 * 인증 플로우 전용 레이아웃 (T0.4).
 *
 * 로그인·온보딩은 아직 프로필이 없거나 세션이 없는 상태라 **하단 탭바를 두지 않는다**.
 * 탭바가 붙는 앱 셸(T0.5)은 이 route group `(auth)` 밖에서 감싸면 된다 —
 * 여기서는 480px 셸(D5, 루트 layout 이 `maxW: 480px` 로 잡는다) 안쪽 여백만 준다.
 */
const shellStyle = css({
  minH: "100dvh",
  px: "gutter",
  pb: "section",
  display: "flex",
  flexDirection: "column",
});

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main className={shellStyle}>{children}</main>;
}
