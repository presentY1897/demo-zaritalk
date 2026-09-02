"use client";

/**
 * `/tenant/refund/apply` 화면 (T2.4) — 신청서 작성.
 *
 * 순서가 정해져 있다: **① 내용 입력 → ② 임시저장(DRAFT) → ③ 서류 업로드 → ④ 제출**.
 * 서류를 붙이려면 신청 id 가 먼저 있어야 하므로(업로드 API 가 `applicationId` 를 요구한다)
 * 임시저장이 업로드의 전제다 — 화면이 그 순서를 눈에 보이게 안내한다.
 *
 * ## 계산기(T2.3)에서 넘어오면 그대로 채워진다
 *
 * CTA 가 `?grossSalary=…&monthlyRent=…&startDate=…&endDate=…` 로 보내므로 그 값을 초기값으로
 * 쓰고, **같은 계산 API** 로 미리보기를 돌린다 — 계산기가 보여 준 금액이 그대로 재현된다.
 * 저장 시점에도 서버가 같은 함수로 다시 계산하므로 화면 금액과 저장 금액이 갈라지지 않는다.
 *
 * 색은 전부 semantic 토큰이다(하드코딩 색상 0, T0.6).
 */
import { Badge, Button, Card, CardHeader, Input, useTrack } from "@zari/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { css } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { formatKrw } from "@/features/landlord/format";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import type { RefundCalcResult } from "./calc";
import { REFUND_DISCLAIMER } from "./disclaimer";
import { DocumentUploader } from "./DocumentUploader";
import { REFUND_SLOT_META } from "./documents";
import {
  useRefundCalculation,
  useSaveRefundApplication,
  useSubmitRefundApplication,
} from "./hooks";
import { RefundYearTable } from "./RefundYearTable";
import { refundCalcSchema } from "./schema";
import type { RefundApplicationDto, RefundLeaseOptionDto } from "./types";

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
const noticeStyle = css({
  bg: "warning.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "warning.border",
  rounded: "card",
  p: "3",
  textStyle: "caption",
  color: "warning.text",
});
const formStyle = css({ display: "flex", flexDirection: "column", gap: "field" });
const twoColStyle = css({ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "2" });
const labelStyle = css({ textStyle: "label", color: "text.muted", mb: "1", display: "block" });
const selectStyle = css({
  w: "full",
  h: "tap",
  px: "3",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  color: "text",
  textStyle: "body",
});
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
const stepStyle = css({ textStyle: "caption", color: "text.muted" });
const savedStyle = css({ textStyle: "caption", color: "success.text" });
const amountStyle = css({ textStyle: "display", fontFamily: "numeric", color: "text" });
const subStyle = css({ textStyle: "body", color: "text.muted", mt: "1" });
const footnoteStyle = css({ textStyle: "caption", color: "text.muted" });
const actionsStyle = css({ display: "flex", flexDirection: "column", gap: "2" });

const MANUAL = "MANUAL";

export type RefundApplyPrefill = {
  grossSalary: string;
  monthlyRent: string;
  startDate: string;
  endDate: string;
};

export function RefundApplyView({
  draft,
  leases,
  prefill,
}: {
  draft: RefundApplicationDto | null;
  leases: RefundLeaseOptionDto[];
  prefill: RefundApplyPrefill;
}) {
  const router = useRouter();
  const { track } = useTrack();

  const [application, setApplication] = useState<RefundApplicationDto | null>(draft);
  const [leaseId, setLeaseId] = useState<string>(draft?.leaseId ?? MANUAL);
  const [grossSalary, setGrossSalary] = useState(
    draft ? String(draft.annualIncome) : prefill.grossSalary,
  );
  const [monthlyRent, setMonthlyRent] = useState(
    draft ? String(draft.monthlyRent) : prefill.monthlyRent,
  );
  const [startDate, setStartDate] = useState(draft?.startDate ?? prefill.startDate);
  const [endDate, setEndDate] = useState(draft?.endDate ?? prefill.endDate);
  const [formError, setFormError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RefundCalcResult | null>(draft?.calc ?? null);

  const calculation = useRefundCalculation();
  const save = useSaveRefundApplication();
  const submit = useSubmitRefundApplication();

  const viewTracked = useRef(false);
  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;
    track(TRACK_EVENTS.REFUND_APPLY_VIEW, {
      prefilled: prefill.grossSalary !== "" && prefill.monthlyRent !== "",
      hasDraft: draft !== null,
      leaseCount: leases.length,
    });
  }, [draft, leases.length, prefill.grossSalary, prefill.monthlyRent, track]);

  function parsedInput() {
    return refundCalcSchema.safeParse({
      grossSalary: Number(grossSalary),
      monthlyRent: Number(monthlyRent),
      startDate,
      endDate,
    });
  }

  async function runPreview() {
    const parsed = parsedInput();
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.");
      setPreview(null);
      return null;
    }
    setFormError(null);
    try {
      const result = await calculation.mutateAsync(parsed.data);
      setPreview(result);
      return result;
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : "계산하지 못했습니다.");
      setPreview(null);
      return null;
    }
  }

  // 계산기에서 넘어온 입력(또는 임시저장 내용)이 이미 유효하면 **화면에 들어오자마자** 금액을 보여 준다.
  // 값이 비어 있으면 조용히 넘어간다 — 빈 폼에 빨간 오류부터 띄우지 않는다.
  const previewRan = useRef(false);
  useEffect(() => {
    if (previewRan.current) return;
    previewRan.current = true;
    if (preview) return;
    if (!parsedInput().success) return;
    void runPreview();
    // 첫 렌더에 한 번만 — 이후 재계산은 사용자가 버튼으로 한다
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function pickLease(value: string) {
    setLeaseId(value);
    const lease = leases.find((item) => item.leaseId === value);
    if (!lease) return;
    setMonthlyRent(String(lease.monthlyRent));
    setStartDate(lease.startDate);
    setEndDate(lease.endDate);
  }

  async function handleSave() {
    const parsed = parsedInput();
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.");
      return;
    }
    setFormError(null);
    try {
      const saved = await save.mutateAsync({
        id: application?.id ?? null,
        input: { ...parsed.data, leaseId: leaseId === MANUAL ? null : leaseId },
      });
      setApplication(saved);
      setPreview(saved.calc);
    } catch (cause) {
      setFormError(
        cause instanceof ApiError ? cause.message : "임시저장하지 못했습니다. 다시 시도해 주세요.",
      );
    }
  }

  async function handleSubmit() {
    if (!application) return;
    setFormError(null);
    try {
      const submitted = await submit.mutateAsync(application.id);
      track(TRACK_EVENTS.REFUND_APPLY_SUBMIT, {
        applicationId: submitted.id,
        expectedAmount: submitted.expectedAmount,
        documentCount: submitted.documents.length,
        resubmit: false,
      });
      router.push("/tenant/refund");
      router.refresh();
    } catch (cause) {
      setFormError(
        cause instanceof ApiError ? cause.message : "제출하지 못했습니다. 다시 시도해 주세요.",
      );
    }
  }

  const missing = application?.missingSlots ?? [];

  return (
    <main className={pageStyle}>
      <header className={headerStyle}>
        <h1 className={titleStyle}>환급 신청</h1>
        <p className={leadStyle}>
          최근 5년치 월세 세액공제를 신청합니다. 임시저장한 뒤 서류를 올리고 제출하세요.
        </p>
      </header>

      <p className={noticeStyle} data-testid="refund-apply-disclaimer">
        {REFUND_DISCLAIMER}
      </p>

      <Card padding="md">
        <CardHeader
          title="① 신청 내용"
          aside={application ? <Badge tone="neutral">{application.statusLabel}</Badge> : null}
        />
        <div className={formStyle}>
          <div>
            <label className={labelStyle} htmlFor="refund-apply-lease">
              계약 선택
            </label>
            <select
              id="refund-apply-lease"
              className={selectStyle}
              data-testid="refund-apply-lease"
              value={leaseId}
              onChange={(event) => pickLease(event.currentTarget.value)}
            >
              <option value={MANUAL}>직접 입력</option>
              {leases.map((lease) => (
                <option key={lease.leaseId} value={lease.leaseId}>
                  {lease.buildingName} {lease.unitLabel} · 월 {formatKrw(lease.monthlyRent)}
                </option>
              ))}
            </select>
            <p className={stepStyle}>
              {leases.length > 0
                ? "계약을 고르면 월세·기간이 자동으로 채워집니다."
                : "연결된 계약이 없어 직접 입력합니다."}
            </p>
          </div>

          <Input
            label="연 총급여(원)"
            inputMode="numeric"
            data-testid="refund-apply-gross-salary"
            value={grossSalary}
            onChange={(event) => setGrossSalary(event.currentTarget.value)}
          />
          <Input
            label="월세(원/월)"
            inputMode="numeric"
            data-testid="refund-apply-monthly-rent"
            value={monthlyRent}
            onChange={(event) => setMonthlyRent(event.currentTarget.value)}
          />
          <div className={twoColStyle}>
            <Input
              label="임차 시작일"
              type="date"
              data-testid="refund-apply-start-date"
              value={startDate}
              onChange={(event) => setStartDate(event.currentTarget.value)}
            />
            <Input
              label="임차 종료일"
              type="date"
              data-testid="refund-apply-end-date"
              value={endDate}
              onChange={(event) => setEndDate(event.currentTarget.value)}
            />
          </div>

          <Button
            type="button"
            variant="ghost"
            data-testid="refund-apply-preview"
            loading={calculation.isPending}
            onClick={() => void runPreview()}
          >
            예상 환급액 다시 계산
          </Button>
        </div>
      </Card>

      {preview ? (
        <Card padding="md" data-testid="refund-apply-preview-card">
          <CardHeader title="예상 환급액" />
          <p className={amountStyle} data-testid="refund-apply-expected">
            {formatKrw(preview.totals.creditAmount)}
          </p>
          <p className={subStyle}>
            {preview.retroRange.fromYear}~{preview.retroRange.toYear}년분 대상 · 기준일{" "}
            {preview.asOf}
          </p>
          <RefundYearTable result={preview} testId="refund-apply-years" />
        </Card>
      ) : null}

      <Card padding="md">
        <CardHeader
          title="② 서류"
          aside={
            application ? (
              <Badge tone={missing.length === 0 ? "success" : "warning"}>
                {missing.length === 0 ? "준비 완료" : `${missing.length}종 부족`}
              </Badge>
            ) : (
              <Badge tone="neutral">임시저장 필요</Badge>
            )
          }
        />
        {application ? (
          <>
            <DocumentUploader
              application={application}
              disabled={!application.canUpload}
              onUploaded={(result) => setApplication(result.application)}
            />
            {missing.length > 0 ? (
              <p className={stepStyle} data-testid="refund-apply-missing">
                아직 없는 필수 서류:{" "}
                {missing.map((slot) => REFUND_SLOT_META[slot].label).join("·")}
              </p>
            ) : null}
          </>
        ) : (
          <p className={stepStyle} data-testid="refund-apply-upload-locked">
            먼저 아래 「임시저장」을 누르면 서류를 올릴 수 있습니다.
          </p>
        )}
      </Card>

      {formError ? (
        <p className={errorBoxStyle} role="alert" data-testid="refund-apply-error">
          {formError}
        </p>
      ) : null}

      <div className={actionsStyle}>
        <Button
          type="button"
          variant="secondary"
          fullWidth
          data-testid="refund-apply-save"
          loading={save.isPending}
          onClick={() => void handleSave()}
        >
          {application ? "임시저장 내용 갱신" : "임시저장"}
        </Button>
        <Button
          type="button"
          variant="primary"
          fullWidth
          data-testid="refund-apply-submit"
          disabled={!application || missing.length > 0}
          loading={submit.isPending}
          onClick={() => void handleSubmit()}
        >
          제출하기
        </Button>
        {application ? (
          <p className={savedStyle} data-testid="refund-apply-saved">
            임시저장됨 · 신청 {application.id.slice(-6)}
          </p>
        ) : null}
        <p className={footnoteStyle}>
          제출하면 담당자가 서류를 확인합니다. 진행 상태는 「환급」 탭에서 볼 수 있습니다.
        </p>
      </div>
    </main>
  );
}
