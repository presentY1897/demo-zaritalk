import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Badge } from "@zari/ui";
import { css } from "styled-system/css";
import { CHARGE_STATUS_META, messageKindLabel } from "@/features/notice/constants";
import { assignVariant } from "@/features/ab/assign";
import {
  NOTICE_CTA_EXPERIMENT,
  noticeCtaContent,
  previewNoticeCtaVariant,
  resolveNoticeCtaVariant,
} from "@/features/notice/cta";
import { formatDateKey, formatDueBadge, formatKstDateTime } from "@/features/notice/format";
import { NoticeCta } from "@/features/notice/NoticeCta";
import { NoticeOpenTracker } from "@/features/notice/NoticeOpenTracker";
import { loadPublicNotice } from "@/features/notice/queries";
import { formatWon } from "@/features/notice/template";
import { isNoticeTokenShape } from "@/features/notice/token";
import { ANON_ID_COOKIE, isAnonId } from "@/lib/tracking/anon-id";

/**
 * `/notice/[token]` — **비로그인 공개 고지서** (T1.8).
 *
 * ## 왜 `(app)` 바로 아래인가 (route group)
 *
 * 로그인 강제는 `(app)/(protected)/layout.tsx` 가 한다([T0.5](../../../../../../docs/tasks/t0.5-shell-profile.md)).
 * 그 그룹 밖, 즉 `(app)` 바로 아래에 두면 **480px 셸은 그대로 쓰면서 로그인은 걸리지 않는다** —
 * T0.5 가 `/search`·`/refund/calculator` 와 함께 이 경로를 그렇게 두기로 이미 정해 뒀다.
 * `(auth)` 는 로그인·온보딩 전용 레이아웃이라 여기 두면 안 된다.
 * 비로그인 방문자에게는 탭바가 그려지지 않는다(`AppShell` 은 프로필이 없으면 탭바를 뺀다).
 *
 * ## 렌더링
 *
 * 내용은 **서버 렌더**다 — 카카오톡·슬랙 링크 미리보기(OG)와 검색 크롤러가 JS 없이 읽어야 하고,
 * 미가입 세입자가 첫 화면을 기다리지 않아야 한다. 반대로 **열람 기록(`openedAt`)과 `notice_view`
 * 는 브라우저가 실제로 실행하는** `NoticeOpenTracker` → `GET /api/notices/[token]` 에서만 남긴다
 * (봇이 열람으로 잡히면 임대인 이력의 "열람"을 믿을 수 없다).
 *
 * ## SEO·OG
 *
 * OG 는 링크 공유(카카오톡)용으로 채우고, **검색 색인은 막는다**(`robots: noindex`) —
 * 이 페이지에는 이름·호실·금액 같은 개인정보가 있다. 공개 SEO 대상은 매물·커뮤니티(T6.4)다.
 */

/** metadata 와 페이지가 같은 요청에서 DB를 두 번 읽지 않게 한다. */
const getNotice = cache((token: string) => loadPublicNotice(token));

const SITE_NAME = "자리 데모";
const metadataBase = new URL(process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000");

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const notice = isNoticeTokenShape(token) ? await getNotice(token) : null;

  if (!notice) {
    return {
      title: `고지서를 찾을 수 없습니다 — ${SITE_NAME}`,
      robots: { index: false, follow: false },
    };
  }

  const title = `${notice.buildingName} ${notice.unitLabel} ${notice.title}`;
  const description = notice.charge
    ? `납부하실 금액 ${formatWon(notice.charge.totalDue)} · 납부기한 ${formatDateKey(notice.charge.dueDate)} · ${notice.landlordName} 임대인`
    : `계약 만기 ${formatDateKey(notice.lease.endDate)} · ${notice.landlordName} 임대인`;

  return {
    metadataBase,
    title: `${title} — ${SITE_NAME}`,
    description,
    // 개인정보가 있는 페이지라 색인은 막고, 링크 미리보기(OG)만 채운다
    robots: { index: false, follow: false },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      locale: "ko_KR",
      url: `/notice/${notice.token}`,
      title,
      description,
    },
    twitter: { card: "summary", title, description },
  };
}

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const brandRowStyle = css({ display: "flex", alignItems: "center", gap: "2" });
const brandMarkStyle = css({
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
});
const brandNameStyle = css({ textStyle: "bodyStrong", color: "text" });
const sentAtStyle = css({ textStyle: "caption", color: "text.muted", ml: "auto" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const subtitleStyle = css({ textStyle: "body", color: "text.muted", mt: "1" });
const cardStyle = css({
  bg: "bg.card",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  rounded: "card",
  p: "gutter",
});
const cardHeadStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  mb: "3",
});
const cardTitleStyle = css({ textStyle: "subtitle", color: "text" });
const rowStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "2",
  py: "1.5",
  textStyle: "body",
  color: "text.muted",
});
const rowValueStyle = css({ color: "text", fontFamily: "numeric" });
const totalRowStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "2",
  mt: "2",
  pt: "3",
  borderTopWidth: "hairline",
  borderTopStyle: "solid",
  borderTopColor: "border",
  textStyle: "bodyStrong",
  color: "text",
});
const totalValueStyle = css({ textStyle: "title", color: "text", fontFamily: "numeric" });
const outstandingStyle = css({ textStyle: "title", color: "danger.text", fontFamily: "numeric" });
const dueRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  mt: "3",
  bg: "bg.subtle",
  rounded: "field",
  px: "3",
  py: "2.5",
  textStyle: "body",
  color: "text",
});
const accountValueStyle = css({
  textStyle: "subtitle",
  color: "text",
  fontFamily: "numeric",
  mt: "1",
});
const messageStyle = css({
  textStyle: "body",
  color: "text",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});
const footerStyle = css({
  textStyle: "caption",
  color: "text.muted",
  textAlign: "center",
  pb: "4",
});

export default async function PublicNoticePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  if (!isNoticeTokenShape(token)) notFound();

  const notice = await getNotice(token);
  if (!notice) notFound();

  const query = await searchParams;
  const variantParam = Array.isArray(query.variant) ? query.variant[0] : query.variant;

  // **T6.1 이 갈아 끼운 한 줄** — anonId 해시로 배정한다(T1.8 이 남겨 둔 자리 그대로).
  // 쿠키는 proxy 가 첫 요청에서 심고 같은 요청의 헤더에도 넣어 주므로 여기서 바로 읽힌다.
  const anonId = (await cookies()).get(ANON_ID_COOKIE)?.value;
  const assigned = isAnonId(anonId) ? await assignVariant(anonId, NOTICE_CTA_EXPERIMENT) : null;

  // `?variant=` 는 **미리보기**다 — 배정을 덮어쓰지 않고 화면만 바꾼다(`cta.ts` 주석 참고).
  // 이 화면에서 나가는 노출·클릭 이벤트의 `props.variant` 는 화면에 그린 값이라,
  // 배정과 어긋나면 어드민 퍼널(T6.2)이 그 이벤트를 세지 않는다 = 실험이 오염되지 않는다.
  const variant = previewNoticeCtaVariant(variantParam) ?? resolveNoticeCtaVariant(assigned?.variant);
  const cta = noticeCtaContent(variant);

  const charge = notice.charge;
  const status = charge ? CHARGE_STATUS_META[charge.status] : null;
  const visibleLines = charge?.lines.filter((line) => line.amount > 0) ?? [];

  return (
    <main className={pageStyle} data-testid="notice-public">
      {/* 열람 기록 + notice_view — 브라우저에서만 실행된다 */}
      <NoticeOpenTracker token={notice.token} variant={variant} />

      <header>
        <div className={brandRowStyle}>
          <span className={brandMarkStyle} aria-hidden>
            자
          </span>
          <span className={brandNameStyle}>자리 데모</span>
          <span className={sentAtStyle}>{formatKstDateTime(notice.sentAt)} 발송</span>
        </div>
        <h1 className={titleStyle} data-testid="notice-title">
          {notice.title}
        </h1>
        <p className={subtitleStyle}>
          {notice.buildingName} {notice.unitLabel} · {notice.tenantName}님
        </p>
      </header>

      {/* 변형 B 는 금액 위에 배너를 한 줄 더 올린다(배치 실험) */}
      {cta.placement === "top" ? (
        <NoticeCta token={notice.token} variant={variant} slot="banner" />
      ) : null}

      {charge ? (
        <section className={cardStyle} aria-labelledby="notice-charge">
          <div className={cardHeadStyle}>
            <h2 className={cardTitleStyle} id="notice-charge">
              {charge.year}년 {charge.month}월 청구 내역
            </h2>
            {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
          </div>

          {visibleLines.map((line) => (
            <p className={rowStyle} key={line.key}>
              <span>{line.label}</span>
              <span className={rowValueStyle}>{formatWon(line.amount)}</span>
            </p>
          ))}

          <p className={totalRowStyle}>
            <span>합계</span>
            <span className={totalValueStyle} data-testid="notice-total">
              {formatWon(charge.totalDue)}
            </span>
          </p>

          {charge.paidAmount > 0 ? (
            <>
              <p className={rowStyle}>
                <span>이미 납부</span>
                <span className={rowValueStyle}>{formatWon(charge.paidAmount)}</span>
              </p>
              <p className={totalRowStyle}>
                <span>남은 금액</span>
                <span
                  className={charge.outstanding > 0 ? outstandingStyle : totalValueStyle}
                  data-testid="notice-outstanding"
                >
                  {formatWon(charge.outstanding)}
                </span>
              </p>
            </>
          ) : null}

          <p className={dueRowStyle}>
            <span>납부기한 {formatDateKey(charge.dueDate)}</span>
            <Badge tone={charge.daysUntilDue < 0 ? "danger" : "info"}>
              {formatDueBadge(charge.daysUntilDue)}
            </Badge>
          </p>
        </section>
      ) : (
        <section className={cardStyle} aria-labelledby="notice-lease">
          <div className={cardHeadStyle}>
            <h2 className={cardTitleStyle} id="notice-lease">
              계약 정보
            </h2>
            <Badge tone="info">{messageKindLabel(notice.kind)}</Badge>
          </div>
          <p className={rowStyle}>
            <span>계약 기간</span>
            <span className={rowValueStyle}>
              {formatDateKey(notice.lease.startDate)} ~ {formatDateKey(notice.lease.endDate)}
            </span>
          </p>
          <p className={rowStyle}>
            <span>월세 / 관리비</span>
            <span className={rowValueStyle}>
              {formatWon(notice.lease.monthlyRent)} / {formatWon(notice.lease.maintenanceFee)}
            </span>
          </p>
          <p className={dueRowStyle}>
            <span>만기 {formatDateKey(notice.lease.endDate)}</span>
            <Badge tone={notice.lease.daysUntilExpiry < 0 ? "danger" : "info"}>
              {formatDueBadge(notice.lease.daysUntilExpiry)}
            </Badge>
          </p>
        </section>
      )}

      {charge ? (
        <section className={cardStyle} aria-labelledby="notice-account">
          <h2 className={cardTitleStyle} id="notice-account">
            납부 계좌
          </h2>
          <p className={accountValueStyle} data-testid="notice-account">
            {notice.bankAccount.bankName} {notice.bankAccount.number}
          </p>
          <p className={css({ textStyle: "caption", color: "text.muted", mt: "1" })}>
            예금주 {notice.bankAccount.holder} · 입금자명을 세입자 이름으로 남겨 주세요.
          </p>
          <p className={css({ textStyle: "caption", color: "warning.text", mt: "2" })}>
            데모용 가상 계좌입니다. 실제 입금은 이루어지지 않습니다.
          </p>
        </section>
      ) : null}

      <section className={cardStyle} aria-labelledby="notice-message">
        <h2 className={cardTitleStyle} id="notice-message">
          임대인이 보낸 안내
        </h2>
        <p className={css({ textStyle: "caption", color: "text.muted", mb: "2" })}>
          {notice.landlordName} 임대인 · {notice.tenantPhoneMasked}
        </p>
        <p className={messageStyle} data-testid="notice-message">
          {notice.message}
        </p>
      </section>

      <NoticeCta token={notice.token} variant={variant} slot="card" />

      <p className={footerStyle}>
        이 고지서는 자리 데모에서 만든 예시입니다. 실제 청구·입금과는 무관합니다.
        <br />
        {notice.buildingAddress}
      </p>
    </main>
  );
}
