"use client";

/**
 * 호실 그리드 (T1.1) — 상태 색은 전부 semantic 상태색 토큰이다(하드코딩 색상 0).
 *
 * 색만으로 뜻을 전하지 않도록 셀마다 상태 라벨(계약중·대기·연체·공실)을 같이 적는다(T0.6 원칙).
 * 480px 셸에서 3열, 좁은 화면에서 2열로 자연스럽게 접힌다(`auto-fill` + `minmax`).
 *
 * 두 가지 모드로 쓴다:
 * - `navigate`(기본) — 셀이 호실 상세(`/landlord/units/[id]`) 링크
 * - `edit` — 셀이 버튼. 건물 상세의 "호실 수정" 진입점
 */
import Link from "next/link";
import { css, cx } from "styled-system/css";
import { UNIT_STATUS_META } from "./unit-status";
import type { UnitStatus, UnitSummaryDto } from "./types";

const gridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
  gap: "2",
});

const cellStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "1",
  p: "3",
  minH: "tap",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "solid",
  textAlign: "left",
  textDecoration: "none",
  cursor: "pointer",
  transitionProperty: "box-shadow, border-color",
  transitionDuration: "fast",
  transitionTimingFunction: "standard",
  _hover: { boxShadow: "card" },
  _focusVisible: { outline: "2px solid", outlineColor: "border.focus", outlineOffset: "2px" },
});

/** 상태별 면·선·글자색 — semantic 토큰만 쓴다 */
const statusCellStyle: Record<UnitStatus, string> = {
  OCCUPIED: css({ bg: "success.subtle", borderColor: "success.border", color: "success.text" }),
  PENDING: css({ bg: "warning.subtle", borderColor: "warning.border", color: "warning.text" }),
  OVERDUE: css({ bg: "danger.subtle", borderColor: "danger.border", color: "danger.text" }),
  VACANT: css({ bg: "bg.card", borderColor: "border", color: "text.muted" }),
};

const labelStyle = css({ textStyle: "subtitle", color: "text" });
const statusStyle = css({ textStyle: "label" });
const metaStyle = css({ textStyle: "caption", color: "text.muted" });
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

function unitMeta(unit: UnitSummaryDto): string {
  const parts: string[] = [];
  if (unit.floor != null) parts.push(`${unit.floor}층`);
  if (unit.rooms != null) parts.push(`방 ${unit.rooms}`);
  if (unit.currentLease) parts.push(unit.currentLease.tenantName);
  return parts.join(" · ");
}

export type UnitGridProps = {
  units: UnitSummaryDto[];
  mode?: "navigate" | "edit";
  onEdit?: (unit: UnitSummaryDto) => void;
};

export function UnitGrid({ units, mode = "navigate", onEdit }: UnitGridProps) {
  if (units.length === 0) {
    return <p className={emptyStyle}>아직 호실이 없습니다. 「호실 추가」로 등록해 주세요.</p>;
  }

  return (
    <div className={gridStyle} data-testid="unit-grid">
      {units.map((unit) => {
        const meta = UNIT_STATUS_META[unit.status];
        const className = cx(cellStyle, statusCellStyle[unit.status]);
        const content = (
          <>
            <span className={labelStyle}>{unit.label}</span>
            <span className={statusStyle}>{meta.label}</span>
            {unitMeta(unit) ? <span className={metaStyle}>{unitMeta(unit)}</span> : null}
          </>
        );

        if (mode === "edit") {
          return (
            <button
              key={unit.id}
              type="button"
              className={className}
              onClick={() => onEdit?.(unit)}
              data-testid="unit-cell"
              data-unit-status={unit.status}
              data-unit-label={unit.label}
            >
              {content}
            </button>
          );
        }

        return (
          <Link
            key={unit.id}
            href={`/landlord/units/${unit.id}`}
            className={className}
            data-testid="unit-cell"
            data-unit-status={unit.status}
            data-unit-label={unit.label}
          >
            {content}
          </Link>
        );
      })}
    </div>
  );
}
