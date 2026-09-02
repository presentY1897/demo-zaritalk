"use client";

/**
 * `/tenant/pay/fail` — 실패 사유 + 재시도 (T2.2).
 *
 * 위젯이 `failUrl?code=..&message=..&orderId=..` 로 돌려보낸다(SDK v2 Redirect 방식).
 * 여기서는 **DB 를 건드리지 않는다** — 이 화면은 GET 이고, 사용자가 결제창을 닫은 것뿐일 수도 있다.
 * 주문의 최종 상태는 승인(`confirm`)이나 웹훅이 정한다.
 */
import { Button, Card, CardHeader, useTrack } from "@zari/ui";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { css } from "styled-system/css";
import { TRACK_EVENTS } from "@/lib/tracking/events";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const titleStyle = css({ textStyle: "headline", color: "text" });
const bodyStyle = css({ textStyle: "body", color: "text.muted", mt: "1" });
const reasonStyle = css({
  p: "3",
  rounded: "card",
  bg: "danger.subtle",
  color: "danger.text",
  textStyle: "caption",
});
const codeStyle = css({ textStyle: "caption", color: "text.muted", mt: "2" });
const actionStyle = css({ mt: "4", display: "flex", flexDirection: "column", gap: "2" });

/** 토스가 자주 돌려주는 코드는 우리 말로 바꿔 준다. 모르는 코드는 토스 메시지를 그대로 보여 준다 */
const REASON_BY_CODE: Record<string, string> = {
  PAY_PROCESS_CANCELED: "결제를 취소했습니다.",
  PAY_PROCESS_ABORTED: "결제 진행 중 오류가 발생해 중단되었습니다.",
  REJECT_CARD_COMPANY: "카드사에서 결제를 거절했습니다. 다른 카드로 시도해 주세요.",
  INVALID_CARD_EXPIRATION: "카드 유효기간이 올바르지 않습니다.",
  EXCEED_MAX_CARD_INSTALLMENT_PLAN: "선택한 할부 개월 수를 사용할 수 없습니다.",
  NOT_SUPPORTED_INSTALLMENT_PLAN_CARD_OR_MERCHANT: "이 카드는 할부를 지원하지 않습니다.",
};

export function PayFailView({
  code,
  message,
  chargeId,
}: {
  code: string | null;
  message: string | null;
  chargeId: string | null;
}) {
  const { track } = useTrack();
  const trackedRef = useRef(false);

  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    track(TRACK_EVENTS.PAY_CONFIRM_FAIL, {
      orderId: null,
      code: code ?? "UNKNOWN",
      reason: message ?? "",
    });
  }, [track, code, message]);

  const reason =
    (code ? REASON_BY_CODE[code] : undefined) ?? message ?? "결제가 완료되지 않았습니다.";

  return (
    <main className={pageStyle}>
      <h1 className={titleStyle}>결제가 완료되지 않았습니다</h1>

      <Card padding="md" data-testid="pay-fail">
        <CardHeader title="실패 사유" />
        <p className={reasonStyle} data-testid="pay-fail-reason">
          {reason}
        </p>
        {code ? (
          <p className={codeStyle} data-testid="pay-fail-code">
            오류 코드 · {code}
          </p>
        ) : null}
        <p className={bodyStyle}>
          카드는 승인되지 않았습니다. 청구는 그대로 남아 있으니 다시 시도할 수 있습니다.
        </p>

        <div className={actionStyle}>
          {chargeId ? (
            <Link href={`/tenant/pay/${chargeId}`}>
              <Button fullWidth data-testid="pay-retry">
                다시 결제하기
              </Button>
            </Link>
          ) : null}
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
