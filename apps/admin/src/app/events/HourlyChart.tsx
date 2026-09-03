/**
 * 시간대별(KST 0~23시) 이벤트 카운트 차트 (T6.3).
 *
 * ## 새 의존성 없이 PandaCSS 로만 그린다
 * T1.6 임대장부·T4.4 실거래가 추이와 같은 방식이다 — `pnpm-lock.yaml` 을 건드리지 않는다.
 *
 * ## 왜 세로 막대인가
 * 어드민은 데스크톱 폭이라 24칸을 가로로 세울 자리가 있고, **시간축은 왼쪽에서 오른쪽으로**
 * 읽는 것이 자연스럽다(0시 → 23시). 480px 셸인 web 쪽 차트가 가로 막대를 고른 것과 반대다.
 *
 * ## 색만으로 정보를 전달하지 않는다 (T0.6 원칙)
 * - 막대마다 **건수를 숫자로** 적는다. 색을 못 보거나 막대가 짧아도 표는 그대로 읽힌다.
 * - 아래에 **시(hour) 라벨**이 붙고, 막대 하나하나에 `title` 과 스크린리더 요약이 붙는다.
 * - 막대 색은 한 가지뿐이다(semantic 토큰 `text.brand`) — 색이 뜻을 지지 않는다.
 *
 * 기준선은 0이고, 길이는 **그 구간 최대 건수 대비 비율**이다.
 */
import { css } from "styled-system/css";
import type { AdminHourBucket } from "./shared";

const wrapStyle = css({
  mt: "5",
  bg: "bg.card",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  rounded: "card",
  p: "4",
  overflowX: "auto",
});
const captionStyle = css({ textStyle: "caption", color: "text.muted", mb: "3" });
const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(24, minmax(26px, 1fr))",
  gap: "1",
  alignItems: "end",
  minW: "660px",
  h: "180px",
});
const colStyle = css({
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: "1",
  h: "full",
});
const valueStyle = css({
  textStyle: "caption",
  color: "text",
  fontFamily: "numeric",
  fontVariantNumeric: "tabular-nums",
});
const zeroValueStyle = css({ color: "text.disabled" });
const barStyle = css({ w: "full", bg: "text.brand", roundedTop: "4px", minH: "2px" });
const emptyBarStyle = css({ w: "full", bg: "border", roundedTop: "4px", minH: "2px", h: "2px" });
const axisStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(24, minmax(26px, 1fr))",
  gap: "1",
  mt: "2",
  minW: "660px",
});
const hourStyle = css({
  textStyle: "caption",
  color: "text.muted",
  textAlign: "center",
  fontFamily: "numeric",
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
const emptyStyle = css({ py: "6", textAlign: "center", textStyle: "body", color: "text.muted" });

export function HourlyChart({
  hourly,
  range,
  sampled,
  truncated,
}: {
  hourly: AdminHourBucket[];
  range: { from: string; to: string };
  sampled: number;
  truncated: boolean;
}) {
  const max = hourly.reduce((peak, bucket) => Math.max(peak, bucket.count), 0);

  return (
    <div className={wrapStyle} data-testid="admin-hourly-chart">
      <p className={captionStyle}>
        {range.from} ~ {range.to} (KST) · 시간대별 {sampled.toLocaleString("ko-KR")}건
        {truncated ? " (상한까지만 집계)" : ""}
      </p>

      {max === 0 ? (
        <p className={emptyStyle}>이 기간에는 수집된 이벤트가 없습니다.</p>
      ) : (
        <>
          <div className={rowStyle}>
            {hourly.map((bucket) => (
              <div
                key={bucket.hour}
                className={colStyle}
                data-testid="admin-hourly-bar"
                data-hour={bucket.hour}
                data-count={bucket.count}
              >
                <span
                  className={
                    bucket.count === 0 ? `${valueStyle} ${zeroValueStyle}` : valueStyle
                  }
                  aria-hidden="true"
                >
                  {bucket.count}
                </span>
                <span className={srOnlyStyle}>
                  {`${bucket.hour}시 ${bucket.count}건`}
                </span>
                {bucket.count === 0 ? (
                  <span className={emptyBarStyle} aria-hidden="true" />
                ) : (
                  <span
                    className={barStyle}
                    style={{ height: `${Math.max((bucket.count / max) * 100, 3)}%` }}
                    title={`${bucket.hour}시 ${bucket.count}건`}
                    aria-hidden="true"
                  />
                )}
              </div>
            ))}
          </div>
          <div className={axisStyle} aria-hidden="true">
            {hourly.map((bucket) => (
              <span key={bucket.hour} className={hourStyle}>
                {bucket.hour}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
