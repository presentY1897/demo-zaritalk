import { Badge, buttonRecipe, Card } from "@zari/ui";
import type { BadgeTone } from "@zari/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { css } from "styled-system/css";
import { homeHrefFor } from "@/features/shell/tabs";
import { currentUser, getActiveProfile } from "@/features/shell/session";

/**
 * `/` — 진입점 (T0.5).
 *
 * - **로그인**: 활성 프로필의 홈 탭으로 보낸다(`/landlord`·`/tenant`·`/realtor`·`/master`).
 *   프로필이 하나도 없으면(온보딩 전) `/onboarding`(T0.4)으로.
 * - **비로그인**: 아래 랜딩을 그대로 보여 준다. `/` 에 로그인 리다이렉트를 걸면
 *   `e2e/smoke.spec.ts`(`/` 200 + h1) 가 깨지므로 이 화면은 `(protected)` 그룹 밖에 둔다.
 *
 * 원래 이 파일은 T0.6 토큰 확인용 스캐폴딩이었다(`app/page.tsx`). 셸이 생기면서
 * `(app)/page.tsx` 로 옮기고, 로그인 시트는 T0.4 `/login` 이 가져가 링크로 대체했다.
 * 색은 전부 semantic 토큰만 쓴다 — 하드코딩 색상 0.
 */

type Role = {
  key: string;
  label: string;
  desc: string;
  tone: BadgeTone;
  status: string;
};

const roles: Role[] = [
  {
    key: "landlord",
    label: "임대인",
    desc: "수납관리 · 고지서 · 임대장부",
    tone: "success",
    status: "완납 3건",
  },
  {
    key: "tenant",
    label: "세입자",
    desc: "월세 카드결제 · 환급 · 매물 탐색",
    tone: "warning",
    status: "부분납 1건",
  },
  {
    key: "realtor",
    label: "중개인",
    desc: "공실 중개 요청 수신",
    tone: "info",
    status: "신규 요청",
  },
  {
    key: "master",
    label: "마스터",
    desc: "청소 · 인테리어 · 수리 견적",
    tone: "neutral",
    status: "준비 중",
  },
];

const pageStyle = css({
  px: "gutter",
  pb: "section",
  display: "flex",
  flexDirection: "column",
  gap: "section",
});
const headerStyle = css({ pt: "10", display: "flex", flexDirection: "column", gap: "2" });
const brandStyle = css({ textStyle: "display", color: "text" });
const brandAccentStyle = css({ color: "text.brand" });
const leadStyle = css({ textStyle: "body", color: "text.muted" });
const listStyle = css({ display: "flex", flexDirection: "column", gap: "3" });
const cardTopStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
});
const roleLabelStyle = css({ textStyle: "subtitle", color: "text" });
const roleDescStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });
const noticeStyle = css({
  bg: "primary.subtle",
  border: "1px solid",
  borderColor: "primary.border",
  rounded: "card",
  p: "gutter",
  textStyle: "caption",
  color: "text",
});

export default async function HomePage() {
  const user = await currentUser();
  if (user) {
    const active = await getActiveProfile(user);
    // 온보딩 전(프로필 0개)이면 유형 선택부터 — /onboarding 은 T0.4 소관이다
    redirect(active ? homeHrefFor(active.type) : "/onboarding");
  }

  return (
    <main className={pageStyle}>
      <header className={headerStyle}>
        <h1 className={brandStyle}>
          자리 <span className={brandAccentStyle}>데모</span>
        </h1>
        <p className={leadStyle}>
          임대인·세입자·중개인·마스터를 잇는 임대관리 데모 (스캐폴딩 단계)
        </p>
        <div>
          <Badge tone="brand" size="md" solid>
            Phase 0
          </Badge>
        </div>
      </header>

      <section className={listStyle}>
        {roles.map((role) => (
          <Card key={role.key}>
            <div className={cardTopStyle}>
              <h2 className={roleLabelStyle}>{role.label}</h2>
              <Badge tone={role.tone}>{role.status}</Badge>
            </div>
            <p className={roleDescStyle}>{role.desc}</p>
          </Card>
        ))}
      </section>

      <p className={noticeStyle}>
        브랜드 옐로는 면(버튼·배지)에만 쓰고, 글자는 잉크색이나 어두운 옐로를 쓴다 —
        흰 배경에서 대비 4.5:1 이상을 지키기 위한 규칙이다.
      </p>

      {/* /login 은 T0.4 담당 — 아직 머지 전이면 404 가 정상이다 */}
      <Link href="/login" className={buttonRecipe({ size: "lg", fullWidth: true })}>
        로그인하고 시작하기
      </Link>
    </main>
  );
}
