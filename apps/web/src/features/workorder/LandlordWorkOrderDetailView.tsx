"use client";

/**
 * `/landlord/workorders/[id]` 작업 의뢰 상세 (T5.1 + T5.3) —
 * **견적 비교·수락** + 상태 변경(완료·취소) + 추천 현황.
 *
 * T2.6 스레드의 「작업 의뢰로 전환」이 도착하는 목적지이기도 하다 —
 * 전환된 의뢰는 원래 민원 스레드로 되돌아가는 링크를 함께 보여 준다.
 *
 * ## 견적 비교 (T5.3)
 *
 * 카드는 **금액이 싼 순**(수락된 것은 맨 위)으로 놓는다 — 비교의 첫 기준이 금액이기 때문이다.
 * 하나를 수락하면 그 자리에서 나머지가 「거절」로 바뀌고 의뢰가 「배정」이 된다. 이 셋은
 * 서버에서 한 트랜잭션이고, 화면은 **응답에 실려 온 갱신본**을 그대로 갈아 끼운다
 * (다시 묻지 않는다 — T5.1 상세와 같은 방식).
 *
 * 완료 처리 응답에는 함께 닫힌 민원의 상태(`complaintStatus`)가 실려 온다.
 */
import { Badge, Button, Card, CardHeader, useTrack } from "@zari/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { css, cx } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { useAcceptQuote, useUpdateWorkOrder } from "./hooks";
import {
  canTransitionWorkOrder,
  formatQuoteAmount,
  formatWorkOrderPlace,
  MASTER_CATEGORY_META,
  QUOTE_SOURCE_META,
  QUOTE_STATUS_META,
  WORK_ORDER_STATUS_META,
  WORK_ORDER_STATUS_TARGETS,
  workOrderTransitionRejectReason,
} from "./status";
import type {
  ComplaintStatusMirror,
  LandlordQuoteDto,
  LandlordWorkOrderDto,
} from "./types";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const backStyle = css({
  textStyle: "caption",
  color: "text.brand",
  textDecoration: "none",
  alignSelf: "flex-start",
});
const headerStyle = css({ display: "flex", flexDirection: "column", gap: "1" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const captionStyle = css({ textStyle: "caption", color: "text.muted" });
const metaRowStyle = css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap" });
const descriptionStyle = css({ textStyle: "body", color: "text", whiteSpace: "pre-wrap" });
const rowStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "3",
  py: "1.5",
  textStyle: "caption",
  color: "text.muted",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  _last: { borderBottomWidth: "0" },
});
const rowValueStyle = css({ textStyle: "label", color: "text" });
const buttonRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "2", mt: "3" });
const errorStyle = css({
  bg: "danger.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "danger.border",
  rounded: "field",
  p: "3",
  textStyle: "caption",
  color: "danger.text",
});
const quoteListStyle = css({ display: "flex", flexDirection: "column", gap: "3", mt: "3" });
const quoteCardStyle = css({
  p: "4",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  display: "flex",
  flexDirection: "column",
  gap: "2",
});
const quoteAcceptedStyle = css({ borderColor: "primary.border", bg: "primary.subtle" });
const quoteTopStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "3",
  flexWrap: "wrap",
});
const quoteAmountStyle = css({ textStyle: "title", color: "text" });
const quoteCompanyStyle = css({ textStyle: "label", color: "text" });
const quoteMessageStyle = css({ textStyle: "body", color: "text", whiteSpace: "pre-wrap" });
const quoteMetaStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexWrap: "wrap",
  textStyle: "caption",
  color: "text.muted",
});
const emptyQuoteStyle = css({
  mt: "3",
  p: "5",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "dashed",
  borderColor: "border",
  textAlign: "center",
  textStyle: "body",
  color: "text.muted",
});
const noticeStyle = css({
  bg: "info.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "info.border",
  rounded: "field",
  p: "3",
  textStyle: "caption",
  color: "info.text",
});

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

/** 견적 카드 한 장 — 업체·금액·메시지 + (아직 결정 전이면) 수락 버튼 */
function QuoteCard({
  quote,
  canAccept,
  pending,
  onAccept,
}: {
  quote: LandlordQuoteDto;
  canAccept: boolean;
  pending: boolean;
  onAccept: () => void;
}) {
  const status = QUOTE_STATUS_META[quote.status];
  const source = QUOTE_SOURCE_META[quote.source];
  return (
    <div
      className={cx(quoteCardStyle, quote.status === "ACCEPTED" && quoteAcceptedStyle)}
      data-testid="quote-card"
      data-quote-id={quote.id}
      data-quote-status={quote.status}
    >
      <div className={quoteTopStyle}>
        <span className={quoteAmountStyle} data-testid="quote-amount">
          {formatQuoteAmount(quote.amount)}
        </span>
        <Badge tone={status.tone} data-testid="quote-status">
          {status.label}
        </Badge>
      </div>
      <div className={quoteMetaStyle}>
        <span className={quoteCompanyStyle}>{quote.companyName}</span>
        <Badge tone={source.tone} size="sm" title={source.hint}>
          {source.label}
        </Badge>
        {quote.distanceKm !== null ? <span>· {quote.distanceKm.toFixed(1)}km</span> : null}
        <span>· {formatDay(quote.createdAt)}</span>
      </div>
      {quote.message ? <p className={quoteMessageStyle}>{quote.message}</p> : null}
      {canAccept ? (
        <Button
          size="sm"
          fullWidth
          loading={pending}
          onClick={onAccept}
          data-testid="quote-accept"
        >
          이 견적 수락
        </Button>
      ) : null}
    </div>
  );
}

export function LandlordWorkOrderDetailView({
  initialWorkOrder,
  initialQuotes,
}: {
  initialWorkOrder: LandlordWorkOrderDto;
  initialQuotes: LandlordQuoteDto[];
}) {
  const router = useRouter();
  const { track } = useTrack();
  const [workOrder, setWorkOrder] = useState(initialWorkOrder);
  const [quotes, setQuotes] = useState(initialQuotes);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [resolvedComplaint, setResolvedComplaint] = useState<ComplaintStatusMirror | null>(null);
  const changeStatus = useUpdateWorkOrder(workOrder.id);
  const accept = useAcceptQuote();

  const meta = WORK_ORDER_STATUS_META[workOrder.status];
  const category = MASTER_CATEGORY_META[workOrder.category];
  // 수락은 아직 배정 전(=요청 상태)일 때만 열린다 — 규칙은 서버(409)와 같다
  const acceptOpen = workOrder.status === "REQUESTED";

  async function submitStatus(next: (typeof WORK_ORDER_STATUS_TARGETS)[number]) {
    if (changeStatus.isPending) return;
    setTransitionError(null);
    if (!canTransitionWorkOrder(workOrder.status, next)) {
      // 화면에서 이미 비활성이지만, 규칙은 한 곳(status.ts)에서만 읽는다
      setTransitionError(workOrderTransitionRejectReason(workOrder.status, next));
      return;
    }
    const from = workOrder.status;
    try {
      const updated = await changeStatus.mutateAsync({ status: next });
      setWorkOrder(updated.workOrder);
      // 완료로 민원까지 닫혔으면 그 사실을 화면에 남긴다(세입자 쪽은 이미 「해결」이다)
      setResolvedComplaint(next === "DONE" ? updated.complaintStatus : null);
      track(TRACK_EVENTS.WORK_ORDER_STATUS_CHANGE, {
        workOrderId: workOrder.id,
        from,
        to: next,
        complaintStatus: updated.complaintStatus,
      });
      router.refresh();
    } catch (error) {
      setTransitionError(errorMessage(error) ?? "상태를 바꾸지 못했습니다.");
    }
  }

  async function submitAccept(quote: LandlordQuoteDto) {
    if (accept.isPending) return;
    setAcceptError(null);
    try {
      const result = await accept.mutateAsync(quote.id);
      // 수락 1 + 나머지 거절 + 의뢰 배정이 한 응답으로 온다 — 서버에 다시 묻지 않는다
      setWorkOrder(result.workOrder);
      setQuotes(result.quotes);
      track(TRACK_EVENTS.QUOTE_ACCEPT_COMPLETE, {
        workOrderId: workOrder.id,
        quoteId: quote.id,
        amount: quote.amount,
        source: quote.source,
        rejectedCount: result.quotes.filter((entry) => entry.status === "REJECTED").length,
      });
      router.refresh();
    } catch (error) {
      setAcceptError(errorMessage(error) ?? "견적을 수락하지 못했습니다.");
    }
  }

  return (
    <main className={pageStyle}>
      <Link href="/landlord/workorders" className={backStyle} data-testid="workorder-back">
        ← 작업 의뢰 목록
      </Link>

      <header className={headerStyle}>
        <div className={metaRowStyle}>
          <h1 className={titleStyle}>{category.label}</h1>
          <Badge tone={meta.tone} data-testid="workorder-status">
            {meta.label}
          </Badge>
          {workOrder.source === "COMPLAINT" ? <Badge tone="info">민원 전환</Badge> : null}
        </div>
        <p className={captionStyle}>
          {formatWorkOrderPlace(workOrder.place)} · 등록 {formatDay(workOrder.createdAt)}
        </p>
      </header>

      <Card padding="md">
        <CardHeader title="작업 내용" />
        <p className={descriptionStyle}>{workOrder.description}</p>
      </Card>

      {workOrder.complaintId ? (
        <Card padding="md" data-testid="workorder-complaint-link">
          <CardHeader title="전환된 민원" />
          <p className={captionStyle}>이 의뢰는 세입자 민원에서 넘어왔습니다.</p>
          <div className={buttonRowStyle}>
            <Link
              href={`/landlord/complaints/${workOrder.complaintId}`}
              className={backStyle}
              data-testid="workorder-complaint-href"
            >
              「{workOrder.complaintTitle ?? "민원"}」 스레드 열기 →
            </Link>
          </div>
        </Card>
      ) : null}

      <Card padding="md">
        <CardHeader title="의뢰 정보" />
        <div className={rowStyle}>
          <span>대상</span>
          <span className={rowValueStyle}>{formatWorkOrderPlace(workOrder.place)}</span>
        </div>
        <div className={rowStyle}>
          <span>주소</span>
          <span className={rowValueStyle}>{workOrder.place?.buildingAddress ?? "-"}</span>
        </div>
        <div className={rowStyle}>
          <span>업종</span>
          <span className={rowValueStyle}>{category.label}</span>
        </div>
        <div className={rowStyle}>
          <span>희망일</span>
          <span className={rowValueStyle}>{workOrder.desiredDate ?? "협의"}</span>
        </div>
        <div className={rowStyle}>
          <span>추천 발송</span>
          <span className={rowValueStyle} data-testid="workorder-target-count">
            PRO 마스터 {workOrder.targetCount}명
          </span>
        </div>
      </Card>

      <Card padding="md" data-testid="workorder-status-panel">
        <CardHeader title="처리 상태" />
        <p className={captionStyle}>
          작업이 끝났으면 「완료」, 더 이상 필요 없으면 「취소」로 닫습니다. 종결한 의뢰는 다시 열 수
          없습니다.
        </p>
        <div className={buttonRowStyle}>
          {WORK_ORDER_STATUS_TARGETS.map((target) => (
            <Button
              key={target}
              size="sm"
              variant={target === "CANCELLED" ? "ghost" : "secondary"}
              disabled={!canTransitionWorkOrder(workOrder.status, target) || changeStatus.isPending}
              onClick={() => submitStatus(target)}
              data-testid={`workorder-status-${target}`}
            >
              {WORK_ORDER_STATUS_META[target].label}
            </Button>
          ))}
        </div>
        {resolvedComplaint === "RESOLVED" ? (
          <p className={cx(noticeStyle, css({ mt: "3" }))} role="status" data-testid="workorder-complaint-resolved">
            연결된 민원도 「해결」로 닫았습니다. 세입자 화면에 바로 반영됩니다.
          </p>
        ) : null}
        {transitionError ? (
          <p className={cx(errorStyle, css({ mt: "3" }))} role="alert">
            {transitionError}
          </p>
        ) : null}
      </Card>

      {/* 견적 비교·수락 (T5.3) — 하나를 고르면 나머지는 그 자리에서 거절된다 */}
      <Card padding="md" data-testid="workorder-quote-slot">
        <CardHeader
          title="받은 견적"
          aside={<Badge tone={quotes.length > 0 ? "info" : "neutral"}>{quotes.length}</Badge>}
        />
        <p className={captionStyle}>
          {acceptOpen
            ? "하나를 수락하면 나머지 견적은 자동으로 거절되고 의뢰가 배정됩니다."
            : "이 의뢰는 더 이상 견적을 받지 않습니다."}
        </p>

        {quotes.length === 0 ? (
          <p className={emptyQuoteStyle} data-testid="workorder-quote-empty">
            아직 도착한 견적이 없습니다.
            <br />
            마스터가 견적을 보내면 여기에 쌓입니다.
          </p>
        ) : (
          <div className={quoteListStyle}>
            {quotes.map((quote) => (
              <QuoteCard
                key={quote.id}
                quote={quote}
                canAccept={acceptOpen && quote.status === "PROPOSED"}
                pending={accept.isPending}
                onAccept={() => submitAccept(quote)}
              />
            ))}
          </div>
        )}

        {acceptError ? (
          <p className={cx(errorStyle, css({ mt: "3" }))} role="alert">
            {acceptError}
          </p>
        ) : null}
      </Card>
    </main>
  );
}
