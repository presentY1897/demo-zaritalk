"use client";

/**
 * 청구 상세 시트 (T1.5) — 내역 분해 · 납부 타임라인 · 「받음 체크」 · 「가상 입금 시뮬레이션」.
 *
 * 금액은 한 줄도 여기서 계산하지 않는다. 화면에 그리는 값(`lines`·`outstanding`·`status`·
 * `overdueDays`)은 서버가 원장 엔진 `describeCharge` 로 만들어 준 `ChargeDto` 그대로다.
 * 남은 금액을 넘겨 받으면 서버가 400 을 주고 그 문구를 그대로 보여 준다(초과 납부 금지).
 *
 * 두 입력의 차이는 **수단과 메모**뿐이다:
 * - 「받음 체크」 → `MANUAL_CHECK`. 임대인이 계좌를 눈으로 확인하고 금액만 적는다(부분납 가능)
 * - 「가상 입금 시뮬레이션」 → `VIRTUAL_TRANSFER`. 입금자명이 `memo` 에 담겨 타임라인에 보인다
 */
import { Badge, Button, Input, Sheet, useTrack } from "@zari/ui";
import { useEffect, useState } from "react";
import { css } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { formatKrw } from "@/features/landlord/format";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { useCreatePayment, useDeletePayment, type PaymentScope } from "./hooks";
import { CHARGE_STATUS_META, PAYMENT_METHOD_LABEL } from "./status";
import type { ChargeDto } from "./types";

const sectionStyle = css({ display: "flex", flexDirection: "column", gap: "2", mb: "4" });
const sectionTitleStyle = css({ textStyle: "label", color: "text.muted" });
const rowStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "3",
  py: "2",
  textStyle: "body",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  _last: { borderBottomWidth: "0" },
});
const keyStyle = css({ color: "text.muted" });
const numericStyle = css({ textStyle: "numeric", color: "text" });
const totalRowStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "3",
  pt: "3",
  mt: "1",
  borderTopWidth: "hairline",
  borderTopStyle: "solid",
  borderTopColor: "border.strong",
  textStyle: "bodyStrong",
  color: "text",
});
const outstandingStyle = css({ textStyle: "numeric", color: "text.brand" });
const timelineItemStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  py: "2",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  _last: { borderBottomWidth: "0" },
});
const timelineMetaStyle = css({ textStyle: "caption", color: "text.muted" });
const formRowStyle = css({ display: "flex", gap: "2", alignItems: "flex-end" });
const growStyle = css({ flex: "1", minW: "0" });
const errorBoxStyle = css({
  bg: "danger.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "danger.border",
  rounded: "field",
  p: "3",
  textStyle: "caption",
  color: "danger.text",
});
const hintStyle = css({ textStyle: "caption", color: "text.muted" });
const paidBoxStyle = css({
  bg: "success.subtle",
  rounded: "card",
  p: "3",
  textStyle: "body",
  color: "success.text",
});

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

export type ChargeSheetProps = {
  /** 납부 후 같이 비울 캐시 범위(계약·호실·건물) */
  scope: PaymentScope;
  charge: ChargeDto | null;
  open: boolean;
  onClose: () => void;
  /** 고지서 발송 시트를 여는 콜백(T1.7). 없으면 버튼을 그리지 않는다. */
  onSendNotice?: (chargeId: string) => void;
};

export function ChargeSheet({ scope, charge, open, onClose, onSendNotice }: ChargeSheetProps) {
  const { track } = useTrack();
  const createPayment = useCreatePayment(scope);
  const deletePayment = useDeletePayment(scope);

  const [manualAmount, setManualAmount] = useState("");
  const [virtualAmount, setVirtualAmount] = useState("");
  const [payerName, setPayerName] = useState("");

  // 청구가 바뀌거나 납부가 반영되면 입력칸을 남은 금액으로 되맞춘다
  useEffect(() => {
    const rest = charge?.outstanding ?? 0;
    setManualAmount(rest > 0 ? String(rest) : "");
    setVirtualAmount(rest > 0 ? String(rest) : "");
  }, [charge?.id, charge?.outstanding]);

  if (!charge) return null;

  const meta = CHARGE_STATUS_META[charge.status];
  const pending = createPayment.isPending || deletePayment.isPending;
  const settled = charge.outstanding === 0;

  async function record(method: "MANUAL_CHECK" | "VIRTUAL_TRANSFER", amount: string, memo?: string) {
    if (!charge) return;
    const value = Number(amount.replace(/[,\s]/g, ""));
    if (!Number.isFinite(value) || value <= 0) return;
    try {
      const updated = await createPayment.mutateAsync({
        chargeId: charge.id,
        amount: Math.trunc(value),
        method,
        memo: memo?.trim() || null,
      });
      track(TRACK_EVENTS.PAYMENT_RECORD_COMPLETE, {
        method,
        amount: Math.trunc(value),
        status: updated.status,
      });
      setPayerName("");
    } catch {
      // 초과 납부(400) 등 실패 문구는 아래 alert 에 그대로 나온다
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${charge.year}년 ${charge.month}월 청구`}
      description={`납부기한 ${charge.dueDate.replaceAll("-", ".")}${
        charge.overdueDays > 0 ? ` · ${charge.overdueDays}일 경과` : ""
      }`}
    >
      <div data-testid="charge-sheet" data-charge-status={charge.status}>
        <div className={sectionStyle}>
          <div className={css({ display: "flex", justifyContent: "flex-end" })}>
            <Badge tone={meta.tone} size="md" data-testid="charge-sheet-status">
              {meta.label}
            </Badge>
          </div>
          {/* 0원 줄은 숨긴다 — `lines` 는 항상 4줄로 온다(원장 엔진 규약) */}
          {charge.lines
            .filter((line) => line.amount > 0)
            .map((line) => (
              <div key={line.key} className={rowStyle}>
                <span className={keyStyle}>{line.label}</span>
                <span className={numericStyle}>{formatKrw(line.amount)}</span>
              </div>
            ))}
          <div className={totalRowStyle}>
            <span>청구 총액</span>
            <span className={numericStyle} data-testid="charge-sheet-total">
              {formatKrw(charge.totalDue)}
            </span>
          </div>
          <div className={rowStyle}>
            <span className={keyStyle}>납부액</span>
            <span className={numericStyle} data-testid="charge-sheet-paid">
              {formatKrw(charge.paidAmount)}
            </span>
          </div>
          <div className={rowStyle}>
            <span className={keyStyle}>남은 금액</span>
            <span className={outstandingStyle} data-testid="charge-sheet-outstanding">
              {formatKrw(charge.outstanding)}
            </span>
          </div>
        </div>

        <div className={sectionStyle}>
          <h3 className={sectionTitleStyle}>납부 기록</h3>
          {charge.payments.length === 0 ? (
            <p className={hintStyle}>아직 납부 기록이 없습니다.</p>
          ) : (
            charge.payments.map((payment) => (
              <div key={payment.id} className={timelineItemStyle} data-testid="payment-row">
                <div>
                  <div className={numericStyle}>{formatKrw(payment.amount)}</div>
                  <div className={timelineMetaStyle}>
                    {formatDateTime(payment.paidAt)} · {PAYMENT_METHOD_LABEL[payment.method]}
                    {payment.memo ? ` · ${payment.memo}` : ""}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={async () => {
                    try {
                      await deletePayment.mutateAsync(payment.id);
                      track(TRACK_EVENTS.PAYMENT_CANCEL_COMPLETE, {
                        method: payment.method,
                        amount: payment.amount,
                      });
                    } catch {
                      /* 실패 문구는 아래 alert 에 표시된다 */
                    }
                  }}
                  data-testid="payment-delete"
                >
                  취소
                </Button>
              </div>
            ))
          )}
        </div>

        {settled ? (
          <p className={paidBoxStyle} data-testid="charge-settled">
            이 달 청구는 모두 받았습니다.
          </p>
        ) : (
          <>
            <div className={sectionStyle}>
              <h3 className={sectionTitleStyle}>받음 체크</h3>
              <div className={formRowStyle}>
                <div className={growStyle}>
                  <Input
                    label="받은 금액(원)"
                    inputMode="numeric"
                    value={manualAmount}
                    onChange={(event) => setManualAmount(event.target.value)}
                    data-testid="manual-amount"
                  />
                </div>
                <Button
                  disabled={pending}
                  loading={createPayment.isPending}
                  onClick={() => record("MANUAL_CHECK", manualAmount)}
                  data-testid="manual-submit"
                >
                  받음
                </Button>
              </div>
              <p className={hintStyle}>일부만 적으면 부분납으로 쌓입니다.</p>
            </div>

            <div className={sectionStyle}>
              <h3 className={sectionTitleStyle}>가상 입금 시뮬레이션</h3>
              <Input
                label="입금자명"
                placeholder="박세입"
                value={payerName}
                onChange={(event) => setPayerName(event.target.value)}
                data-testid="virtual-payer"
              />
              <div className={formRowStyle}>
                <div className={growStyle}>
                  <Input
                    label="입금액(원)"
                    inputMode="numeric"
                    value={virtualAmount}
                    onChange={(event) => setVirtualAmount(event.target.value)}
                    data-testid="virtual-amount"
                  />
                </div>
                <Button
                  variant="secondary"
                  disabled={pending}
                  loading={createPayment.isPending}
                  onClick={() => record("VIRTUAL_TRANSFER", virtualAmount, payerName)}
                  data-testid="virtual-submit"
                >
                  입금
                </Button>
              </div>
              <p className={hintStyle}>
                데모용 가상 계좌 입금입니다. 누르면 즉시 수납에 반영됩니다.
              </p>
            </div>
          </>
        )}

        {onSendNotice ? (
          <Button
            variant="ghost"
            fullWidth
            data-testid="charge-notice-send"
            onClick={() => onSendNotice(charge.id)}
          >
            이 청구로 고지서 발송
          </Button>
        ) : null}

        {createPayment.error || deletePayment.error ? (
          <p className={errorBoxStyle} role="alert">
            {errorMessage(createPayment.error ?? deletePayment.error)}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
