import { Badge, Card } from "@zari/ui";
import Link from "next/link";
import { css } from "styled-system/css";
import { fetchMetricsFunnel, fetchMetricsOverview } from "./_dashboard/actions";
import { MetricsDashboard } from "./_dashboard/MetricsDashboard";
import { resolveRange } from "./_dashboard/shared";
import { ADMIN_MENU } from "./_shell/menu";

/**
 * 백오피스 홈 — **지표 대시보드**(T6.2) + 업무 화면 진입점.
 *
 * 셸(사이드바·여백)은 `_shell/AdminShell` 이 맡으므로 이 파일은 콘텐츠만 그린다(T0.5).
 * 집계는 web 의 지표 API 두 개를 서버 액션이 읽어 온다 — 어드민에는 로그인이 없어 브라우저가
 * 직접 부를 수 없다(`_dashboard/actions.ts` 주석). 시크릿·`NEXT_PUBLIC_WEB_URL` 을 요청 시점에
 * 읽어야 배포 환경변수를 바꿔도 바로 반영되므로 `force-dynamic` 이다(환급 심사·크론과 같은 이유).
 *
 * 아래 카드 목록은 사이드바와 같은 `ADMIN_MENU` 를 쓴다 — 메뉴가 두 곳에서 어긋나지 않게.
 * 색은 전부 semantic 토큰만 쓴다 — 하드코딩 색상 0.
 *
 * `searchParams` 는 Next 16 규약대로 Promise 다.
 */
export const dynamic = "force-dynamic";

const groupStyle = css({ mt: "8" });
const groupTitleStyle = css({ textStyle: "subtitle", color: "text", mb: "3" });
const gridStyle = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr", md: "repeat(2, 1fr)", xl: "repeat(3, 1fr)" },
  gap: "4",
});
const cardLinkStyle = css({ textDecoration: "none", color: "inherit", display: "block" });
const cardTopStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
});
const sectionLabelStyle = css({ textStyle: "subtitle", color: "text" });
const sectionDescStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminHomePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const range = resolveRange(params.days);

  const [overview, funnel] = await Promise.all([
    fetchMetricsOverview({ days: range.days, months: range.months }),
    fetchMetricsFunnel(),
  ]);

  return (
    <main>
      <MetricsDashboard days={range.days} overview={overview} funnel={funnel} />

      {/* "대시보드" 그룹은 이 화면 자신(T6.2)이라 카드로 다시 걸지 않는다 */}
      {ADMIN_MENU.filter((group) => group.title !== "대시보드").map((group) => (
        <section key={group.title} className={groupStyle}>
          <h2 className={groupTitleStyle}>{group.title}</h2>
          <div className={gridStyle}>
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} className={cardLinkStyle}>
                <Card padding="lg" interactive>
                  <div className={cardTopStyle}>
                    <span className={sectionLabelStyle}>{item.label}</span>
                    <Badge tone="neutral">{item.owner}</Badge>
                  </div>
                  <p className={sectionDescStyle}>{item.description}</p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
