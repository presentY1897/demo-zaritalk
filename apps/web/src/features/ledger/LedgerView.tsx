"use client";

/**
 * `/landlord/ledger` 화면 본체 (T1.6) — 월별·항목별 수입 집계.
 *
 * **입력 폼이 없다.** 장부는 원장(청구·납부)에서 파생하므로 이 화면은 읽기 전용이고,
 * 임대인이 조작하는 것은 **연도**와 **건물 필터** 둘뿐이다.
 *
 * 첫 데이터는 서버 컴포넌트(page.tsx)가 `getLedgerYear` 로 읽어 내려주고,
 * 필터를 바꾸면 같은 모양의 API(`GET /api/landlord/ledger`)를 다시 읽는다.
 * 필터 상태는 로컬 state 로만 둔다 — URL 을 갱신하면 서버 컴포넌트가 다시 돌아
 * 방금 받은 응답을 한 번 더 받게 된다(딥링크는 첫 진입 시 `searchParams` 로 받는다).
 */
import { Button, Card, useTrack } from "@zari/ui";
import { useState } from "react";
import { css, cx } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { formatKrw } from "@/features/landlord/format";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { useLedger } from "./hooks";
import { LEDGER_LINE_FIELD, LEDGER_LINE_LABELS, monthLabel, visibleLedgerLines } from "./lines";
import { LEDGER_LINE_FILL, MonthlyIncomeChart } from "./MonthlyIncomeChart";
import type { LedgerYearDto } from "./types";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const titleStyle = css({ textStyle: "headline", color: "text" });
const captionStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });

const yearRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
});
const yearLabelStyle = css({
  textStyle: "title",
  color: "text",
  fontFamily: "numeric",
  fontVariantNumeric: "tabular-nums",
});

const filterRowStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "1.5",
});
const chipStyle = css({
  minH: "36px",
  px: "3",
  rounded: "pill",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  color: "text.muted",
  textStyle: "label",
  cursor: "pointer",
  _hover: { bg: "bg.subtle" },
  _focusVisible: { outline: "2px solid", outlineColor: "border.focus", outlineOffset: "2px" },
});
const chipActiveStyle = css({
  bg: "primary.subtle",
  borderColor: "primary.border",
  color: "text",
});

const heroLabelStyle = css({ textStyle: "label", color: "text.muted" });
const heroValueStyle = css({
  textStyle: "display",
  color: "text",
  fontFamily: "numeric",
  mt: "1",
});
const heroMetaStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });

const lineListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  mt: "4",
  pt: "4",
  borderTopWidth: "hairline",
  borderTopStyle: "solid",
  borderTopColor: "border",
});
const lineRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
});
const lineLabelStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "2",
  textStyle: "body",
  color: "text",
});
const dotStyle = css({ w: "10px", h: "10px", rounded: "2px", flexShrink: 0 });
const amountStyle = css({
  textStyle: "bodyStrong",
  color: "text",
  fontFamily: "numeric",
  fontVariantNumeric: "tabular-nums",
});

const sectionTitleStyle = css({ textStyle: "subtitle", color: "text", mb: "3" });
const scrollStyle = css({ overflowX: "auto", mx: "-1", px: "1" });
const tableStyle = css({
  w: "full",
  borderCollapse: "collapse",
  textStyle: "caption",
  fontFamily: "numeric",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  "& th, & td": {
    py: "2",
    px: "2",
    textAlign: "right",
    borderBottomWidth: "hairline",
    borderBottomStyle: "solid",
    borderBottomColor: "border",
  },
  "& th": { color: "text.muted", fontWeight: "600" },
  "& td": { color: "text" },
  "& th:first-child, & td:first-child": { textAlign: "left", position: "sticky", left: 0, bg: "bg.card" },
  "& tfoot td": { fontWeight: "700", borderBottomWidth: 0 },
});
const zeroCellStyle = css({ color: "text.disabled" });

const buildingListStyle = css({ display: "flex", flexDirection: "column", gap: "3" });
const buildingRowStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "2",
});
const buildingNameStyle = css({ textStyle: "body", color: "text" });
const noteStyle = css({
  textStyle: "caption",
  color: "text.muted",
  lineHeight: "normal",
});
const errorStyle = css({
  p: "3",
  rounded: "card",
  bg: "danger.subtle",
  color: "danger.text",
  textStyle: "label",
});

function errorMessage(error: unknown): string | null {
  if (error instanceof ApiError) return error.message;
  return error ? "장부를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." : null;
}

export type LedgerViewProps = { initialLedger: LedgerYearDto };

export function LedgerView({ initialLedger }: LedgerViewProps) {
  const [year, setYear] = useState(initialLedger.year);
  const [buildingId, setBuildingId] = useState<string | null>(initialLedger.buildingId);
  const { track } = useTrack();

  const { data = initialLedger, error, isFetching } = useLedger({ year, buildingId }, initialLedger);
  const lines = visibleLedgerLines(data.totals);

  // 연도 이동 범위 — 납부 기록이 있는 해 + 올해(서버가 내려준다). 밖으로 나가면 빈 화면만 보인다
  const minYear = Math.min(...data.availableYears);
  const maxYear = Math.max(...data.availableYears);

  function changeYear(next: number) {
    setYear(next);
    track(TRACK_EVENTS.LEDGER_FILTER_CHANGE, { year: next, buildingId });
  }

  function changeBuilding(next: string | null) {
    setBuildingId(next);
    track(TRACK_EVENTS.LEDGER_FILTER_CHANGE, { year, buildingId: next });
  }

  const selectedBuildingName = buildingId
    ? (data.buildings.find((building) => building.id === buildingId)?.name ?? "선택한 건물")
    : "전체 건물";

  return (
    <main className={pageStyle}>
      <div>
        <h1 className={titleStyle}>임대장부</h1>
        <p className={captionStyle}>
          실제 입금일(KST) 기준으로 원장에서 자동 집계합니다. 따로 입력할 것이 없습니다.
        </p>
      </div>

      <div className={yearRowStyle}>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => changeYear(year - 1)}
          disabled={year <= minYear}
          data-testid="ledger-prev-year"
          aria-label={`${year - 1}년 보기`}
        >
          이전
        </Button>
        <span className={yearLabelStyle} data-testid="ledger-year">
          {year}년
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => changeYear(year + 1)}
          disabled={year >= maxYear}
          data-testid="ledger-next-year"
          aria-label={`${year + 1}년 보기`}
        >
          다음
        </Button>
      </div>

      {data.buildings.length > 0 ? (
        <div className={filterRowStyle} role="group" aria-label="건물 필터">
          <button
            type="button"
            className={cx(chipStyle, buildingId === null ? chipActiveStyle : undefined)}
            aria-pressed={buildingId === null}
            onClick={() => changeBuilding(null)}
            data-testid="ledger-building-filter"
            data-building-id=""
          >
            전체
          </button>
          {data.buildings.map((building) => (
            <button
              key={building.id}
              type="button"
              className={cx(chipStyle, buildingId === building.id ? chipActiveStyle : undefined)}
              aria-pressed={buildingId === building.id}
              onClick={() => changeBuilding(building.id)}
              data-testid="ledger-building-filter"
              data-building-id={building.id}
            >
              {building.name}
            </button>
          ))}
        </div>
      ) : null}

      {errorMessage(error) ? (
        <p className={errorStyle} role="alert">
          {errorMessage(error)}
        </p>
      ) : null}

      <Card padding="md" aria-busy={isFetching}>
        <p className={heroLabelStyle}>
          {data.year}년 수입 합계 · {selectedBuildingName}
        </p>
        <p className={heroValueStyle} data-testid="ledger-total">
          {formatKrw(data.totals.total)}
        </p>
        <p className={heroMetaStyle}>납부 {data.totals.paymentCount}건</p>

        <dl className={lineListStyle}>
          {lines.map((key) => (
            <div key={key} className={lineRowStyle}>
              <dt className={lineLabelStyle}>
                <span className={cx(dotStyle, LEDGER_LINE_FILL[key])} aria-hidden="true" />
                {LEDGER_LINE_LABELS[key]}
              </dt>
              <dd className={amountStyle} data-testid={`ledger-line-${key}`}>
                {formatKrw(data.totals[LEDGER_LINE_FIELD[key]])}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card padding="md">
        <h2 className={sectionTitleStyle}>월 비교</h2>
        <MonthlyIncomeChart months={data.months} totals={data.totals} year={data.year} />
      </Card>

      <Card padding="md">
        <h2 className={sectionTitleStyle}>월별 항목</h2>
        <div className={scrollStyle}>
          <table className={tableStyle} data-testid="ledger-table">
            <caption className={noteStyle}>
              {data.year}년 · {selectedBuildingName} — 실제 입금일(KST) 기준
            </caption>
            <thead>
              <tr>
                <th scope="col">월</th>
                {lines.map((key) => (
                  <th key={key} scope="col">
                    {LEDGER_LINE_LABELS[key]}
                  </th>
                ))}
                <th scope="col">합계</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((bucket) => (
                <tr key={bucket.month} data-testid="ledger-table-row" data-month={bucket.month}>
                  <th scope="row">{monthLabel(bucket.month)}</th>
                  {lines.map((key) => {
                    const amount = bucket[LEDGER_LINE_FIELD[key]];
                    return (
                      <td key={key} className={amount === 0 ? zeroCellStyle : undefined}>
                        {amount.toLocaleString("ko-KR")}
                      </td>
                    );
                  })}
                  <td className={bucket.total === 0 ? zeroCellStyle : undefined}>
                    {bucket.total.toLocaleString("ko-KR")}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">합계</th>
                {lines.map((key) => (
                  <td key={key}>{data.totals[LEDGER_LINE_FIELD[key]].toLocaleString("ko-KR")}</td>
                ))}
                <td>{data.totals.total.toLocaleString("ko-KR")}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {buildingId === null && data.matrix.length > 1 ? (
        <Card padding="md">
          <h2 className={sectionTitleStyle}>건물별 합계</h2>
          <div className={buildingListStyle}>
            {data.matrix.map((row) => (
              <div key={row.buildingId} data-testid="ledger-building-total">
                <div className={buildingRowStyle}>
                  <span className={buildingNameStyle}>{row.buildingName}</span>
                  <span className={amountStyle}>{formatKrw(row.totals.total)}</span>
                </div>
                <p className={noteStyle}>
                  {lines
                    .map((key) => `${LEDGER_LINE_LABELS[key]} ${formatKrw(row.totals[LEDGER_LINE_FIELD[key]])}`)
                    .join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <p className={noteStyle}>
        집계 기준 — 청구한 달이 아니라 <strong>실제 입금일(`paidAt`)</strong>이 속한 달의 수입으로
        잡습니다. 월 경계는 한국 시간(KST) 달력이고, 지난달에서 밀려온 돈은 「전월 이월」 항목으로
        나눠 그 달 월세와 섞이지 않게 합니다.
      </p>
    </main>
  );
}
