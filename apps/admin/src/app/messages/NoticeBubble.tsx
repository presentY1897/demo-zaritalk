/**
 * 알림톡 말풍선 미리보기 (T6.3).
 *
 * 세입자가 실제로 받은 화면과 같은 모양으로 본문을 보여 준다 — 어드민이 "무엇이 나갔는지"
 * 를 문장 그대로 확인하는 것이 이 화면의 목적이다. web 의 `NoticePreview`(T1.7)와 같은
 * 생김새지만, 어드민은 별도 앱이라 컴포넌트를 import 할 수 없어 여기에 다시 그린다
 * (규칙이 아니라 **표현**이라 복제해도 어긋날 것이 없다 — 본문 문장은 web 이 만든다).
 *
 * 색은 전부 semantic 토큰 — 하드코딩 색상 0.
 */
import { css } from "styled-system/css";

const wrapStyle = css({
  bg: "bg.subtle",
  rounded: "card",
  p: "3",
  display: "flex",
  flexDirection: "column",
  gap: "2",
  maxW: "460px",
});
const headStyle = css({
  textStyle: "caption",
  color: "text.muted",
  display: "flex",
  justifyContent: "space-between",
  gap: "2",
});
const bubbleStyle = css({
  bg: "primary.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "primary.border",
  rounded: "sheet",
  px: "3",
  py: "3",
  display: "flex",
  flexDirection: "column",
  gap: "2",
});
const titleStyle = css({ textStyle: "bodyStrong", color: "text" });
const bodyStyle = css({
  textStyle: "body",
  color: "text",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});
const linkStyle = css({
  mt: "1",
  textAlign: "center",
  textStyle: "label",
  color: "text.brand",
  bg: "bg.card",
  rounded: "button",
  py: "2",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "primary.border",
});

export function NoticeBubble({
  title,
  body,
  channel,
  noticePath,
}: {
  title: string;
  body: string;
  channel: string;
  noticePath: string | null;
}) {
  return (
    <div className={wrapStyle} data-testid="admin-message-preview">
      <div className={headStyle}>
        <span>알림톡 미리보기</span>
        <span>{channel}</span>
      </div>
      <div className={bubbleStyle}>
        <span className={titleStyle}>{title}</span>
        <p className={bodyStyle}>{body}</p>
        {noticePath ? <span className={linkStyle}>고지서 열기 ({noticePath})</span> : null}
      </div>
    </div>
  );
}
