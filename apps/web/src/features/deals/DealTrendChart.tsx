"use client";

/**
 * 단지별 추이 미니 차트 (T4.4) — **새 의존성 없이** CSS(panda)만으로 그린 가로 막대.
 * T1.6 임대장부의 `MonthlyIncomeChart` 와 같은 방식이다(`pnpm-lock.yaml` 을 건드리지 않는다).
 *
 * ## 왜 가로 막대인가
 * 480px 셸에서 세로 막대 12개를 세우면 막대 하나가 30px 남짓이라 값 라벨을 붙일 자리가 없다.
 * 가로로 눕히면 한 행이 `[7월] [막대] [8억 5,000만원]` 으로 읽히고, 거래가 1건뿐인 달도
 * 건수를 함께 적어 평균이 얼마나 믿을 만한지 드러난다.
 *
 * ## 색만으로 정보를 전달하지 않는다 (T0.6 원칙)
 * - 행마다 **월 이름과 평균 금액을 글자로** 적는다. 막대가 없어도 표는 그대로 읽힌다.
 * - 막대 색은 하나뿐이고(semantic 토큰 `text.brand`), 뜻은 전부 글자가 진다.
 * - 행마다 숨겨 둔 스크린리더 요약이 **건수·평균·최저·최고**를 읽어 준다.
 * - 월세 탭에서는 막대가 보증금, 라벨에 월세 평균을 덧붙인다(두 축을 겹쳐 그리지 않는다).
 *
 * ## 기준선
 * 막대 길이는 **그 구간 최고 평균 대비 비율**이다. 0원부터가 아니라 최고값 기준이므로,
 * 금액의 절대 크기가 아니라 **달 사이의 상대 변화**를 읽는 그림이라는 것을 캡션에 적어 둔다.
 */
import { css, cx } from "styled-system/css";
import { DEAL_TYPE_META, formatManwonAmount } from "./labels";
import type { DealTrendDto, RealDealTypeValue } from "./types";

const wrapStyle = css({ display: "flex", flexDirection: "column", gap: "2" });
const captionStyle = css({ textStyle: "caption", color: "text.muted" });
const rowsStyle = css({ display: "flex", flexDirection: "column", gap: "1" });
const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "3.25rem 1fr auto",
  alignItems: "center",
  gap: "2",
  minH: "24px",
});
const monthStyle = css({ textStyle: "caption", color: "text.muted", textAlign: "right" });
const trackStyle = css({ display: "flex", h: "14px", alignItems: "stretch", minW: 0 });
const barStyle = css({ bg: "text.brand", minW: "3px", roundedRight: "4px" });
const valueStyle = css({
  textStyle: "caption",
  color: "text",
  fontFamily: "numeric",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});
const countStyle = css({ color: "text.muted" });
const emptyStyle = css({
  py: "5",
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

export type DealTrendChartProps = {
  trend: DealTrendDto;
  dealType: RealDealTypeValue;
  regionLabel: string;
};

export function DealTrendChart({ trend, dealType, regionLabel }: DealTrendChartProps) {
  const scope = trend.apartmentName ?? `${regionLabel} 전체`;
  const meta = DEAL_TYPE_META[dealType];

  if (trend.points.length === 0) {
    return (
      <p className={emptyStyle} data-testid="deals-trend-empty">
        {scope}의 최근 {meta.label} 거래가 아직 없습니다.
      </p>
    );
  }

  const max = trend.points.reduce((peak, point) => Math.max(peak, point.avgAmount), 0);

  return (
    <div className={wrapStyle} data-testid="deals-trend">
      <p className={captionStyle}>
        {scope} · 월별 평균 {meta.amountLabel} (막대는 구간 최고값 대비 길이)
      </p>
      <ul className={rowsStyle}>
        {trend.points.map((point) => (
          <li
            key={point.ym}
            className={rowStyle}
            data-testid="deals-trend-row"
            data-ym={point.ym}
          >
            <span className={monthStyle} aria-hidden="true">
              {point.label}
            </span>
            <span className={srOnlyStyle}>
              {`${point.label} ${meta.label} ${point.count}건, 평균 ${meta.amountLabel} ${formatManwonAmount(point.avgAmount)}, 최저 ${formatManwonAmount(point.minAmount)}, 최고 ${formatManwonAmount(point.maxAmount)}${
                point.avgMonthlyRent !== null
                  ? `, 평균 월세 ${formatManwonAmount(point.avgMonthlyRent)}`
                  : ""
              }`}
            </span>
            <span className={trackStyle} aria-hidden="true">
              <span
                className={barStyle}
                style={{ width: `${max > 0 ? Math.max((point.avgAmount / max) * 100, 2) : 2}%` }}
                title={`${point.label} 평균 ${formatManwonAmount(point.avgAmount)} (${point.count}건)`}
              />
            </span>
            <span className={valueStyle} aria-hidden="true">
              {formatManwonAmount(point.avgAmount)}
              {point.avgMonthlyRent !== null ? ` / 월 ${formatManwonAmount(point.avgMonthlyRent)}` : ""}
              <span className={countStyle}> · {point.count}건</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
