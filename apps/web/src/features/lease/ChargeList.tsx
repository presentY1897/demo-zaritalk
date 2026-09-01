"use client";

/**
 * 수납 탭의 월별 청구 리스트 (T1.5).
 *
 * 한 행에 **내역(월세+관리비+이월+연체료) · 총액 · 납부액 · 상태 배지**를 담고,
 * 행을 누르면 청구 상세 시트가 열린다. 표시값은 전부 서버가 원장 엔진으로 계산해 준 것이다.
 * 색만으로 뜻을 전하지 않도록 배지에 라벨을 함께 넣는다(T0.6).
 */
import { Badge } from "@zari/ui";
import { css } from "styled-system/css";
import { formatKrw } from "@/features/landlord/format";
import { CHARGE_STATUS_META } from "./status";
import type { ChargeDto } from "./types";

const listStyle = css({ display: "flex", flexDirection: "column", gap: "2" });
const rowStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: "1",
  w: "full",
  p: "3",
  minH: "tap",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  textAlign: "left",
  cursor: "pointer",
  transitionProperty: "box-shadow, border-color",
  transitionDuration: "fast",
  transitionTimingFunction: "standard",
  _hover: { boxShadow: "card" },
  _focusVisible: { outline: "2px solid", outlineColor: "border.focus", outlineOffset: "2px" },
});
const headRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
});
const monthStyle = css({ textStyle: "subtitle", color: "text" });
const breakdownStyle = css({ textStyle: "caption", color: "text.muted" });
const amountRowStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "2",
  mt: "1",
});
const totalStyle = css({ textStyle: "numeric", color: "text" });
const paidStyle = css({ textStyle: "caption", color: "text.muted" });
const emptyStyle = css({
  p: "4",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "dashed",
  borderColor: "border",
  textStyle: "body",
  color: "text.muted",
  textAlign: "center",
});

/** "월세 650,000 + 관리비 50,000 + 전월 이월 300,000 + 연체료 15,500" — 0원 줄은 뺀다 */
function breakdownText(charge: ChargeDto): string {
  return charge.lines
    .filter((line) => line.amount > 0)
    .map((line) => `${line.label} ${line.amount.toLocaleString("ko-KR")}`)
    .join(" + ");
}

export type ChargeListProps = {
  charges: ChargeDto[];
  onSelect: (charge: ChargeDto) => void;
};

export function ChargeList({ charges, onSelect }: ChargeListProps) {
  if (charges.length === 0) {
    return (
      <p className={emptyStyle} data-testid="charge-empty">
        아직 청구가 없습니다. 계약이 진행되면 매달 청구가 만들어집니다.
      </p>
    );
  }

  return (
    <div className={listStyle} data-testid="charge-list">
      {charges.map((charge) => {
        const meta = CHARGE_STATUS_META[charge.status];
        return (
          <button
            key={charge.id}
            type="button"
            className={rowStyle}
            onClick={() => onSelect(charge)}
            data-testid="charge-row"
            data-charge-month={`${charge.year}-${String(charge.month).padStart(2, "0")}`}
            data-charge-status={charge.status}
          >
            <div className={headRowStyle}>
              <span className={monthStyle}>
                {charge.year}년 {charge.month}월
              </span>
              <Badge tone={meta.tone} data-testid="charge-status-badge">
                {meta.label}
              </Badge>
            </div>
            <span className={breakdownStyle}>{breakdownText(charge)}</span>
            <div className={amountRowStyle}>
              <span className={totalStyle}>{formatKrw(charge.totalDue)}</span>
              <span className={paidStyle}>
                납부 {formatKrw(charge.paidAmount)}
                {charge.outstanding > 0 ? ` · 남은 ${formatKrw(charge.outstanding)}` : ""}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
