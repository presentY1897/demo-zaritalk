"use client";

/**
 * `/master/quotes` 마스터 「내 견적」 (T5.3) — 내가 낸 견적 목록과 상태(제안·수락·거절).
 *
 * ## push / pull 을 카드마다 표시한다
 *
 * 같은 「견적 제안」이라도 **추천(push)으로 받아 낸 것**과 **전체 피드(pull)에서 찾아 낸 것**은
 * 마스터에게 값어치가 다르다([D4](../../../../../docs/DECISIONS.md#-d4-마스터-매칭-방식--pull--push-하이브리드)) —
 * 유료 플랜이 실제로 일감을 물어다 주는지가 이 목록에서 보여야 한다. 그래서 카드마다
 * 「추천」/「피드」 배지를 달고, 상단에 **추천에서 온 견적 수**를 요약한다.
 *
 * 판정은 `WorkOrderTarget` 행의 유무다(T5.2 의 `recommended` 와 같은 값) — 스키마에 컬럼을
 * 새로 만들지 않았다.
 *
 * **읽기 전용 화면이라 쿼리 훅이 없다.** 서버 컴포넌트가 그린 목록이 곧 최신이고, 견적을 내는
 * 자리는 `/master/orders/[id]` 라 이 화면으로 돌아올 때 서버가 다시 그린다(T5.1 상세와 같은 판단).
 */
import { Badge, Card, CardHeader, useTrack } from "@zari/ui";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { css, cx } from "styled-system/css";
import {
  formatQuoteAmount,
  formatWorkOrderPlace,
  MASTER_CATEGORY_META,
  QUOTE_SOURCE_META,
  QUOTE_STATUS_META,
  QUOTE_STATUS_ORDER,
} from "@/features/workorder/status";
import type { MasterQuoteDto, QuoteStatusValue } from "@/features/workorder/types";
import { TRACK_EVENTS } from "@/lib/tracking/events";

type FilterKey = "ALL" | QuoteStatusValue;

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const headerStyle = css({ display: "flex", flexDirection: "column", gap: "1" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const captionStyle = css({ textStyle: "caption", color: "text.muted" });
const filterRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "2" });
const filterStyle = css({
  px: "3",
  py: "1.5",
  rounded: "pill",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  textStyle: "label",
  color: "text.muted",
  cursor: "pointer",
  _focusVisible: { outline: "2px solid", outlineColor: "border.focus", outlineOffset: "1px" },
});
const filterActiveStyle = css({ bg: "primary.subtle", borderColor: "primary.border", color: "text" });
const listStyle = css({ display: "flex", flexDirection: "column", gap: "3" });
const cardLinkStyle = css({ textDecoration: "none", color: "inherit", display: "block" });
const amountRowStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "3",
  flexWrap: "wrap",
  mt: "2",
});
const amountStyle = css({ textStyle: "title", color: "text" });
const bodyStyle = css({
  mt: "2",
  textStyle: "body",
  color: "text",
  overflow: "hidden",
  // 두 줄까지만 — panda 의 lineClamp 유틸이 -webkit-box·orient 까지 함께 깐다
  display: "-webkit-box",
  lineClamp: 2,
});
const metaRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  mt: "2",
  textStyle: "caption",
  color: "text.muted",
  flexWrap: "wrap",
});
const emptyStyle = css({
  p: "6",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "dashed",
  borderColor: "border",
  textAlign: "center",
  textStyle: "body",
  color: "text.muted",
});
const summaryStyle = css({
  display: "flex",
  gap: "2",
  flexWrap: "wrap",
  textStyle: "caption",
  color: "text.muted",
});

function formatDay(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

const FILTER_LABEL: Record<FilterKey, string> = {
  ALL: "전체",
  PROPOSED: QUOTE_STATUS_META.PROPOSED.label,
  ACCEPTED: QUOTE_STATUS_META.ACCEPTED.label,
  REJECTED: QUOTE_STATUS_META.REJECTED.label,
};

export function MasterQuotesView({ quotes }: { quotes: MasterQuoteDto[] }) {
  const { track } = useTrack();
  const [filter, setFilter] = useState<FilterKey>("ALL");

  const counts = useMemo(() => {
    const byStatus: Record<QuoteStatusValue, number> = { PROPOSED: 0, ACCEPTED: 0, REJECTED: 0 };
    let pushed = 0;
    for (const quote of quotes) {
      byStatus[quote.status] += 1;
      if (quote.source === "PUSH") pushed += 1;
    }
    return { byStatus, pushed, pulled: quotes.length - pushed };
  }, [quotes]);

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track(TRACK_EVENTS.MASTER_QUOTE_LIST_VIEW, {
      total: quotes.length,
      proposed: counts.byStatus.PROPOSED,
      accepted: counts.byStatus.ACCEPTED,
      rejected: counts.byStatus.REJECTED,
      pushed: counts.pushed,
      pulled: counts.pulled,
    });
  }, [track, quotes.length, counts]);

  const visible = filter === "ALL" ? quotes : quotes.filter((quote) => quote.status === filter);

  return (
    <main className={pageStyle}>
      <header className={headerStyle}>
        <h1 className={titleStyle}>내 견적</h1>
        <p className={captionStyle}>
          {quotes.length > 0
            ? `견적 ${quotes.length}건 · 수락 ${counts.byStatus.ACCEPTED}건`
            : "의뢰 상세에서 금액과 메시지로 견적을 보낼 수 있습니다."}
        </p>
        {quotes.length > 0 ? (
          <p className={summaryStyle} data-testid="master-quote-source-summary">
            <span>
              {QUOTE_SOURCE_META.PUSH.label} {counts.pushed}건
            </span>
            <span>·</span>
            <span>
              {QUOTE_SOURCE_META.PULL.label} {counts.pulled}건
            </span>
          </p>
        ) : null}
      </header>

      <div className={filterRowStyle} role="group" aria-label="견적 상태 필터">
        {(["ALL", ...QUOTE_STATUS_ORDER] as FilterKey[]).map((key) => (
          <button
            key={key}
            type="button"
            className={cx(filterStyle, filter === key && filterActiveStyle)}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            data-testid={`master-quote-filter-${key}`}
          >
            {FILTER_LABEL[key]}
            {key === "ALL" ? ` ${quotes.length}` : ` ${counts.byStatus[key]}`}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className={emptyStyle} data-testid="master-quote-empty">
          {quotes.length === 0
            ? "아직 보낸 견적이 없습니다. 의뢰 피드에서 맞는 일감을 찾아 견적을 보내 보세요."
            : `「${FILTER_LABEL[filter]}」 상태의 견적이 없습니다.`}
        </p>
      ) : (
        <div className={listStyle}>
          {visible.map((quote) => {
            const status = QUOTE_STATUS_META[quote.status];
            const source = QUOTE_SOURCE_META[quote.source];
            return (
              <Link
                key={quote.id}
                href={`/master/orders/${quote.workOrder.id}`}
                className={cardLinkStyle}
                data-testid="master-quote-card"
                data-quote-status={quote.status}
                data-quote-source={quote.source}
              >
                <Card padding="md" interactive>
                  <CardHeader
                    title={MASTER_CATEGORY_META[quote.workOrder.category].label}
                    aside={<Badge tone={status.tone}>{status.label}</Badge>}
                  />
                  <div className={amountRowStyle}>
                    <span className={amountStyle}>{formatQuoteAmount(quote.amount)}</span>
                    <Badge tone={source.tone} size="sm" title={source.hint}>
                      {source.label}
                    </Badge>
                  </div>
                  <p className={bodyStyle}>{quote.workOrder.description}</p>
                  <p className={metaRowStyle}>
                    <span>{formatWorkOrderPlace(quote.workOrder.place)}</span>
                    <span>· {quote.workOrder.landlordName}</span>
                    {quote.workOrder.distanceKm !== null ? (
                      <span>· {quote.workOrder.distanceKm.toFixed(1)}km</span>
                    ) : null}
                    <span>· {formatDay(quote.createdAt)}</span>
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
