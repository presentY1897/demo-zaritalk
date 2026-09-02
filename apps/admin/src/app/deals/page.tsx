import { Badge } from "@zari/ui";
import { css } from "styled-system/css";
import { DealSyncPanel } from "./DealSyncPanel";
import { getWebUrl } from "./actions";

/**
 * `/deals` — 실거래가 수집 수동 실행 (T4.3).
 *
 * 정기 수집은 매일 도는 일일 크론(`POST /api/cron/daily`)이 이어서 돌린다. 이 화면은 데모에서
 * 하루를 기다리지 않고 특정 지역·월을 지금 긁어 오기 위한 것이다 — **같은 엔드포인트**
 * (`POST /api/deals/sync`)를 **같은 시크릿**(`CRON_SECRET`)으로 부른다.
 *
 * `NEXT_PUBLIC_WEB_URL` 을 요청 시점에 읽어야 배포 환경변수를 바꿔도 화면에 바로 반영된다.
 */
export const dynamic = "force-dynamic";

const headStyle = css({ display: "flex", alignItems: "center", gap: "3" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const descStyle = css({ textStyle: "body", color: "text.muted", mt: "2", maxW: "720px" });
const listStyle = css({
  textStyle: "body",
  color: "text.muted",
  mt: "3",
  pl: "5",
  listStyleType: "disc",
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

export default async function AdminDealsPage() {
  const webUrl = await getWebUrl();

  return (
    <main>
      <div className={headStyle}>
        <h1 className={titleStyle}>실거래가 수집</h1>
        <Badge tone="brand">T4.3</Badge>
      </div>
      <p className={descStyle}>
        국토교통부 아파트 실거래가(매매·전월세)를 시군구·월 단위로 수집합니다. 같은 조합을 몇 번
        수집해도 중복이 쌓이지 않도록(멱등) 만들어져 있어 시연 중에 안심하고 눌러도 됩니다.
      </p>
      <ul className={listStyle}>
        <li>지역을 「자동」으로 두면 구독 지역 + 최근 수집 지역을 스스로 고릅니다(최대 20곳)</li>
        <li>월을 비우면 당월 + 전월을 훑습니다 — 신고 기한이 30일이라 지난달이 계속 늘어납니다</li>
        <li>한 (지역·월·엔드포인트)가 실패해도 나머지는 저장됩니다 — 실패 조각은 아래에 나옵니다</li>
        <li>새로 저장된 거래가 구독 조건에 걸리면 알림톡 시뮬(MessageLog)이 함께 남습니다</li>
      </ul>

      <DealSyncPanel webUrl={webUrl} />
    </main>
  );
}
