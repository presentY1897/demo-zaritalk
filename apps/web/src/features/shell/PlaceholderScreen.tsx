/**
 * 탭 목적지 자리표 (T0.5).
 *
 * 탭바 경로는 T0.5 에서 확정하지만 화면은 뒤 Phase 에서 붙는다. 그때까지 404 가 나지 않게
 * "이 경로는 어느 task 가 채운다" 만 밝힌 최소 화면을 깔아 둔다.
 * 담당 task 는 이 파일을 실제 화면으로 갈아 끼우면 된다(경로·탭 구성은 그대로 유지).
 */
import { Badge, Card } from "@zari/ui";
import { css } from "styled-system/css";

const wrapStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const headStyle = css({ display: "flex", alignItems: "center", gap: "2" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const descStyle = css({ textStyle: "body", color: "text.muted" });
const rowStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "3",
  textStyle: "caption",
  color: "text.muted",
  py: "1",
});
const codeStyle = css({ fontFamily: "numeric", color: "text" });

export type PlaceholderScreenProps = {
  /** 화면 이름 (탭 라벨과 같게) */
  title: string;
  /** 이 경로를 채울 task 번호 — 예: "T1.1" */
  owner: string;
  /** 담당 task 가 만들 화면 한 줄 설명 */
  description: string;
  /** 이 화면의 경로 */
  href: string;
};

export function PlaceholderScreen({
  title,
  owner,
  description,
  href,
}: PlaceholderScreenProps) {
  return (
    <main className={wrapStyle}>
      <div className={headStyle}>
        <h1 className={titleStyle}>{title}</h1>
        <Badge tone="neutral">준비 중</Badge>
      </div>
      <p className={descStyle}>{description}</p>
      <Card padding="md">
        <div className={rowStyle}>
          <span>경로</span>
          <span className={codeStyle}>{href}</span>
        </div>
        <div className={rowStyle}>
          <span>담당 task</span>
          <span className={codeStyle}>{owner}</span>
        </div>
      </Card>
      <p className={descStyle}>
        이 화면은 <strong>{owner}</strong> 에서 구현합니다. 경로와 탭 구성은 T0.5 에서 확정했으니
        그대로 두고 내용만 채우면 됩니다.
      </p>
    </main>
  );
}
