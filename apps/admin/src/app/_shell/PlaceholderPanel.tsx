/**
 * 어드민 메뉴 자리표 (T0.5).
 *
 * 사이드바 경로는 T0.5 에서 확정하고, 화면은 담당 task 가 채운다(D7 — 기능과 세트로 구현).
 * 담당 task 는 해당 `page.tsx` 를 실제 화면으로 갈아 끼우면 된다.
 */
import { Badge, Card } from "@zari/ui";
import { css } from "styled-system/css";
import { findMenuItem } from "./menu";

const headStyle = css({ display: "flex", alignItems: "center", gap: "3" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const descStyle = css({ textStyle: "body", color: "text.muted", mt: "2" });
const cardStyle = css({ mt: "6", maxW: "560px" });
const rowStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "3",
  py: "1",
  textStyle: "caption",
  color: "text.muted",
});
const codeStyle = css({ fontFamily: "numeric", color: "text" });

export function PlaceholderPanel({ href }: { href: string }) {
  const item = findMenuItem(href);
  const label = item?.label ?? href;
  const owner = item?.owner ?? "미정";

  return (
    <main>
      <div className={headStyle}>
        <h1 className={titleStyle}>{label}</h1>
        <Badge tone="neutral">준비 중</Badge>
      </div>
      <p className={descStyle}>{item?.description ?? "담당 task 에서 화면을 구현합니다."}</p>
      <Card padding="lg" className={cardStyle}>
        <div className={rowStyle}>
          <span>경로</span>
          <span className={codeStyle}>{href}</span>
        </div>
        <div className={rowStyle}>
          <span>담당 task</span>
          <span className={codeStyle}>{owner}</span>
        </div>
      </Card>
    </main>
  );
}
