/**
 * 임대인 홈 로딩 상태 (T1.9) — 서버 컴포넌트.
 *
 * `/landlord/page.tsx` 가 집계 조회를 `<Suspense>` 로 감싸고 이걸 fallback 으로 쓴다.
 * 카드 개수·높이를 실제 화면과 맞춰 두어 데이터가 도착할 때 레이아웃이 튀지 않는다.
 * (`loading.tsx` 를 쓰지 않은 이유 — 그 파일은 `/landlord/**` 하위 라우트 전체에 걸린다.
 *  홈만 감싸려면 페이지 안에서 경계를 잡는 편이 맞다.)
 */
import { Card } from "@zari/ui";
import { css } from "styled-system/css";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const titleStyle = css({ textStyle: "headline", color: "text" });
const barStyle = css({
  bg: "bg.subtle",
  rounded: "field",
  animation: "zariFadeIn 600ms ease-in-out infinite alternate",
});

/** 회색 막대 한 줄 — 폭·높이만 다르게 준다 */
function Bar({ w, h = "1rem" }: { w: string; h?: string }) {
  return <div className={barStyle} style={{ width: w, height: h, marginTop: "0.5rem" }} />;
}

export function LandlordHomeSkeleton() {
  return (
    <main className={pageStyle} aria-busy="true" aria-label="대시보드 불러오는 중">
      <h1 className={titleStyle}>홈</h1>
      {["collection", "overdue", "expiring", "portfolio"].map((key) => (
        <Card key={key} padding="md">
          <Bar w="40%" h="1.25rem" />
          <Bar w="70%" h="2rem" />
          <Bar w="100%" />
        </Card>
      ))}
    </main>
  );
}
