/**
 * 대시보드 차트 (T6.2) — **새 의존성 없이** PandaCSS 만으로 그린다.
 *
 * [T1.6 장부](../../../../../../docs/tasks/t1.6-ledger.md)의 미니 차트와 같은 방식이다.
 * 차트 라이브러리를 넣지 않은 이유: 이 화면이 필요로 하는 것은 막대·비율·퍼널 세 가지뿐이고,
 * 그 정도는 flex + 퍼센트 폭으로 끝난다. 라이브러리는 번들·SSR 설정·테마 이중화를 데려온다.
 *
 * ## 색만으로 정보를 전달하지 않는다 (T0.6 원칙)
 *
 * - 모든 막대에 **값을 글자로** 붙인다. 막대를 지워도 표로 읽힌다.
 * - 계열 구분은 범례(색 + 글자) + 조각마다 `title`(마우스 오버) + 행마다 스크린리더 전용 요약,
 *   이렇게 셋으로 중복 제공한다.
 * - 색은 전부 semantic 토큰이다(하드코딩 색상 0).
 *
 * 클라이언트 상태가 필요 없어 **전부 서버 컴포넌트**다(`"use client"` 없음).
 */
import type { ReactNode } from "react";
import { css, cx } from "styled-system/css";

// ── 공통 ─────────────────────────────────────────────────────────────────────

/** 계열 색 — 인접 계열이 색각 이상에서 뭉치지 않도록 명도 차가 큰 순으로 배치했다. */
export const SERIES_FILL = {
  brand: css({ bg: "text.brand" }),
  info: css({ bg: "info" }),
  success: css({ bg: "success" }),
  warning: css({ bg: "warning" }),
  danger: css({ bg: "danger" }),
  neutral: css({ bg: "border.strong" }),
} as const;
export type SeriesFill = keyof typeof SERIES_FILL;

export const srOnlyStyle = css({
  position: "absolute",
  w: "1px",
  h: "1px",
  p: 0,
  m: "-1px",
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
});

const legendStyle = css({ display: "flex", flexWrap: "wrap", gap: "1", columnGap: "4", mb: "3" });
const legendItemStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  textStyle: "caption",
  color: "text.muted",
});
const swatchStyle = css({ w: "10px", h: "10px", rounded: "2px", flexShrink: 0 });
const emptyStyle = css({ py: "8", textAlign: "center", textStyle: "body", color: "text.muted" });

export type LegendItem = { label: string; fill: SeriesFill };

export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className={legendStyle}>
      {items.map((item) => (
        <li key={item.label} className={legendItemStyle}>
          <span className={cx(swatchStyle, SERIES_FILL[item.fill])} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function ChartEmpty({ children }: { children: ReactNode }) {
  return <p className={emptyStyle}>{children}</p>;
}

// ── 가로 막대 (월별 지표·환급 파이프라인) ────────────────────────────────────

export type BarSegment = { key: string; label: string; value: number; fill: SeriesFill };
export type BarRow = {
  key: string;
  label: string;
  segments: BarSegment[];
  /** 막대 오른쪽에 붙는 값 — 반드시 채운다(색만으로 읽히지 않게) */
  valueText: string;
  /** 값 아래 보조 한 줄 */
  note?: string;
};

const rowsStyle = css({ display: "flex", flexDirection: "column", gap: "1.5" });
const rowStyle = css({
  display: "grid",
  gridTemplateColumns: { base: "4.5rem 1fr", md: "4.5rem 1fr 12rem" },
  alignItems: "center",
  gap: "3",
  minH: "26px",
});
const rowLabelStyle = css({ textStyle: "caption", color: "text.muted", textAlign: "right" });
const trackStyle = css({
  display: "flex",
  gap: "2px",
  h: "16px",
  alignItems: "stretch",
  minW: 0,
  bg: "bg.subtle",
  rounded: "4px",
});
const segmentStyle = css({ minW: "2px", _first: { roundedLeft: "4px" }, _last: { roundedRight: "4px" } });
const valueStyle = css({
  textStyle: "caption",
  color: "text",
  fontFamily: "numeric",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  textAlign: { base: "left", md: "right" },
  gridColumn: { base: "2", md: "auto" },
});
const noteStyle = css({ textStyle: "caption", color: "text.muted" });

export function BarRows({
  rows,
  legend,
  emptyText,
  testId,
}: {
  rows: BarRow[];
  legend?: LegendItem[];
  emptyText: string;
  testId?: string;
}) {
  const max = rows.reduce(
    (peak, row) => Math.max(peak, row.segments.reduce((sum, seg) => sum + seg.value, 0)),
    0,
  );

  if (max <= 0) return <ChartEmpty>{emptyText}</ChartEmpty>;

  return (
    <div data-testid={testId}>
      {legend ? <ChartLegend items={legend} /> : null}
      <ul className={rowsStyle}>
        {rows.map((row) => (
          <li key={row.key} className={rowStyle} data-row={row.key}>
            <span className={rowLabelStyle} aria-hidden="true">
              {row.label}
            </span>
            <span className={srOnlyStyle}>
              {row.label} {row.valueText}
              {row.segments.length > 1
                ? ` (${row.segments.map((seg) => `${seg.label} ${seg.value.toLocaleString("ko-KR")}`).join(", ")})`
                : ""}
              {row.note ? ` — ${row.note}` : ""}
            </span>
            <span className={trackStyle} aria-hidden="true">
              {row.segments.map((segment) =>
                segment.value <= 0 ? null : (
                  <span
                    key={segment.key}
                    className={cx(segmentStyle, SERIES_FILL[segment.fill])}
                    style={{ width: `${(segment.value / max) * 100}%` }}
                    title={`${row.label} ${segment.label} ${segment.value.toLocaleString("ko-KR")}`}
                  />
                ),
              )}
            </span>
            <span className={valueStyle} aria-hidden="true">
              {row.valueText}
              {row.note ? <span className={noteStyle}> · {row.note}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── 세로 막대 (일별 추이) ────────────────────────────────────────────────────

export type TrendPoint = {
  key: string;
  /** 축 라벨 — `09.03` */
  label: string;
  /** 스크린리더용 전체 표기 — `2026년 9월 3일` */
  fullLabel: string;
  values: { key: string; label: string; value: number; fill: SeriesFill }[];
};

const trendScrollStyle = css({ overflowX: "auto", pb: "1" });
const trendRowStyle = css({ display: "flex", gap: "1", alignItems: "flex-end", minW: "min-content" });
const columnStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "1",
  minW: "34px",
  flex: "1 1 0",
});
const barsStyle = css({ display: "flex", gap: "2px", alignItems: "flex-end", h: "120px" });
const barStyle = css({ w: "10px", rounded: "2px 2px 0 0", minH: "2px" });
const columnLabelStyle = css({ textStyle: "caption", color: "text.muted", whiteSpace: "nowrap" });
const columnValueStyle = css({
  textStyle: "caption",
  color: "text",
  fontFamily: "numeric",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});

/**
 * 일별 추이. 값은 막대 **아래에 글자로** 적는다(계열 순서는 범례와 같다) —
 * 30~90개 막대 위에 라벨을 얹으면 겹치므로, 한 줄로 모아 `2 / 5` 처럼 적었다.
 * 폭이 모자라면 가로 스크롤한다(데스크톱 어드민 전제).
 */
export function TrendColumns({
  points,
  legend,
  emptyText,
  testId,
}: {
  points: TrendPoint[];
  legend: LegendItem[];
  emptyText: string;
  testId?: string;
}) {
  const max = points.reduce(
    (peak, point) => Math.max(peak, ...point.values.map((value) => value.value)),
    0,
  );

  if (max <= 0) return <ChartEmpty>{emptyText}</ChartEmpty>;

  return (
    <div data-testid={testId}>
      <ChartLegend items={legend} />
      <div className={trendScrollStyle}>
        <ul className={trendRowStyle}>
          {points.map((point) => (
            <li key={point.key} className={columnStyle} data-day={point.key}>
              <span className={srOnlyStyle}>
                {point.fullLabel}{" "}
                {point.values.map((value) => `${value.label} ${value.value}`).join(", ")}
              </span>
              <span className={barsStyle} aria-hidden="true">
                {point.values.map((value) => (
                  <span
                    key={value.key}
                    className={cx(barStyle, SERIES_FILL[value.fill])}
                    style={{ height: `${Math.max((value.value / max) * 100, value.value > 0 ? 3 : 0)}%` }}
                    title={`${point.fullLabel} ${value.label} ${value.value}`}
                  />
                ))}
              </span>
              <span className={columnValueStyle} aria-hidden="true">
                {point.values.map((value) => value.value).join(" / ")}
              </span>
              <span className={columnLabelStyle} aria-hidden="true">
                {point.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── 지표 타일 ────────────────────────────────────────────────────────────────

const tilesStyle = css({
  display: "grid",
  gridTemplateColumns: { base: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" },
  gap: "3",
});
const tileStyle = css({
  bg: "bg.card",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  rounded: "card",
  px: "4",
  py: "3",
  minW: 0,
});
const tileLabelStyle = css({ textStyle: "caption", color: "text.muted" });
const tileValueStyle = css({
  textStyle: "title",
  color: "text",
  fontFamily: "numeric",
  fontVariantNumeric: "tabular-nums",
  mt: "1",
  wordBreak: "break-all",
});
const tileNoteStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });

export type StatTile = { key: string; label: string; value: string; note?: string };

export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <div className={tilesStyle}>
      {tiles.map((tile) => (
        <div key={tile.key} className={tileStyle} data-testid={`stat-${tile.key}`}>
          <p className={tileLabelStyle}>{tile.label}</p>
          <p className={tileValueStyle}>{tile.value}</p>
          {tile.note ? <p className={tileNoteStyle}>{tile.note}</p> : null}
        </div>
      ))}
    </div>
  );
}
