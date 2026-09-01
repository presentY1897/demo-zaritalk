/**
 * 웹(모바일) 셸 — 최대폭 480px 중앙 정렬 + 하단 탭바 ([D5](../../../../../docs/DECISIONS.md#-d5-웹모바일-셸)).
 *
 * 앱 웹뷰 가정이라 폭을 모바일로 고정한다. 데스크톱에서 좌우가 허전하지 않게 페이지
 * 바탕은 한 톤 어둡게(`bg.subtle`) 두고 셸만 밝게(`bg.page`) 띄운다 — 딱 그 정도만 한다.
 *
 * 서버 컴포넌트다. 상태가 필요한 두 조각만 클라이언트로 내려간다:
 * - `ActiveProfileHydrator` — 서버가 읽은 활성 프로필(쿠키)을 Jotai atom 으로 하이드레이트
 * - `TabBar` — atom 을 구독해 프로필이 바뀌면 새로고침 없이 탭 구성을 바꾼다
 */
import type { ReactNode } from "react";
import { css } from "styled-system/css";
import { ActiveProfileHydrator } from "@/features/profile/ActiveProfileHydrator";
import type { ProfileSummary } from "@/features/profile/profile";
import { TabBar } from "./TabBar";

/** 탭바 높이 + 홈 인디케이터만큼 콘텐츠 아래 여백을 확보한다. */
const TABBAR_CLEARANCE = "calc(66px + env(safe-area-inset-bottom))";

/** 데스크톱에서 셸 바깥이 허전하지 않게 한 톤 어두운 바탕을 깐다(모바일에서는 보이지 않는다). */
const backdropStyle = css({ bg: "bg.subtle", minH: "100dvh" });

const shellStyle = css({
  maxW: "shell",
  mx: "auto",
  minH: "100dvh",
  bg: "bg.page",
  // 480px 보다 넓은 화면에서만 셸 경계가 보이게(모바일에서는 티가 나지 않는다)
  borderInlineWidth: "hairline",
  borderInlineStyle: "solid",
  borderInlineColor: "border",
  position: "relative",
});

const contentStyle = css({ minH: "100dvh" });
const contentWithTabbarStyle = css({ minH: "100dvh", pb: TABBAR_CLEARANCE });

export type AppShellProps = {
  /** 로그인 사용자의 프로필 목록. 비로그인이면 빈 배열 */
  profiles: ProfileSummary[];
  /** 쿠키에서 읽은 활성 프로필 id */
  activeProfileId: string | null;
  children: ReactNode;
};

export function AppShell({ profiles, activeProfileId, children }: AppShellProps) {
  const hasTabbar = profiles.length > 0;

  return (
    <>
      <ActiveProfileHydrator profiles={profiles} activeProfileId={activeProfileId} />
      <div className={backdropStyle}>
        <div className={shellStyle}>
          <div className={hasTabbar ? contentWithTabbarStyle : contentStyle}>{children}</div>
          <TabBar />
        </div>
      </div>
    </>
  );
}
