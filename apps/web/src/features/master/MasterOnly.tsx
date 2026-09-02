/**
 * 마스터 프로필(또는 업종·활동지역)이 없는 계정이 마스터 화면에 들어왔을 때의 빈 상태 (T5.2) —
 * 서버 컴포넌트. T1.1 `features/landlord/LandlordOnly.tsx` 와 같은 모양이다.
 *
 * API 는 같은 상황에서 403 `FORBIDDEN` 을 돌려준다(`features/master/ownership.ts`).
 * 화면은 막다른 길 대신 프로필 추가(T0.4 `/onboarding`)로 안내한다 —
 * 마스터 프로필은 등록할 때 업종·활동지역을 함께 받으므로 같은 화면에서 둘 다 해결된다.
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

export function MasterOnly() {
  return (
    <main className={pageStyle}>
      <h1 className={titleStyle}>의뢰 피드</h1>
      <Card padding="md">
        <p className={bodyStyle}>
          작업 의뢰 피드는 마스터 프로필에서 봅니다. 업종과 활동지역을 등록하면 조건에 맞는 의뢰가
          바로 보입니다.
        </p>
        <Link href="/onboarding">
          <Button fullWidth>마스터 프로필 추가</Button>
        </Link>
      </Card>
    </main>
  );
}
