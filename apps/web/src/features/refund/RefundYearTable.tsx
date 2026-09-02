"use client";

/**
 * 연도별 산출 내역 표 (T2.4) — 신청서 미리보기·상태 화면·심사 요약이 같은 표를 쓴다.
 *
 * **여기서 계산하지 않는다.** `calculateRefund` 가 낸 `RefundCalcResult` 를 그대로 그린다
 * (계산기 화면 T2.3 과 같은 원칙 — 화면이 다시 계산하면 저장된 금액과 갈라진다).
 */
import { css } from "styled-system/css";
import { formatKrw } from "@/features/landlord/format";
import type { RefundCalcResult } from "./calc";

const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "1fr auto",
  rowGap: "0.5",
  columnGap: "2",
  py: "2",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  _last: { borderBottomWidth: "0" },
});
const yearStyle = css({ textStyle: "bodyStrong", color: "text" });
const amountStyle = css({
  textStyle: "bodyStrong",
  color: "text",
  fontFamily: "numeric",
  textAlign: "right",
});
const detailStyle = css({ textStyle: "caption", color: "text.muted", fontFamily: "numeric" });
const totalRowStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "2",
  mt: "2",
  pt: "2",
  borderTopWidth: "hairline",
  borderTopStyle: "solid",
  borderTopColor: "border",
  textStyle: "bodyStrong",
  color: "text",
});
const totalValueStyle = css({ textStyle: "title", color: "text", fontFamily: "numeric" });
const emptyStyle = css({ textStyle: "caption", color: "warning.text" });

export function RefundYearTable({
  result,
  testId = "refund-year-table",
}: {
  result: RefundCalcResult;
  testId?: string;
}) {
  if (result.years.length === 0) {
    return (
      <p className={emptyStyle} data-testid={`${testId}-empty`}>
        {result.ineligibleReason === "GROSS_SALARY_OVER"
          ? "총급여가 공제 대상 상한을 넘어 환급 대상이 아닙니다."
          : "소급 기간 안에 해당하는 월세 납부 내역이 없습니다."}
      </p>
    );
  }

  return (
    <div data-testid={testId}>
      {result.years.map((year) => (
        <div key={year.year} className={rowStyle} data-testid={`${testId}-row-${year.year}`}>
          <span className={yearStyle}>{year.year}년</span>
          <span className={amountStyle}>{formatKrw(year.creditAmount)}</span>
          <span className={detailStyle}>
            {year.months}개월 · 지급 {formatKrw(year.paidRent)} · 공제율 {year.creditRatePercent}%
          </span>
          <span className={detailStyle} />
        </div>
      ))}
      <div className={totalRowStyle}>
        <span>합계 ({result.totals.months}개월)</span>
        <span className={totalValueStyle} data-testid={`${testId}-total`}>
          {formatKrw(result.totals.creditAmount)}
        </span>
      </div>
    </div>
  );
}
