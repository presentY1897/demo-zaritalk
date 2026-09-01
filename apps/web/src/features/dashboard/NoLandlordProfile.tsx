/**
 * 임대인 프로필이 없는 계정이 `/landlord` 에 들어왔을 때의 빈 상태 (T1.9) — 서버 컴포넌트.
 *
 * API 는 같은 상황에서 403 `FORBIDDEN` 을 돌려준다(`features/landlord/ownership.ts`).
 * 화면은 막다른 길 대신 프로필 추가(T0.4 `/onboarding`)로 안내한다.
 *
 * T1.1 의 `LandlordOnly`(자산 화면용)와 같은 모양이지만 문구가 홈 기준이라 따로 둔다 —
 * 그쪽은 T1.1 소유 파일이라 병렬 작업 중 건드리지 않는다.
 */
import { Button, Card } from "@zari/ui";
import Link from "next/link";
import { css } from "styled-system/css";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const titleStyle = css({ textStyle: "headline", color: "text" });
const bodyStyle = css({ textStyle: "body", color: "text.muted", mb: "3" });

export function NoLandlordProfile() {
  return (
    <main className={pageStyle}>
      <h1 className={titleStyle}>홈</h1>
      <Card padding="md">
        <p className={bodyStyle}>
          수납 현황·연체·만기 대시보드는 임대인 프로필에서 열립니다. 임대인 유형을 추가하면 바로
          보입니다.
        </p>
        <Link href="/onboarding">
          <Button fullWidth>임대인 프로필 추가</Button>
        </Link>
      </Card>
    </main>
  );
}
