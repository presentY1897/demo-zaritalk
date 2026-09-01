/**
 * 임대인 프로필이 없는 계정이 자산 화면에 들어왔을 때의 빈 상태 (T1.1) — 서버 컴포넌트.
 *
 * API 는 같은 상황에서 403 `FORBIDDEN` 을 돌려준다(`features/landlord/ownership.ts`).
 * 화면은 막다른 길 대신 프로필 추가(T0.4 `/onboarding`)로 안내한다.
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

export function LandlordOnly() {
  return (
    <main className={pageStyle}>
      <h1 className={titleStyle}>자산</h1>
      <Card padding="md">
        <p className={bodyStyle}>
          건물·호실 관리는 임대인 프로필에서 씁니다. 임대인 유형을 추가하면 바로 열립니다.
        </p>
        <Link href="/onboarding">
          <Button fullWidth>임대인 프로필 추가</Button>
        </Link>
      </Card>
    </main>
  );
}
