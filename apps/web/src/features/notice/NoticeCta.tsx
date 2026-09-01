"use client";

/**
 * 공개 고지서 가입 CTA (T1.8) — **[D2](../../../../../docs/DECISIONS.md#-d2-ab-실험-소재-1개-실운영) A/B 실험 소재(`notice_cta`).**
 *
 * 이 컴포넌트는 `variant` prop 만 보고 문구·배치를 바꾼다. 배정이 어디서 오든(지금은 쿼리·기본값,
 * T6.1 부터는 anonId 배정) 화면·이벤트 코드는 그대로다 — 문구·배치 원본은 `cta.ts` 한 곳이다.
 *
 * 클릭하면 `notice_cta_click` 이 `props.variant` 와 함께 나가고 `/login` 으로 이동한다.
 * anonId 쿠키가 고지서 → 로그인 → 가입까지 이어지므로 퍼널
 * `notice_view → notice_cta_click → signup_start → signup_complete` 가 한 사람으로 묶인다.
 */
import { Button, useTrack } from "@zari/ui";
import Link from "next/link";
import { css } from "styled-system/css";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { NOTICE_CTA_EXPERIMENT, noticeCtaContent, noticeCtaHref, type NoticeCtaVariant } from "./cta";

const cardStyle = css({
  bg: "primary.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "primary.border",
  rounded: "card",
  p: "gutter",
  display: "flex",
  flexDirection: "column",
  gap: "2",
});
const headlineStyle = css({ textStyle: "title", color: "text" });
const descStyle = css({ textStyle: "body", color: "text" });
const footnoteStyle = css({ textStyle: "caption", color: "text.muted", textAlign: "center" });
const linkResetStyle = css({ textDecoration: "none", display: "block", mt: "1" });
const bannerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  bg: "primary.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "primary.border",
  rounded: "card",
  px: "gutter",
  py: "3",
  textDecoration: "none",
  color: "text",
});
const bannerTextStyle = css({ textStyle: "bodyStrong", color: "text" });
const bannerArrowStyle = css({ textStyle: "bodyStrong", color: "text.brand", flexShrink: 0 });

export type NoticeCtaProps = {
  token: string;
  variant: NoticeCtaVariant;
  /** `banner` 는 금액 위 한 줄, `card` 는 하단 카드 */
  slot: "banner" | "card";
};

export function NoticeCta({ token, variant, slot }: NoticeCtaProps) {
  const content = noticeCtaContent(variant);
  const { track, flush } = useTrack();
  const href = noticeCtaHref(token, variant);

  function handleClick() {
    track(TRACK_EVENTS.NOTICE_CTA_CLICK, {
      experiment: NOTICE_CTA_EXPERIMENT,
      variant,
      placement: content.placement,
      slot,
      token,
    });
    // 로그인 화면으로 넘어가기 전에 큐를 비운다(퍼널이 끊기지 않게)
    flush();
  }

  if (slot === "banner") {
    return (
      <Link
        href={href}
        className={bannerStyle}
        onClick={handleClick}
        data-testid="notice-cta-banner"
        data-variant={variant}
      >
        <span className={bannerTextStyle}>{content.headline}</span>
        <span className={bannerArrowStyle} aria-hidden>
          →
        </span>
      </Link>
    );
  }

  return (
    <section className={cardStyle} aria-labelledby="notice-cta-headline" data-variant={variant}>
      <h2 className={headlineStyle} id="notice-cta-headline">
        {content.headline}
      </h2>
      <p className={descStyle}>{content.description}</p>
      <Link href={href} className={linkResetStyle} onClick={handleClick} data-testid="notice-cta">
        <Button fullWidth size="lg">
          {content.buttonLabel}
        </Button>
      </Link>
      <p className={footnoteStyle}>{content.footnote}</p>
    </section>
  );
}
