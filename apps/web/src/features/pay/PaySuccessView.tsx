"use client";

/**
 * `/tenant/pay/success` — 승인 호출 → 영수증 요약 + **원장 반영 확인** (T2.2).
 *
 * 토스 위젯이 `successUrl?paymentType=..&amount=..&orderId=..&paymentKey=..` 로 돌려보내지만
 * **여기까지 왔다고 결제가 끝난 게 아니다.** 이 화면이 `POST /api/toss/confirm` 을 호출해야
 * 승인이 완료되고 원장에 `RentPayment(CARD)` 가 생긴다(토스 문서 그대로).
 *
 * 응답의 `charge` 는 승인 뒤 **재계산된 청구**라, 화면이 따로 계산하지 않고도
 * "완납/부분납 · 남은 금액" 을 그대로 보여 줄 수 있다(= 원장 반영 확인).
 */
import { Badge, Button, Card, CardHeader, Spinner, useTrack } from "@zari/ui";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { css } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { formatKrw } from "@/features/landlord/format";
import { CHARGE_STATUS_META } from "@/features/lease/status";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { confirmPayment } from "./api";
import type { ConfirmResultDto } from "./types";

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
const rowValueStyle = css({ textStyle: "numeric", color: "text" });
const sectionLabelStyle = css({ mt: "4", mb: "2", textStyle: "label", color: "text.muted" });
const errorStyle = css({
  p: "3",
  rounded: "card",
  bg: "danger.subtle",
  color: "danger.text",
  textStyle: "caption",
});
const loadingStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "2",
  py: "8",
  textStyle: "body",
  color: "text.muted",
});
const actionStyle = css({ mt: "4", display: "flex", flexDirection: "column", gap: "2" });

export type PaySuccessParams = {
  paymentKey: string | null;
  orderId: string | null;
  amount: string | null;
};

/** 결제 화면으로 되돌아갈 링크가 있으면 재시도, 없으면 홈으로 */
export function PaySuccessView({
  params,
  chargeId,
}: {
  params: PaySuccessParams;
  chargeId: string | null;
}) {
  const { track } = useTrack();
  const startedRef = useRef(false);
  const [result, setResult] = useState<ConfirmResultDto | null>(null);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);

  const amount = params.amount === null ? Number.NaN : Number(params.amount);
  const missing =
    !params.paymentKey || !params.orderId || !Number.isSafeInteger(amount) || amount <= 0;

  useEffect(() => {
    // 승인은 **한 번만** 호출한다(StrictMode 이중 effect 방지)
    if (startedRef.current) return;
    startedRef.current = true;

    if (missing) {
      setError({ code: "INVALID_CALLBACK", message: "결제 정보가 올바르지 않습니다." });
      return;
    }

    void (async () => {
      try {
        const confirmed = await confirmPayment({
          paymentKey: params.paymentKey as string,
          orderId: params.orderId as string,
          amount,
        });
        setResult(confirmed);
        track(TRACK_EVENTS.PAY_CONFIRM_COMPLETE, {
          chargeId: confirmed.charge.id,
          orderId: confirmed.receipt.orderId,
          amount: confirmed.receipt.amount,
          chargeStatus: confirmed.charge.status,
        });
      } catch (cause) {
        const code = cause instanceof ApiError ? cause.code : "INTERNAL_ERROR";
        const message =
          cause instanceof Error ? cause.message : "결제 승인을 처리하지 못했습니다.";
        setError({ code, message });
        track(TRACK_EVENTS.PAY_CONFIRM_FAIL, {
          orderId: params.orderId ?? null,
          code,
          reason: message,
        });
      }
    })();
  }, [track, missing, amount, params.paymentKey, params.orderId]);

  if (error) {
    return (
      <main className={pageStyle}>
        <h1 className={titleStyle}>결제를 완료하지 못했습니다</h1>
        <Card padding="md" data-testid="pay-success-error">
          <p className={errorStyle}>{error.message}</p>
          <p className={amountSubStyle}>
            카드는 승인되지 않았거나 이미 처리된 결제입니다. 납부 내역에서 상태를 확인해 주세요.
          </p>
          <div className={actionStyle}>
            {chargeId ? (
              <Link href={`/tenant/pay/${chargeId}`}>
                <Button fullWidth data-testid="pay-retry">
                  다시 결제하기
                </Button>
              </Link>
            ) : null}
            <Link href="/tenant/payments">
              <Button variant="secondary" fullWidth>
                납부 내역 보기
              </Button>
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  if (!result) {
    return (
      <main className={pageStyle}>
        <h1 className={titleStyle}>결제 승인 중</h1>
        <Card padding="md">
          <p className={loadingStyle} data-testid="pay-success-loading">
            <Spinner /> 결제를 승인하고 있습니다…
          </p>
          <p className={captionStyle}>이 화면을 닫지 말아 주세요.</p>
        </Card>
      </main>
    );
  }

  const { receipt, charge } = result;
  const statusMeta = CHARGE_STATUS_META[charge.status];

  return (
    <main className={pageStyle}>
      <h1 className={titleStyle}>결제가 완료되었습니다</h1>

      <Card padding="md" data-testid="pay-receipt">
        <CardHeader title="영수증" aside={<Badge tone="success">승인</Badge>} />
        <p className={amountStyle} data-testid="pay-receipt-amount">
          {formatKrw(receipt.amount)}
        </p>
        <p className={amountSubStyle}>
          {receipt.approvedAt
            ? `${new Date(receipt.approvedAt).toLocaleString("ko-KR")} 승인`
            : "승인 완료"}
        </p>

        <p className={sectionLabelStyle}>결제 정보</p>
        <div className={rowStyle}>
          <span>결제수단</span>
          <span className={rowValueStyle}>
            {receipt.cardCompany ?? receipt.method ?? "카드"}
          </span>
        </div>
        <div className={rowStyle}>
          <span>주문번호</span>
          <span className={rowValueStyle}>{receipt.orderId}</span>
        </div>
        {receipt.receiptUrl ? (
          <div className={rowStyle}>
            <span>영수증</span>
            <a
              className={css({ textStyle: "caption", color: "text.brand" })}
              href={receipt.receiptUrl}
              target="_blank"
              rel="noreferrer"
            >
              토스 영수증 열기
            </a>
          </div>
        ) : null}
      </Card>

      {/* 원장 반영 확인 — 승인 직후 재계산된 청구를 그대로 보여 준다 */}
      <Card padding="md" data-testid="pay-ledger">
        <CardHeader
          title={`${charge.year}년 ${charge.month}월분 청구`}
          aside={<Badge tone={statusMeta.tone} data-testid="pay-charge-status">{statusMeta.label}</Badge>}
        />
        <div className={rowStyle}>
          <span>청구 금액</span>
          <span className={rowValueStyle}>{formatKrw(charge.totalDue)}</span>
        </div>
        <div className={rowStyle}>
          <span>납부 합계</span>
          <span className={rowValueStyle} data-testid="pay-charge-paid">
            {formatKrw(charge.paidAmount)}
          </span>
        </div>
        <div className={rowStyle}>
          <span>남은 금액</span>
          <span className={rowValueStyle} data-testid="pay-charge-outstanding">
            {formatKrw(charge.outstanding)}
          </span>
        </div>
        <p className={amountSubStyle}>임대인 수납 화면에도 곧바로 반영됩니다.</p>

        <div className={actionStyle}>
          <Link href="/tenant/payments">
            <Button fullWidth>납부 내역 보기</Button>
          </Link>
          <Link href="/tenant">
            <Button variant="secondary" fullWidth>
              홈으로
            </Button>
          </Link>
        </div>
      </Card>
    </main>
  );
}
