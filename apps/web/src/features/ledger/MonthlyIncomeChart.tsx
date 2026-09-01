"use client";

/**
 * 월 비교 미니 차트 (T1.6) — **새 의존성 없이** CSS(panda)만으로 그린 12개월 가로 누적 막대.
 *
 * ## 왜 가로 막대인가
 * 480px 셸에서 세로 막대 12개를 세우면 막대 하나가 30px 남짓이라 값 라벨을 붙일 자리가 없고,
 * 월 라벨이 기울어진다. 가로로 눕히면 한 행이 `[6월] [막대] [700,000원]` 으로 읽히고
 * 항목이 긴 이름(전월 이월·연체료)이어도 범례가 흔들리지 않는다.
 *
 * ## 색만으로 정보를 전달하지 않는다 (T0.6 원칙)
 * - 행마다 **월 이름과 합계 금액을 글자로** 적는다. 막대가 없어도 표는 그대로 읽힌다.
 * - 항목 구분은 범례(색 + 글자)와 각 조각의 `title`(마우스 오버), 그리고 행마다 숨겨 둔
 *   스크린리더 전용 요약(항목별 금액을 모두 읽어 준다)으로 중복 제공한다.
 * - 아래 월별 표가 같은 숫자를 항목별로 다시 보여 준다(표 뷰).
 *
 * ## 색
 * semantic 토큰만 쓴다(하드코딩 색상 0). 인접 조각이 색각 이상에서 뭉치지 않도록
 * 월세=브랜드 어두운 옐로(`text.brand`) · 관리비=`info` · 전월 이월=`success` ·
 * 연체료=`danger` 순으로 배치했고, 조각 사이는 2px 흰 틈으로 떨어뜨린다(테두리 대신).
 */
import { css, cx } from "styled-system/css";
import { formatKrw } from "@/features/landlord/format";
import { LEDGER_LINE_FIELD, LEDGER_LINE_LABELS, monthLabel, visibleLedgerLines } from "./lines";
import type { LedgerLineKey } from "./lines";
import type { LedgerAmounts, LedgerMonthBucket } from "./types";

/**
 * 항목별 막대 색 — semantic 토큰만(하드코딩 색상 0).
 * 요약 카드·월별 표의 점 표시도 같은 색을 써야 차트와 이어져 읽히므로 밖으로 내보낸다.
 */
export const LEDGER_LINE_FILL: Record<LedgerLineKey, string> = {
  RENT: css({ bg: "text.brand" }),
  MAINTENANCE: css({ bg: "info" }),
  CARRY_OVER: css({ bg: "success" }),
  LATE_FEE: css({ bg: "danger" }),
  EXCESS: css({ bg: "border.strong" }),
};

const wrapStyle = css({ display: "flex", flexDirection: "column", gap: "3" });

const legendStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "1",
  columnGap: "3",
});
const legendItemStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  textStyle: "caption",
  color: "text.muted",
});
const swatchStyle = css({ w: "10px", h: "10px", rounded: "2px", flexShrink: 0 });

const rowsStyle = css({ display: "flex", flexDirection: "column", gap: "1" });
const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "2.75rem 1fr auto",
  alignItems: "center",
  gap: "2",
  minH: "24px",
});
const monthStyle = css({ textStyle: "caption", color: "text.muted", textAlign: "right" });
const trackStyle = css({
  display: "flex",
  gap: "2px",
  h: "14px",
  alignItems: "stretch",
  minW: 0,
});
/** 막대 끝만 둥글게(4px), 시작(0원 기준선)은 각지게 — 기준선이 어디인지 흐려지지 않게 */
const segmentStyle = css({ minW: "3px", _last: { roundedRight: "4px" } });
const valueStyle = css({
  textStyle: "caption",
  color: "text",
  fontFamily: "numeric",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});
const zeroValueStyle = css({ color: "text.muted" });
const emptyStyle = css({
  py: "6",
  textAlign: "center",
  textStyle: "body",
  color: "text.muted",
});
const srOnlyStyle = css({
  position: "absolute",
  w: "1px",
  h: "1px",
  p: 0,
  m: "-1px",
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
});

/** 접근성용 한 줄 요약 — "6월 합계 700,000원 (월세 650,000원, 관리비 50,000원)" */
function describeMonth(bucket: LedgerMonthBucket, lines: LedgerLineKey[]): string {
  const parts = lines
    .filter((key) => bucket[LEDGER_LINE_FIELD[key]] > 0)
    .map((key) => `${LEDGER_LINE_LABELS[key]} ${formatKrw(bucket[LEDGER_LINE_FIELD[key]])}`);
  const detail = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  return `${monthLabel(bucket.month)} 합계 ${formatKrw(bucket.total)}${detail}`;
}

export type MonthlyIncomeChartProps = {
  months: LedgerMonthBucket[];
  /** 범례에 넣을 줄을 정할 때 쓴다(초과 납부는 값이 있을 때만 나온다) */
  totals: LedgerAmounts;
  year: number;
};

export function MonthlyIncomeChart({ months, totals, year }: MonthlyIncomeChartProps) {
  const lines = visibleLedgerLines(totals);
  const max = months.reduce((peak, month) => Math.max(peak, month.total), 0);

  if (max === 0) {
    return (
      <p className={emptyStyle} data-testid="ledger-chart-empty">
        {year}년에는 들어온 납부가 없습니다.
      </p>
    );
  }

  return (
    <div className={wrapStyle} data-testid="ledger-chart">
      <ul className={legendStyle}>
        {lines.map((key) => (
          <li key={key} className={legendItemStyle}>
            <span className={cx(swatchStyle, LEDGER_LINE_FILL[key])} aria-hidden="true" />
            {LEDGER_LINE_LABELS[key]}
          </li>
        ))}
      </ul>

      <ul className={rowsStyle}>
        {months.map((bucket) => (
          <li
            key={bucket.month}
            className={rowStyle}
            data-testid="ledger-chart-row"
            data-month={bucket.month}
          >
            <span className={monthStyle} aria-hidden="true">
              {monthLabel(bucket.month)}
            </span>
            <span className={srOnlyStyle}>{describeMonth(bucket, lines)}</span>
            <span className={trackStyle} aria-hidden="true">
              {lines.map((key) => {
                const amount = bucket[LEDGER_LINE_FIELD[key]];
                if (amount <= 0) return null;
                return (
                  <span
                    key={key}
                    className={cx(segmentStyle, LEDGER_LINE_FILL[key])}
                    style={{ width: `${(amount / max) * 100}%` }}
                    title={`${monthLabel(bucket.month)} ${LEDGER_LINE_LABELS[key]} ${formatKrw(amount)}`}
                  />
                );
              })}
            </span>
            <span
              className={cx(valueStyle, bucket.total === 0 ? zeroValueStyle : undefined)}
              aria-hidden="true"
            >
              {formatKrw(bucket.total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
