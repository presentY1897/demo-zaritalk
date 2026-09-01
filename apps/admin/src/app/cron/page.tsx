import { Badge } from "@zari/ui";
import { css } from "styled-system/css";
import { CronTriggerPanel } from "./CronTriggerPanel";
import { getWebUrl } from "./actions";

/**
 * `/cron` — 원장 크론 수동 실행 (T1.4).
 *
 * 데모에서는 하루를 기다릴 수 없으니 운영자가 버튼으로 크론을 돌린다.
 * 실제 스케줄은 `apps/web/vercel.json` 의 `crons`(매일 UTC 18:00 = KST 03:00)가 담당한다.
 *
 * `NEXT_PUBLIC_WEB_URL` 을 요청 시점에 읽어야 배포 환경변수를 바꿔도 화면에 바로 반영된다
 * (기본값이 빌드 시점에 굳어 버리면 로컬 주소가 프로덕션에 박힌다).
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

export default async function CronPage() {
  const webUrl = await getWebUrl();

  return (
    <main>
      <div className={headStyle}>
        <h1 className={titleStyle}>원장 크론</h1>
        <Badge tone="brand">T1.4</Badge>
      </div>
      <p className={descStyle}>
        매일 한 번 도는 원장 작업을 지금 실행합니다. 몇 번을 눌러도 결과가 같도록(멱등) 만들어져 있어
        시연 중에 안심하고 눌러도 됩니다.
      </p>
      <ul className={listStyle}>
        <li>ACTIVE 계약의 당월 청구 생성 — 이미 있으면 건너뜁니다</li>
        <li>기한이 지난 미납 청구를 연체(OVERDUE)로 전환</li>
        <li>전월 미납 잔액 이월 + 연체료 일할 가산</li>
        <li>만기 90일 이내 계약에 만기 임박 알림 1회</li>
      </ul>

      <CronTriggerPanel webUrl={webUrl} />
    </main>
  );
}
