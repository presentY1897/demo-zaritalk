"use client";

/**
 * `/tenant/pay/[chargeId]` — 청구 확인 + 토스 **결제위젯**(테스트모드) (T2.2).
 *
 * ## 위젯 SDK 호출 순서 (`@tosspayments/tosspayments-sdk` v2)
 * ```
 * loadTossPayments(clientKey)              // 스크립트 로드 → TossPaymentsSDK
 *   → tossPayments.widgets({ customerKey })
 *   → widgets.setAmount({ currency: "KRW", value })   // ★ 렌더 전에 반드시
 *   → widgets.renderPaymentMethods({ selector })      // 결제수단 UI
 *   → widgets.renderAgreement({ selector })           // 필수 약관 UI
 *   → widgets.requestPayment({ orderId, orderName, successUrl, failUrl, customerName })
 * ```
 * `setAmount` 를 빼먹으면 `NotSetupAmountError`, 두 번 렌더하면
 * `PaymentMethodsWidgetAlreadyRenderedError` 가 난다 — React StrictMode 의 이중 effect 를
 * `startedRef` 로 막는다.
 *
 * ## 금액
 * 화면이 보여 주는 금액은 서버가 계산해 준 `charge.outstanding`(원장 엔진 `calcOutstanding`)이고,
 * **실제 결제 금액은 결제 직전 `POST /api/toss/checkout` 이 다시 확정한다.** 둘이 다르면
 * (그 사이 임대인이 수기 납부를 기록한 경우) 결제를 진행하지 않고 새로고침을 안내한다 —
 * 화면에 남아 있던 옛 금액으로 결제되는 일이 없게 하기 위해서다.
 */
import { loadTossPayments, type TossPaymentsWidgets } from "@tosspayments/tosspayments-sdk";
import { Badge, Button, Card, CardHeader, Spinner, useTrack } from "@zari/ui";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { css } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { formatDate, formatKrw } from "@/features/landlord/format";
import { CHARGE_STATUS_META } from "@/features/lease/status";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { createCheckout } from "./api";
import type { PayCheckoutViewDto } from "./types";

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
const widgetSlotStyle = css({ minH: "10" });
const noticeStyle = css({
  p: "3",
  rounded: "card",
  bg: "warning.subtle",
  color: "warning.text",
  textStyle: "caption",
});
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
  py: "6",
  textStyle: "caption",
  color: "text.muted",
});
const actionStyle = css({ mt: "4", display: "flex", flexDirection: "column", gap: "2" });
const linkStyle = css({ textStyle: "caption", color: "text.brand", textAlign: "center" });

const METHOD_SELECTOR = "#toss-payment-method";
const AGREEMENT_SELECTOR = "#toss-payment-agreement";

type WidgetState = "loading" | "ready" | "error";

export function PayCheckoutView({ data }: { data: PayCheckoutViewDto }) {
  const { charge, lease, orderName, customerKey, customerName } = data;
  const { track } = useTrack();
  const startedRef = useRef(false);
  const viewedRef = useRef(false);
  const widgetsRef = useRef<TossPaymentsWidgets | null>(null);

  const [widgetState, setWidgetState] = useState<WidgetState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const amount = charge.outstanding;
  const settled = amount <= 0;
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
  const statusMeta = CHARGE_STATUS_META[charge.status];

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    track(TRACK_EVENTS.PAY_CHECKOUT_VIEW, {
      chargeId: charge.id,
      amount,
      status: charge.status,
    });
  }, [track, charge.id, charge.status, amount]);

  useEffect(() => {
    if (settled) return;
    if (!clientKey) {
      setWidgetState("error");
      setError("결제 설정이 없습니다. 관리자에게 문의해 주세요.");
      return;
    }
    // StrictMode 의 이중 effect 로 위젯이 두 번 렌더되면 SDK 가 에러를 던진다.
    // **cleanup 에서 취소 플래그를 세우지 않는다** — 개발 모드의 두 번째 effect 는 이 가드로
    // 곧바로 빠져나가므로, 첫 번째 실행의 결과를 버리면 위젯이 영원히 준비되지 않는다.
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      try {
        const tossPayments = await loadTossPayments(clientKey);
        const widgets = tossPayments.widgets({ customerKey });
        // ★ 금액을 먼저 설정해야 결제수단 UI 를 렌더할 수 있다
        await widgets.setAmount({ currency: "KRW", value: amount });
        await Promise.all([
          widgets.renderPaymentMethods({ selector: METHOD_SELECTOR }),
          widgets.renderAgreement({ selector: AGREEMENT_SELECTOR }),
        ]);
        widgetsRef.current = widgets;
        setWidgetState("ready");
      } catch (cause) {
        setWidgetState("error");
        setError(
          cause instanceof Error
            ? `결제 화면을 불러오지 못했습니다. (${cause.message})`
            : "결제 화면을 불러오지 못했습니다.",
        );
      }
    })();
  }, [clientKey, customerKey, amount, settled]);

  async function handlePay(): Promise<void> {
    const widgets = widgetsRef.current;
    if (!widgets || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // 결제 직전에 서버가 금액을 다시 확정한다 — 클라이언트 금액은 신뢰하지 않는다
      const checkout = await createCheckout(charge.id);
      if (checkout.amount !== amount) {
        setError(
          `청구 금액이 ${formatKrw(checkout.amount)}(으)로 바뀌었습니다. 화면을 새로고침해 주세요.`,
        );
        setSubmitting(false);
        return;
      }

      track(TRACK_EVENTS.PAY_REQUEST_START, {
        chargeId: charge.id,
        orderId: checkout.orderId,
        amount: checkout.amount,
      });

      await widgets.requestPayment({
        orderId: checkout.orderId,
        orderName: checkout.orderName,
        successUrl: `${window.location.origin}/tenant/pay/success`,
        failUrl: `${window.location.origin}/tenant/pay/fail`,
        customerName: checkout.customerName,
      });
      // Redirect 방식이라 여기까지 오면 브라우저가 이미 이동 중이다
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : "결제를 시작하지 못했습니다.";
      setError(message);
      track(TRACK_EVENTS.PAY_CONFIRM_FAIL, {
        chargeId: charge.id,
        code: cause instanceof ApiError ? cause.code : "WIDGET_ERROR",
        reason: message,
      });
      setSubmitting(false);
    }
  }

  return (
    <main className={pageStyle}>
      <header className={headerStyle}>
        <h1 className={titleStyle}>자리페이로 결제</h1>
        <p className={captionStyle}>
          {lease.buildingName} {lease.unitLabel} · 임대인 {lease.landlordName}
        </p>
      </header>

      <Card padding="md" data-testid="pay-charge">
        <CardHeader
          title={`${charge.year}년 ${charge.month}월분`}
          aside={<Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>}
        />
        <p className={captionStyle}>기한 {formatDate(charge.dueDate)}</p>
        <p className={amountStyle} data-testid="pay-amount">
          {formatKrw(settled ? charge.totalDue : amount)}
        </p>
        <p className={amountSubStyle}>
          {settled
            ? "이미 납부가 끝난 청구입니다."
            : charge.paidAmount > 0
              ? `청구 ${formatKrw(charge.totalDue)} 중 ${formatKrw(charge.paidAmount)} 납부 — 남은 금액만 결제합니다.`
              : "청구 전액을 결제합니다."}
        </p>

        <p className={sectionLabelStyle}>청구 내역</p>
        {charge.lines
          .filter((line) => line.amount > 0)
          .map((line) => (
            <div key={line.key} className={rowStyle}>
              <span>{line.label}</span>
              <span className={rowValueStyle}>{formatKrw(line.amount)}</span>
            </div>
          ))}
        {charge.paidAmount > 0 ? (
          <div className={rowStyle}>
            <span>이미 납부</span>
            <span className={rowValueStyle}>-{formatKrw(charge.paidAmount)}</span>
          </div>
        ) : null}
      </Card>

      {settled ? (
        <Card padding="md" data-testid="pay-settled">
          <p className={amountSubStyle}>
            남은 금액이 없어 결제할 것이 없습니다. 납부 내역에서 확인할 수 있습니다.
          </p>
          <div className={actionStyle}>
            <Link href="/tenant/payments">
              <Button variant="secondary" fullWidth>
                납부 내역 보기
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <Card padding="md" data-testid="pay-widget">
          <CardHeader title="결제수단" aside={<Badge tone="info">테스트 모드</Badge>} />
          {widgetState === "loading" ? (
            <p className={loadingStyle} data-testid="pay-widget-loading">
              <Spinner size="sm" /> 결제 화면을 불러오는 중…
            </p>
          ) : null}
          {/* 토스 위젯이 이 두 자리에 iframe 을 그린다 */}
          <div id="toss-payment-method" className={widgetSlotStyle} />
          <div id="toss-payment-agreement" className={widgetSlotStyle} />

          {error ? (
            <p className={errorStyle} data-testid="pay-error">
              {error}
            </p>
          ) : null}

          <div className={actionStyle}>
            <Button
              fullWidth
              onClick={handlePay}
              disabled={widgetState !== "ready"}
              loading={submitting}
              data-testid="pay-submit"
            >
              {formatKrw(amount)} 결제하기
            </Button>
            <p className={noticeStyle}>
              토스페이먼츠 테스트 모드입니다. 실제로 돈이 빠져나가지 않습니다.
            </p>
            <Link href="/tenant" className={linkStyle}>
              나중에 결제하기
            </Link>
          </div>
        </Card>
      )}
    </main>
  );
}
