"use client";

/**
 * 알림톡 미리보기 말풍선 (T1.7) — 카카오 알림톡을 **모사한 것일 뿐** 실제 발송은 없다.
 *
 * 임대인이 "무엇이 나가는지"를 보내기 전에 그대로 보는 것이 이 화면의 전부다.
 * 문구는 `renderNoticeTemplate`(순수 함수)이 만든 것을 그대로 그린다 — 미리보기와 실제 발송
 * 본문이 어긋날 수 없다(같은 함수를 API 도 쓴다).
 */
import { css } from "styled-system/css";
import { NOTICE_CHANNEL_NAME } from "./constants";

const wrapStyle = css({
  bg: "bg.subtle",
  rounded: "card",
  p: "3",
  display: "flex",
  flexDirection: "column",
  gap: "2",
});
const channelRowStyle = css({ display: "flex", alignItems: "center", gap: "2" });
const avatarStyle = css({
  w: "28px",
  h: "28px",
  rounded: "pill",
  bg: "primary",
  color: "primary.fg",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textStyle: "caption",
  fontWeight: "700",
  flexShrink: 0,
});
const channelNameStyle = css({ textStyle: "caption", color: "text" });
const bubbleStyle = css({
  bg: "bg.card",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  overflow: "hidden",
});
const bubbleHeadStyle = css({
  bg: "primary.subtle",
  px: "3",
  py: "2",
  textStyle: "caption",
  color: "text",
  fontWeight: "600",
});
const bubbleBodyStyle = css({
  px: "3",
  py: "3",
  textStyle: "body",
  color: "text",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});
const bubbleButtonStyle = css({
  borderTopWidth: "hairline",
  borderTopStyle: "solid",
  borderTopColor: "border",
  px: "3",
  py: "2.5",
  textAlign: "center",
  textStyle: "label",
  color: "text.muted",
});
const noteStyle = css({ textStyle: "caption", color: "text.muted" });

export type NoticePreviewProps = {
  title: string;
  body: string;
  /** 발송 후 실제 링크가 있으면 보여 준다. 발송 전에는 자리만 잡는다 */
  linkLabel?: string;
};

export function NoticePreview({ title, body, linkLabel = "고지서 확인하기" }: NoticePreviewProps) {
  return (
    <div className={wrapStyle} data-testid="notice-preview">
      <div className={channelRowStyle}>
        <span className={avatarStyle} aria-hidden>
          자
        </span>
        <span className={channelNameStyle}>{NOTICE_CHANNEL_NAME} 알림톡</span>
      </div>

      <div className={bubbleStyle}>
        <p className={bubbleHeadStyle}>{title}</p>
        <p className={bubbleBodyStyle} data-testid="notice-preview-body">
          {body}
        </p>
        {/* 실제 알림톡의 링크 버튼 자리 — 미리보기라 누를 수 없다 */}
        <p className={bubbleButtonStyle}>{linkLabel}</p>
      </div>

      <p className={noteStyle}>
        데모 시뮬레이터입니다. <strong>실제 알림톡·SMS 는 발송되지 않습니다</strong> — 발송하면
        발송 이력과 공개 고지서 링크만 생성됩니다.
      </p>
    </div>
  );
}
