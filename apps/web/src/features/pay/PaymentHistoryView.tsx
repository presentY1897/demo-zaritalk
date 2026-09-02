"use client";

/**
 * `/tenant/payments` — 내 납부 이력(카드/기타 구분) (T2.2).
 *
 * 임대인이 수기로 기록한 납부(받음 체크·가상 입금)와 세입자가 직접 낸 자리페이 카드 결제가
 * **같은 `RentPayment` 테이블**에 쌓이므로 한 화면에서 함께 보여 주고 수단만 배지로 구분한다.
 * 금액·상태는 서버가 원장 엔진 기준으로 만들어 준 DTO 를 그대로 그린다.
 */
import { Badge, Card, CardHeader, useTrack } from "@zari/ui";
import { useEffect, useRef } from "react";
import { css } from "styled-system/css";
import { formatKrw } from "@/features/landlord/format";
import { CHARGE_STATUS_META, PAYMENT_METHOD_LABEL } from "@/features/lease/status";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import type { TenantPaymentDto, TenantPaymentsDto } from "./types";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const titleStyle = css({ textStyle: "headline", color: "text" });
const captionStyle = css({ textStyle: "caption", color: "text.muted" });
const amountStyle = css({ textStyle: "display", fontFamily: "numeric", color: "text" });
const amountSubStyle = css({ textStyle: "body", color: "text.muted", mt: "1" });
const emptyStyle = css({
  p: "5",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "dashed",
  borderColor: "border",
  textAlign: "center",
  textStyle: "body",
  color: "text.muted",
});
const itemStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  py: "3",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  _last: { borderBottomWidth: "0" },
});
const itemTopStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
});
const itemTitleStyle = css({ textStyle: "label", color: "text" });
const itemAmountStyle = css({ textStyle: "numeric", color: "text" });
const itemMetaStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  textStyle: "caption",
  color: "text.muted",
});
const receiptLinkStyle = css({ textStyle: "caption", color: "text.brand" });

/** 카드 결제는 브랜드 배지, 나머지는 중립 배지 */
function methodTone(method: TenantPaymentDto["method"]) {
  return method === "CARD" ? ("brand" as const) : ("neutral" as const);
}

function formatPaidAt(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function PaymentHistoryView({ data }: { data: TenantPaymentsDto }) {
  const { track } = useTrack();
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    track(TRACK_EVENTS.PAY_HISTORY_VIEW, {
      count: data.totals.count,
      cardCount: data.totals.cardCount,
    });
  }, [track, data.totals.count, data.totals.cardCount]);

  return (
    <main className={pageStyle}>
      <header>
        <h1 className={titleStyle}>납부 내역</h1>
        <p className={captionStyle}>내 계약에 기록된 모든 납부입니다.</p>
      </header>

      <Card padding="md" data-testid="payments-summary">
        <CardHeader
          title="납부 합계"
          aside={<Badge tone="neutral">{data.totals.count}건</Badge>}
        />
        <p className={amountStyle} data-testid="payments-total">
          {formatKrw(data.totals.amount)}
        </p>
        <p className={amountSubStyle} data-testid="payments-card-total">
          자리페이 카드 결제 {data.totals.cardCount}건 · {formatKrw(data.totals.cardAmount)}
        </p>
      </Card>

      <Card padding="md">
        <CardHeader title="전체 납부" />
        {data.payments.length === 0 ? (
          <p className={emptyStyle} data-testid="payments-empty">
            아직 납부 기록이 없습니다.
          </p>
        ) : (
          <div data-testid="payments-list">
            {data.payments.map((payment) => {
              const chargeMeta = CHARGE_STATUS_META[payment.charge.status];
              return (
                <div
                  key={payment.id}
                  className={itemStyle}
                  data-testid="payment-row"
                  data-payment-method={payment.method}
                >
                  <div className={itemTopStyle}>
                    <span className={itemTitleStyle}>
                      {payment.charge.year}.{String(payment.charge.month).padStart(2, "0")}{" "}
                      {payment.lease.buildingName} {payment.lease.unitLabel}
                    </span>
                    <span className={itemAmountStyle}>{formatKrw(payment.amount)}</span>
                  </div>
                  <div className={itemMetaStyle}>
                    <Badge tone={methodTone(payment.method)} size="sm">
                      {PAYMENT_METHOD_LABEL[payment.method]}
                    </Badge>
                    <span>{formatPaidAt(payment.paidAt)}</span>
                    <Badge tone={chargeMeta.tone} size="sm">
                      {chargeMeta.label}
                    </Badge>
                    {payment.toss?.receiptUrl ? (
                      <a
                        className={receiptLinkStyle}
                        href={payment.toss.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        영수증
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </main>
  );
}
