/**
 * 중개인 프로필(또는 사무소 위치·활동반경)이 없는 계정이 중개인 화면에 들어왔을 때의 빈 상태 (T3.7) —
 * 서버 컴포넌트. T1.1 `LandlordOnly`·T5.2 `MasterOnly` 와 같은 모양이다.
 *
 * API 는 같은 상황에서 403 `FORBIDDEN` 을 준다(`features/brokerage/ownership.ts`).
 * 화면은 막다른 길 대신 프로필 추가(T0.4 `/onboarding`)로 안내한다 —
 * 중개인 프로필은 등록할 때 사무소 위치·활동반경을 함께 받으므로 한 화면에서 둘 다 해결된다.
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

export function RealtorOnly({ title = "중개 요청" }: { title?: string }) {
  return (
    <main className={pageStyle}>
      <h1 className={titleStyle}>{title}</h1>
      <Card padding="md">
        <p className={bodyStyle}>
          공실 중개 요청은 중개인 프로필로 받습니다. 사무소 위치와 활동반경을 등록하면 반경 안의
          공실 요청이 바로 들어옵니다.
        </p>
        <Link href="/onboarding">
          <Button fullWidth>중개인 프로필 추가</Button>
        </Link>
      </Card>
    </main>
  );
}
