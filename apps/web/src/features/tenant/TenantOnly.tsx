/**
 * 세입자 프로필이 없는 계정이 세입자 화면에 들어왔을 때의 빈 상태 (T1.3) — 서버 컴포넌트.
 *
 * API 는 같은 상황에서 403 `FORBIDDEN` 을 돌려준다(`features/tenant/ownership.ts`).
 * 화면은 막다른 길 대신 프로필 추가(T0.4 `/onboarding`)로 안내한다 —
 * T1.9 `NoLandlordProfile` 과 같은 모양이다.
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

export function TenantOnly({ title }: { title: string }) {
  return (
    <main className={pageStyle}>
      <h1 className={titleStyle}>{title}</h1>
      <Card padding="md">
        <p className={bodyStyle} data-testid="tenant-only">
          내 계약과 납부 내역은 세입자 프로필에서 열립니다. 세입자 유형을 추가하면 임대인이 내
          번호로 등록해 둔 계약을 바로 확인할 수 있습니다.
        </p>
        <Link href="/onboarding">
          <Button fullWidth>세입자 프로필 추가</Button>
        </Link>
      </Card>
    </main>
  );
}
