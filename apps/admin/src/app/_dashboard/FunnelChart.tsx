/**
 * A/B 퍼널 차트 (T6.1·T6.2) — 변형별 전환율.
 *
 * D2 퍼널 `notice_view → notice_cta_click → signup_start → signup_complete` 를 변형마다 한 판씩
 * 그린다. **막대 길이는 두 변형에서 같은 기준(전체 최대 단계 인원)으로 정규화**한다 —
 * 각자 자기 1단계를 100%로 그리면 모수가 다른 두 변형이 같은 길이로 보여 비교가 거짓말이 된다.
 *
 * 규칙(중복 제거·누적·미리보기 제외)은 전부 web 이 계산해서 보낸다. 이 파일은 그리기만 한다.
 */
import { Badge } from "@zari/ui";
import { css, cx } from "styled-system/css";
import { ChartEmpty, SERIES_FILL, srOnlyStyle, type SeriesFill } from "./charts";
import { formatCount, formatPercent, type FunnelResult, type FunnelVariant } from "./shared";

/** 변형 색 — A 는 대조군이라 중립 계열, B 는 브랜드 계열로 둔다(범례 없이도 구분된다) */
const VARIANT_FILL: SeriesFill[] = ["info", "brand"];

const gridStyle = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr", lg: "repeat(2, minmax(0, 1fr))" },
  gap: "4",
});
const panelStyle = css({
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  rounded: "card",
  p: "4",
  minW: 0,
});
const panelHeadStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  mb: "3",
  flexWrap: "wrap",
});
const panelTitleStyle = css({ textStyle: "bodyStrong", color: "text" });
const stepsStyle = css({ display: "flex", flexDirection: "column", gap: "2" });
const stepStyle = css({ display: "flex", flexDirection: "column", gap: "1" });
const stepHeadStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "2",
});
const stepLabelStyle = css({ textStyle: "caption", color: "text.muted" });
const stepValueStyle = css({
  textStyle: "caption",
  color: "text",
  fontFamily: "numeric",
  fontVariantNumeric: "tabular-nums",
});
const trackStyle = css({ h: "14px", bg: "bg.subtle", rounded: "4px", overflow: "hidden" });
const fillStyle = css({ h: "100%", rounded: "4px", minW: "2px", display: "block" });
const footStyle = css({
  mt: "3",
  pt: "3",
  borderTopWidth: "hairline",
  borderTopStyle: "solid",
  borderTopColor: "border",
  textStyle: "caption",
  color: "text.muted",
});
const totalsStyle = css({ textStyle: "caption", color: "text.muted", mt: "3" });

function VariantPanel({
  variant,
  fill,
  max,
}: {
  variant: FunnelVariant;
  fill: SeriesFill;
  max: number;
}) {
  return (
    <section className={panelStyle} data-testid={`funnel-variant-${variant.variant}`}>
      <div className={panelHeadStyle}>
        <span className={panelTitleStyle}>{variant.label}</span>
        <Badge tone="neutral">배정 {formatCount(variant.assignedCount, "명")}</Badge>
      </div>

      <ul className={stepsStyle}>
        {variant.steps.map((step, index) => (
          <li key={step.event} className={stepStyle} data-step={step.event}>
            <span className={srOnlyStyle}>
              {variant.label} {step.label} {step.count}명, 1단계 대비{" "}
              {formatPercent(step.rateFromTop)}
              {index > 0 ? `, 직전 단계 대비 ${formatPercent(step.rateFromPrev)}` : ""}
            </span>
            <span className={stepHeadStyle} aria-hidden="true">
              <span className={stepLabelStyle}>
                {index + 1}. {step.label}
              </span>
              <span className={stepValueStyle}>
                {formatCount(step.count, "명")}
                {index > 0 ? ` · 직전 대비 ${formatPercent(step.rateFromPrev)}` : ""}
              </span>
            </span>
            <span className={trackStyle} aria-hidden="true">
              <span
                className={cx(fillStyle, SERIES_FILL[fill])}
                style={{ width: `${max > 0 ? (step.count / max) * 100 : 0}%` }}
                title={`${variant.label} ${step.label} ${step.count}명`}
              />
            </span>
          </li>
        ))}
      </ul>

      <p className={footStyle} data-testid={`funnel-conversion-${variant.variant}`}>
        열람 → 가입 완료 전환율 <strong>{formatPercent(variant.conversionRate)}</strong>
      </p>
    </section>
  );
}

export function FunnelChart({ funnel }: { funnel: FunnelResult }) {
  const max = funnel.variants.reduce(
    (peak, variant) => Math.max(peak, ...variant.steps.map((step) => step.count)),
    0,
  );

  if (funnel.totals.assigned === 0) {
    return (
      <ChartEmpty>
        아직 이 실험에 배정된 방문자가 없습니다. 공개 고지서 페이지를 열면 배정이 생기고 퍼널이
        채워집니다.
      </ChartEmpty>
    );
  }

  return (
    <div data-testid="funnel-chart">
      <div className={gridStyle}>
        {funnel.variants.map((variant, index) => (
          <VariantPanel
            key={variant.variant}
            variant={variant}
            fill={VARIANT_FILL[index % VARIANT_FILL.length] ?? "info"}
            max={max}
          />
        ))}
      </div>
      <p className={totalsStyle} data-testid="funnel-totals">
        배정 {formatCount(funnel.totals.assigned, "명")} · 가입 계정과 연결됨{" "}
        {formatCount(funnel.totals.linkedUsers, "명")} · 집계된 이벤트{" "}
        {formatCount(funnel.totals.countedEvents)}
        {funnel.totals.mismatchedEvents > 0
          ? ` · 배정과 다른 화면(?variant= 미리보기)이라 제외한 이벤트 ${formatCount(funnel.totals.mismatchedEvents)}`
          : ""}
      </p>
    </div>
  );
}
