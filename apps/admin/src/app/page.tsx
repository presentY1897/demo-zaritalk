import { Badge, Card } from "@zari/ui";
import Link from "next/link";
import { css } from "styled-system/css";
import { ADMIN_MENU } from "./_shell/menu";

/**
 * 백오피스 홈 — 지표 대시보드 자리(T6.2)이자 업무 화면 진입점.
 *
 * 셸(사이드바·여백)은 `_shell/AdminShell` 이 맡으므로 이 파일은 콘텐츠만 그린다(T0.5).
 * 카드 목록은 사이드바와 같은 `ADMIN_MENU` 를 쓴다 — 메뉴가 두 곳에서 어긋나지 않게.
 * 색은 전부 semantic 토큰만 쓴다 — 하드코딩 색상 0.
 */

const headStyle = css({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "4",
  flexWrap: "wrap",
});
const titleStyle = css({ textStyle: "headline", color: "text" });
const leadStyle = css({ textStyle: "body", color: "text.muted", mt: "1" });
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

export default function AdminHomePage() {
  return (
    <main>
      <div className={headStyle}>
        <div>
          <h1 className={titleStyle}>자리 데모 백오피스</h1>
          <p className={leadStyle}>
            이 화면의 지표 대시보드는 T6.2 에서 채웁니다. 운영 화면은 관련 기능과 같은 Phase 에서
            세트로 붙습니다(D7) — 지금은 자리만 잡혀 있습니다.
          </p>
        </div>
        <Badge tone="brand" size="md" solid>
          Phase 0
        </Badge>
      </div>

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
