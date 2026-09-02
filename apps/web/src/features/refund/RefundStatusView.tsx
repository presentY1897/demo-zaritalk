"use client";

/**
 * `/tenant/refund` 화면 (T2.4) — **상태 스테퍼**와 보완 대응.
 *
 * 세입자가 여기서 하는 일은 셋이다: ① 어디까지 왔는지 본다 ② 심사 코멘트를 읽는다
 * ③ 보완요청이면 서류를 더 올리고 다시 제출한다.
 *
 * 스테퍼 단계와 "지금 무엇을 할 수 있는가"는 전부 상태 머신(`status.ts`)에서 온다 —
 * 화면에 `if (status === "…")` 분기를 흩어 두지 않는다.
 *
 * 색은 전부 semantic 토큰이다(하드코딩 색상 0, T0.6).
 */
import { Badge, Button, buttonRecipe, Card, CardHeader, useTrack } from "@zari/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { css } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { formatKrw } from "@/features/landlord/format";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { DocumentUploader } from "./DocumentUploader";
import { REFUND_SLOT_META } from "./documents";
import { useMyRefunds, useSubmitRefundApplication } from "./hooks";
import { RefundYearTable } from "./RefundYearTable";
import { REFUND_STEPS, stepStateFor } from "./status";
import type { RefundApplicationDto, RefundListResult } from "./types";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const headerStyle = css({ display: "flex", flexDirection: "column", gap: "1" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const leadStyle = css({ textStyle: "body", color: "text.muted" });
const stepperStyle = css({ display: "flex", alignItems: "flex-start", gap: "1", mt: "1" });
const stepStyle = css({ flex: "1", display: "flex", flexDirection: "column", gap: "1.5" });
const barBaseStyle = css({ h: "1", rounded: "pill", w: "full" });
const stepLabelStyle = css({ textStyle: "caption", textAlign: "center" });
const amountStyle = css({ textStyle: "display", fontFamily: "numeric", color: "text" });
const subStyle = css({ textStyle: "body", color: "text.muted", mt: "1" });
const metaStyle = css({ textStyle: "caption", color: "text.muted", mt: "2" });
const noteStyle = css({
  mt: "3",
  bg: "warning.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "warning.border",
  rounded: "field",
  p: "3",
  textStyle: "caption",
  color: "warning.text",
  whiteSpace: "pre-wrap",
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
const docRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  py: "1.5",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  _last: { borderBottomWidth: "0" },
});
const docLinkStyle = css({
  textStyle: "caption",
  color: "text.brand",
  textDecoration: "underline",
  wordBreak: "break-all",
});
const docMetaStyle = css({ textStyle: "caption", color: "text.muted" });
const historyRowStyle = css({
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
const historyLabelStyle = css({ textStyle: "caption", color: "text.muted" });
const emptyStyle = css({ textStyle: "body", color: "text.muted" });
const linkResetStyle = css({ textDecoration: "none", display: "block" });

const BAR_TONE: Record<"DONE" | "CURRENT" | "TODO", string> = {
  DONE: css({ bg: "success" }),
  CURRENT: css({ bg: "primary" }),
  TODO: css({ bg: "border" }),
};
const LABEL_TONE: Record<"DONE" | "CURRENT" | "TODO", string> = {
  DONE: css({ color: "success.text" }),
  CURRENT: css({ color: "text" }),
  TODO: css({ color: "text.muted" }),
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  return iso.slice(0, 16).replace("T", " ");
}

function Stepper({ application }: { application: RefundApplicationDto }) {
  return (
    <div className={stepperStyle} data-testid="refund-status-stepper">
      {REFUND_STEPS.map((step) => {
        const state = stepStateFor(application.status, step.key);
        return (
          <div key={step.key} className={stepStyle} data-testid={`refund-step-${step.key}`}>
            <span className={`${barBaseStyle} ${BAR_TONE[state]}`} />
            <span
              className={`${stepLabelStyle} ${LABEL_TONE[state]}`}
              data-state={state.toLowerCase()}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function RefundStatusView({ initial }: { initial: RefundListResult }) {
  const router = useRouter();
  const { track } = useTrack();
  const { data } = useMyRefunds(initial);
  const submit = useSubmitRefundApplication();

  const applications = data?.applications ?? [];
  const [current, setCurrent] = useState<RefundApplicationDto | null>(applications[0] ?? null);
  const [error, setError] = useState<string | null>(null);

  // 목록이 갱신되면(업로드·제출 후) 화면을 최신 신청으로 맞춘다.
  // 화면이 보여 주는 것은 언제나 "가장 최근 신청" 하나다 — 고르는 UI 가 없으므로 덮어써도 안전하다.
  useEffect(() => {
    setCurrent(data?.applications[0] ?? null);
  }, [data]);

  const viewTracked = useRef<string | null>(null);
  useEffect(() => {
    if (!current || viewTracked.current === current.id) return;
    viewTracked.current = current.id;
    track(TRACK_EVENTS.REFUND_STATUS_VIEW, {
      applicationId: current.id,
      status: current.status,
    });
  }, [current, track]);

  async function handleResubmit() {
    if (!current) return;
    setError(null);
    try {
      const submitted = await submit.mutateAsync(current.id);
      setCurrent(submitted);
      track(TRACK_EVENTS.REFUND_APPLY_SUBMIT, {
        applicationId: submitted.id,
        expectedAmount: submitted.expectedAmount,
        documentCount: submitted.documents.length,
        resubmit: true,
      });
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "제출하지 못했습니다. 다시 시도해 주세요.",
      );
    }
  }

  if (!current) {
    return (
      <main className={pageStyle}>
        <header className={headerStyle}>
          <h1 className={titleStyle}>환급</h1>
          <p className={leadStyle}>월세 세액공제를 최대 5년까지 소급해 신청할 수 있습니다.</p>
        </header>
        <Card padding="lg" data-testid="refund-status-empty">
          <p className={emptyStyle}>아직 신청한 환급이 없습니다.</p>
          <div className={css({ mt: "3", display: "flex", flexDirection: "column", gap: "2" })}>
            <Link
              href="/tenant/refund/apply"
              className={buttonRecipe({ variant: "primary", size: "md", fullWidth: true })}
              data-testid="refund-status-apply-cta"
            >
              환급 신청하기
            </Link>
            <Link
              href="/refund/calculator"
              className={buttonRecipe({ variant: "secondary", size: "md", fullWidth: true })}
            >
              먼저 예상 금액 계산해 보기
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  const others = applications.filter((item) => item.id !== current.id);

  return (
    <main className={pageStyle}>
      <header className={headerStyle}>
        <h1 className={titleStyle}>환급</h1>
        <p className={leadStyle}>신청 진행 상태입니다.</p>
      </header>

      <Card padding="md" data-testid="refund-status-card">
        <CardHeader
          title="신청 진행"
          aside={
            <Badge tone={current.statusTone} data-testid="refund-status-badge">
              {current.statusLabel}
            </Badge>
          }
        />
        <Stepper application={current} />
        <p className={amountStyle} data-testid="refund-status-amount">
          {formatKrw(current.expectedAmount)}
        </p>
        <p className={subStyle} data-testid="refund-status-description">
          {current.statusDescription}
        </p>
        <p className={metaStyle}>
          제출 {formatDateTime(current.submittedAt)} · 최근 처리{" "}
          {formatDateTime(current.decidedAt ?? current.updatedAt)}
          {current.reviewedByName ? ` · 담당 ${current.reviewedByName}` : ""}
        </p>

        {current.reviewNote ? (
          <p className={noteStyle} data-testid="refund-review-note">
            심사 코멘트: {current.reviewNote}
          </p>
        ) : null}

        {current.status === "DRAFT" ? (
          <Link
            href="/tenant/refund/apply"
            className={`${linkResetStyle} ${css({ mt: "3" })}`}
            data-testid="refund-status-continue"
          >
            <span className={buttonRecipe({ variant: "primary", size: "md", fullWidth: true })}>
              이어서 작성하기
            </span>
          </Link>
        ) : null}
      </Card>

      <Card padding="md">
        <CardHeader title="산출 내역" />
        <p className={metaStyle}>
          연 총급여 {formatKrw(current.annualIncome)} · 월세 {formatKrw(current.monthlyRent)} ·{" "}
          {current.startDate} ~ {current.endDate} · 기준일 {current.asOf}
        </p>
        <RefundYearTable result={current.calc} testId="refund-status-years" />
      </Card>

      <Card padding="md">
        <CardHeader
          title="제출 서류"
          aside={<Badge tone="neutral">{current.documents.length}건</Badge>}
        />
        {current.canUpload ? (
          <DocumentUploader
            application={current}
            onUploaded={(result) => setCurrent(result.application)}
          />
        ) : current.documents.length > 0 ? (
          <div data-testid="refund-status-documents">
            {current.documents.map((doc) => (
              <div key={doc.id} className={docRowStyle}>
                <a
                  className={docLinkStyle}
                  href={doc.viewHref}
                  target="_blank"
                  rel="noreferrer"
                  data-testid={`refund-status-doc-${doc.id}`}
                >
                  {doc.name}
                </a>
                <span className={docMetaStyle}>{doc.slotLabel}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className={emptyStyle}>올린 서류가 없습니다.</p>
        )}

        {current.status === "NEED_MORE_DOCS" ? (
          <div className={css({ mt: "3", display: "flex", flexDirection: "column", gap: "2" })}>
            {current.missingSlots.length > 0 ? (
              <p className={metaStyle} data-testid="refund-status-missing">
                아직 없는 필수 서류:{" "}
                {current.missingSlots.map((slot) => REFUND_SLOT_META[slot].label).join("·")}
              </p>
            ) : null}
            <Button
              type="button"
              variant="primary"
              fullWidth
              data-testid="refund-resubmit"
              loading={submit.isPending}
              disabled={current.missingSlots.length > 0}
              onClick={() => void handleResubmit()}
            >
              보완 서류 제출하기
            </Button>
          </div>
        ) : null}
      </Card>

      {error ? (
        <p className={errorStyle} role="alert" data-testid="refund-status-error">
          {error}
        </p>
      ) : null}

      {others.length > 0 ? (
        <Card padding="md" data-testid="refund-status-history">
          <CardHeader title="지난 신청" />
          {others.map((item) => (
            <div key={item.id} className={historyRowStyle}>
              <span className={historyLabelStyle}>
                {item.startYear}~{item.endYear}년분 · {formatKrw(item.expectedAmount)}
              </span>
              <Badge tone={item.statusTone} size="sm">
                {item.statusLabel}
              </Badge>
            </div>
          ))}
        </Card>
      ) : null}

      <Link
        href="/tenant/refund/apply"
        className={linkResetStyle}
        data-testid="refund-status-new-cta"
      >
        <span className={buttonRecipe({ variant: "secondary", size: "md", fullWidth: true })}>
          새 환급 신청 시작
        </span>
      </Link>
    </main>
  );
}
