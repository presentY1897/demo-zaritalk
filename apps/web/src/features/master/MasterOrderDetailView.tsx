"use client";

/**
 * `/master/orders/[id]` 마스터 시점 의뢰 상세 (T5.2 + T5.3 견적 제안).
 *
 * 추천(push)으로 받은 의뢰든 전체 피드(pull)에서 찾은 의뢰든 **같은 화면**을 쓴다 —
 * 다른 것은 상단 배지(추천 여부)와 발송 시각뿐이다.
 *
 * ## 견적 제안 (T5.3)
 *
 * **의뢰당 1회**다(`@@unique([workOrderId, masterProfileId])`). 그래서 이미 낸 의뢰에서는
 * 버튼 자리가 **내가 낸 견적 카드**로 바뀐다 — 다시 눌러 409 를 받게 두지 않는다.
 * `REQUESTED` 가 아닌 의뢰(배정·완료·취소)에서도 제안 버튼은 닫힌다(서버 규칙과 같은 함수).
 */
import { Badge, Button, Card, CardHeader, Input, Sheet, useTrack } from "@zari/ui";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { css, cx } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { useSubmitQuote } from "@/features/workorder/hooks";
import {
  acceptsNewQuote,
  formatQuoteAmount,
  formatWorkOrderPlace,
  MASTER_CATEGORY_META,
  QUOTE_SOURCE_META,
  QUOTE_STATUS_META,
  quoteRejectReason,
  WORK_ORDER_STATUS_META,
} from "@/features/workorder/status";
import type { MasterQuoteDto, MasterWorkOrderDto } from "@/features/workorder/types";
import { TRACK_EVENTS } from "@/lib/tracking/events";

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
const titleRowStyle = css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const captionStyle = css({ textStyle: "caption", color: "text.muted" });
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
const hintStyle = css({ textStyle: "caption", color: "text.muted", mt: "2" });
const formStyle = css({ display: "flex", flexDirection: "column", gap: "field" });
const labelStyle = css({ textStyle: "label", color: "text", mb: "1.5" });
const textareaStyle = css({
  w: "full",
  minH: "96px",
  p: "3",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  textStyle: "body",
  color: "text",
  resize: "vertical",
  _focusVisible: { outline: "2px solid", outlineColor: "border.focus", outlineOffset: "1px" },
});
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
const myQuoteStyle = css({
  mt: "3",
  p: "4",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "primary.border",
  bg: "primary.subtle",
  display: "flex",
  flexDirection: "column",
  gap: "2",
});
const quoteTopStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "3",
  flexWrap: "wrap",
});
const quoteAmountStyle = css({ textStyle: "title", color: "text" });
const quoteMessageStyle = css({ textStyle: "body", color: "text", whiteSpace: "pre-wrap" });

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

function formatMoment(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function MasterOrderDetailView({
  workOrder,
  initialQuote,
}: {
  workOrder: MasterWorkOrderDto;
  /** 내가 이 의뢰에 이미 낸 견적(없으면 null) — 의뢰당 1회라 있으면 제안 자리가 카드로 바뀐다 */
  initialQuote: MasterQuoteDto | null;
}) {
  const { track } = useTrack();
  const meta = WORK_ORDER_STATUS_META[workOrder.status];
  const category = MASTER_CATEGORY_META[workOrder.category];

  const [quote, setQuote] = useState(initialQuote);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const submit = useSubmitQuote(workOrder.id);

  // 견적을 받을 수 있는 상태인가 — 판정 함수는 서버(409)와 같은 것을 쓴다
  const openForQuotes = acceptsNewQuote(workOrder.status);
  const parsedAmount = Number(amount);
  const canSubmit = Number.isInteger(parsedAmount) && parsedAmount >= 1_000;

  async function submitQuote() {
    if (!canSubmit || submit.isPending) return;
    try {
      const result = await submit.mutateAsync({
        amount: parsedAmount,
        message: message.trim() === "" ? null : message.trim(),
      });
      setQuote(result.quote);
      track(TRACK_EVENTS.QUOTE_SUBMIT_COMPLETE, {
        workOrderId: workOrder.id,
        quoteId: result.quote.id,
        amount: result.quote.amount,
        source: result.quote.source,
      });
      setOpen(false);
      setAmount("");
      setMessage("");
    } catch {
      /* 실패 문구는 errorMessage 로 시트 안에 표시된다 */
    }
  }

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track(TRACK_EVENTS.MASTER_ORDER_VIEW, {
      workOrderId: workOrder.id,
      recommended: workOrder.recommended,
      distanceKm: workOrder.distanceKm,
    });
  }, [track, workOrder.id, workOrder.recommended, workOrder.distanceKm]);

  return (
    <main className={pageStyle}>
      <Link href="/master" className={backStyle} data-testid="master-order-back">
        ← 의뢰 피드
      </Link>

      <header className={headerStyle}>
        <div className={titleRowStyle}>
          <h1 className={titleStyle}>{category.label}</h1>
          <Badge tone={meta.tone} data-testid="master-order-status">
            {meta.label}
          </Badge>
          {workOrder.recommended ? (
            <Badge tone="brand" data-testid="master-order-recommended">
              추천
            </Badge>
          ) : null}
        </div>
        <p className={captionStyle}>
          {formatWorkOrderPlace(workOrder.place)} · {workOrder.distanceKm.toFixed(1)}km
        </p>
      </header>

      <Card padding="md">
        <CardHeader title="작업 내용" />
        <p className={descriptionStyle}>{workOrder.description}</p>
      </Card>

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
          <span>거리</span>
          <span className={rowValueStyle} data-testid="master-order-distance">
            {workOrder.distanceKm.toFixed(1)}km
          </span>
        </div>
        <div className={rowStyle}>
          <span>임대인</span>
          <span className={rowValueStyle}>{workOrder.landlordName}</span>
        </div>
        <div className={rowStyle}>
          <span>희망일</span>
          <span className={rowValueStyle}>{workOrder.desiredDate ?? "협의"}</span>
        </div>
        <div className={rowStyle}>
          <span>{workOrder.recommended ? "추천 도착" : "의뢰 등록"}</span>
          <span className={rowValueStyle}>
            {formatMoment(workOrder.sentAt ?? workOrder.createdAt)}
          </span>
        </div>
      </Card>

      {/* 견적 제안 (T5.3) — 의뢰당 1회. 이미 냈으면 그 견적 카드가 이 자리를 대신한다 */}
      <Card padding="md" data-testid="master-quote-slot">
        <CardHeader
          title="견적 제안"
          aside={
            quote ? (
              <Badge tone={QUOTE_STATUS_META[quote.status].tone} data-testid="master-quote-status">
                {QUOTE_STATUS_META[quote.status].label}
              </Badge>
            ) : (
              <Badge tone={QUOTE_SOURCE_META[workOrder.recommended ? "PUSH" : "PULL"].tone}>
                {QUOTE_SOURCE_META[workOrder.recommended ? "PUSH" : "PULL"].label}
              </Badge>
            )
          }
        />

        {quote ? (
          <div className={myQuoteStyle} data-testid="master-my-quote">
            <div className={quoteTopStyle}>
              <span className={quoteAmountStyle}>{formatQuoteAmount(quote.amount)}</span>
              <span className={captionStyle}>{formatMoment(quote.createdAt)}</span>
            </div>
            {quote.message ? <p className={quoteMessageStyle}>{quote.message}</p> : null}
            <p className={hintStyle}>
              {quote.status === "ACCEPTED"
                ? "임대인이 이 견적을 수락했습니다. 배정된 작업입니다."
                : quote.status === "REJECTED"
                  ? "다른 업체의 견적이 수락돼 이 견적은 거절됐습니다."
                  : "의뢰당 한 번만 제안할 수 있습니다. 임대인의 수락을 기다리는 중입니다."}
            </p>
          </div>
        ) : (
          <>
            <Button
              fullWidth
              variant="secondary"
              disabled={!openForQuotes}
              onClick={() => setOpen(true)}
              data-testid="master-quote-cta"
            >
              견적 보내기
            </Button>
            <p className={hintStyle}>
              {openForQuotes
                ? "금액과 메시지를 적어 보내면 임대인이 다른 견적과 나란히 비교합니다. 의뢰당 한 번만 보낼 수 있습니다."
                : quoteRejectReason(workOrder.status)}
            </p>
          </>
        )}
      </Card>

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          submit.reset();
        }}
        title="견적 보내기"
        description={`${formatWorkOrderPlace(workOrder.place)} · ${category.label}`}
        footer={
          <Button
            fullWidth
            loading={submit.isPending}
            disabled={!canSubmit}
            onClick={submitQuote}
            data-testid="master-quote-submit"
          >
            견적 보내기
          </Button>
        }
      >
        <div className={formStyle}>
          <Input
            type="number"
            inputMode="numeric"
            min={1000}
            step={1000}
            label="견적 금액 (원)"
            helper="1,000원 이상 · 원 단위 정수로 적어 주세요."
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            data-testid="master-quote-amount"
          />
          <div>
            <p className={labelStyle}>제안 메시지 (선택)</p>
            <textarea
              className={textareaStyle}
              value={message}
              maxLength={500}
              placeholder="예) 순환펌프 교체 기준입니다. 방문 점검 후 확정하겠습니다."
              onChange={(event) => setMessage(event.target.value)}
              data-testid="master-quote-message"
            />
          </div>
          {submit.error ? (
            <p className={cx(errorStyle)} role="alert">
              {errorMessage(submit.error)}
            </p>
          ) : null}
        </div>
      </Sheet>
    </main>
  );
}
