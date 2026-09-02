"use client";

/**
 * `/refund/calculator` 화면 (T2.3) — **비로그인 공개**.
 *
 * 입력(연 총급여·월세·임차 기간) → `POST /api/refund/calculate` → 연도별 내역 + 합계 + CTA.
 * 계산식은 한 줄도 여기 없다 — 서버와 **같은 순수 함수**(`features/refund/calc.ts`)가 낸 값을
 * 그대로 그린다. 화면에서 다시 계산하면 API 응답과 숫자가 갈라진다(원장 엔진 소비 화면과 같은 원칙).
 *
 * 입력 검증도 서버와 **같은 zod 스키마**(`schema.ts`)로 먼저 막는다 — 0원·음수·기간 역전은
 * 왕복 없이 여기서 걸리고, 오늘 기준 판정(미래 시작일)만 서버 문구를 그대로 보여 준다.
 *
 * 색은 전부 semantic 토큰이다(하드코딩 색상 0, T0.6).
 */
import { Badge, Button, Card, CardHeader, Input, useTrack } from "@zari/ui";
import Link from "next/link";
import { useState } from "react";
import { css } from "styled-system/css";
import { formatKrw } from "@/features/landlord/format";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import type { RefundCalcResult } from "./calc";
import { REFUND_CTA_SOURCE, refundCtaHref, refundCtaLabel } from "./cta";
import { REFUND_DISCLAIMER } from "./disclaimer";
import { useRefundCalculation } from "./hooks";
import { refundCalcSchema } from "./schema";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const headerStyle = css({ display: "flex", flexDirection: "column", gap: "1" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const captionStyle = css({ textStyle: "caption", color: "text.muted" });
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
const ineligibleStyle = css({
  mt: "3",
  bg: "warning.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "warning.border",
  rounded: "field",
  p: "3",
  textStyle: "caption",
  color: "warning.text",
});
const formStyle = css({ display: "flex", flexDirection: "column", gap: "field" });
/**
 * 날짜 두 칸 나란히. **`minmax(0, 1fr)` 이어야 한다** — 기본 `1fr` 은 `minmax(auto, 1fr)` 이라
 * 칸이 내용의 최소 폭 아래로 못 줄어드는데, `input[type="date"]` 의 최소 폭은 브라우저가
 * **날짜 글자(MM/DD/YYYY)와 달력 아이콘의 실제 폭**으로 정한다. 즉 폰트가 조금만 넓어도
 * 두 칸이 393px 모바일 셸을 뚫고, 그러면 크로뮴 모바일 에뮬레이션이 화면을 축소해
 * (레이아웃 뷰포트 393→406, page scale ≈ 0.97) 좌표계가 어긋난다.
 * 그 상태에서는 스크롤이 깊은 요소를 클릭할 때 실제 이벤트가 엉뚱한 곳에 떨어진다 —
 * CI 에서만 E2E 가 죽던 원인이 정확히 이것이었다(`docs/tasks/t0.2-test-infra.md` 표 참고).
 * 자식의 `minW: 0` 도 같은 이유로 함께 둔다.
 */
const twoColStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "2",
  "& > *": { minWidth: 0 },
});
const hintStyle = css({ textStyle: "caption", color: "text.muted", fontFamily: "numeric" });
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
const totalAmountStyle = css({ textStyle: "display", fontFamily: "numeric", color: "text" });
const totalSubStyle = css({ textStyle: "body", color: "text.muted", mt: "1" });
const sectionLabelStyle = css({ mt: "4", mb: "2", textStyle: "label", color: "text.muted" });
const yearRowStyle = css({
  display: "grid",
  gridTemplateColumns: "1fr auto",
  rowGap: "0.5",
  columnGap: "2",
  py: "2.5",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  _last: { borderBottomWidth: "0" },
});
const yearLabelStyle = css({ textStyle: "bodyStrong", color: "text" });
const yearCreditStyle = css({
  textStyle: "bodyStrong",
  color: "text",
  fontFamily: "numeric",
  textAlign: "right",
});
const yearDetailStyle = css({ textStyle: "caption", color: "text.muted", fontFamily: "numeric" });
const yearCapStyle = css({ textStyle: "caption", color: "warning.text", fontFamily: "numeric" });
const totalRowStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "2",
  mt: "3",
  pt: "3",
  borderTopWidth: "hairline",
  borderTopStyle: "solid",
  borderTopColor: "border",
  textStyle: "bodyStrong",
  color: "text",
});
const totalRowValueStyle = css({ textStyle: "title", color: "text", fontFamily: "numeric" });
const ctaCardStyle = css({
  bg: "primary.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "primary.border",
  rounded: "card",
  p: "gutter",
  display: "flex",
  flexDirection: "column",
  gap: "2",
});
const ctaHeadlineStyle = css({ textStyle: "title", color: "text" });
const ctaDescStyle = css({ textStyle: "body", color: "text" });
const ctaFootnoteStyle = css({ textStyle: "caption", color: "text.muted", textAlign: "center" });
const linkResetStyle = css({ textDecoration: "none", display: "block", mt: "1" });
const emptyStyle = css({
  p: "5",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "dashed",
  borderColor: "border",
  textAlign: "center",
  textStyle: "body",
  color: "text.muted",
});
const footerStyle = css({ textStyle: "caption", color: "text.muted", textAlign: "center", pb: "4" });

/** `"1,200,000"`·`"1200000"` → 1200000. 숫자로 못 읽으면 NaN(스키마가 막는다). */
function toWon(value: string): number {
  const trimmed = value.replace(/[,\s]/g, "");
  if (trimmed === "") return Number.NaN;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** 입력 밑에 붙는 "= 4,800만원" 힌트. 값이 이상하면 아무것도 보여 주지 않는다. */
function manwonHint(value: string): string | null {
  const won = toWon(value);
  if (!Number.isFinite(won) || won <= 0) return null;
  return `= ${Math.floor(won / 10_000).toLocaleString("ko-KR")}만원`;
}

function ineligibleMessage(result: RefundCalcResult): string | null {
  switch (result.ineligibleReason) {
    case "GROSS_SALARY_OVER":
      return `연 총급여가 ${formatKrw(80_000_000)}을 넘으면 월세 세액공제 대상이 아닙니다.`;
    case "NO_ELIGIBLE_MONTHS":
      return `소급 가능한 ${result.retroRange.fromYear}~${result.retroRange.toYear}년 안에 월세를 지급한 기간이 없습니다.`;
    default:
      return null;
  }
}

export type RefundCalculatorViewProps = {
  /** 로그인 여부 — CTA 목적지·문구만 바꾼다(화면 내용은 같다) */
  loggedIn: boolean;
  /** 소급 기준일 `YYYY-MM-DD` (서버의 `kstToday()`) */
  asOf: string;
  retroRange: { fromYear: number; toYear: number };
  /** 폼 기본 기간 — 서버에서 만들어 넘긴다(클라이언트가 만들면 하이드레이션이 갈린다) */
  defaultPeriod: { startDate: string; endDate: string };
};

export function RefundCalculatorView({
  loggedIn,
  asOf,
  retroRange,
  defaultPeriod,
}: RefundCalculatorViewProps) {
  const { track, flush } = useTrack();
  const calculation = useRefundCalculation();

  const [grossSalary, setGrossSalary] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [startDate, setStartDate] = useState(defaultPeriod.startDate);
  const [endDate, setEndDate] = useState(defaultPeriod.endDate);
  const [localError, setLocalError] = useState<string | null>(null);

  const result = calculation.data ?? null;
  const serverError = calculation.error instanceof Error ? calculation.error.message : null;
  const errorMessage = localError ?? serverError;

  function handleSubmit() {
    if (calculation.isPending) return;

    // 빈 값·문자는 zod 기본 문구(영문)가 나가므로 먼저 우리 문구로 막는다
    const gross = toWon(grossSalary);
    const rent = toWon(monthlyRent);
    if (!Number.isFinite(gross) || !Number.isFinite(rent)) {
      setLocalError("총급여와 월세를 숫자(원 단위)로 입력해 주세요.");
      return;
    }

    const parsed = refundCalcSchema.safeParse({
      grossSalary: gross,
      monthlyRent: rent,
      startDate,
      endDate,
    });
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.");
      return;
    }
    setLocalError(null);

    calculation.mutate(parsed.data, {
      onSuccess: (calculated) => {
        track(TRACK_EVENTS.REFUND_CALC_SUBMIT, {
          grossSalary: calculated.input.grossSalary,
          monthlyRent: calculated.input.monthlyRent,
          months: calculated.totals.months,
          years: calculated.years.length,
          creditAmount: calculated.totals.creditAmount,
          creditRatePercent: calculated.creditRatePercent,
        });
      },
    });
  }

  function handleCtaClick() {
    track(TRACK_EVENTS.REFUND_CTA_CLICK, {
      source: REFUND_CTA_SOURCE,
      loggedIn,
      creditAmount: result?.totals.creditAmount ?? 0,
      years: result?.years.length ?? 0,
    });
    // 로그인·신청 화면으로 넘어가기 전에 큐를 비운다(퍼널이 끊기지 않게)
    flush();
  }

  return (
    <main className={pageStyle} data-testid="refund-calculator">
      <header className={headerStyle}>
        <h1 className={titleStyle}>월세 환급 계산기</h1>
        <p className={leadStyle}>
          연말정산에서 놓친 월세 세액공제, 최근 {retroRange.toYear - retroRange.fromYear + 1}년치를
          소급해 얼마나 돌려받을 수 있는지 계산해 보세요.
        </p>
        <p className={captionStyle} data-testid="refund-retro-range">
          {retroRange.fromYear}~{retroRange.toYear}년분 대상 · {asOf.replaceAll("-", ".")} 기준
        </p>
      </header>

      <p className={noticeStyle} data-testid="refund-disclaimer">
        {REFUND_DISCLAIMER}
      </p>

      <Card padding="md">
        <CardHeader title="입력" />
        <div className={formStyle}>
          <div>
            <Input
              label="연 총급여"
              inputMode="numeric"
              placeholder="48000000"
              value={grossSalary}
              onChange={(event) => setGrossSalary(event.target.value)}
              helper="원 단위로 입력하세요. 비과세소득을 뺀 연간 총급여입니다."
              data-testid="refund-gross-salary"
            />
            {manwonHint(grossSalary) ? (
              <p className={hintStyle}>{manwonHint(grossSalary)}</p>
            ) : null}
          </div>

          <div>
            <Input
              label="월세 (월)"
              inputMode="numeric"
              placeholder="550000"
              value={monthlyRent}
              onChange={(event) => setMonthlyRent(event.target.value)}
              helper="관리비는 빼고 순수 월세만 입력하세요."
              data-testid="refund-monthly-rent"
            />
            {manwonHint(monthlyRent) ? (
              <p className={hintStyle}>{manwonHint(monthlyRent)}</p>
            ) : null}
          </div>

          <div className={twoColStyle}>
            <Input
              label="임차 시작일"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              data-testid="refund-start-date"
            />
            <Input
              label="임차 종료일"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              data-testid="refund-end-date"
            />
          </div>

          {errorMessage ? (
            <p className={errorBoxStyle} role="alert" data-testid="refund-error">
              {errorMessage}
            </p>
          ) : null}

          <Button
            fullWidth
            size="lg"
            onClick={handleSubmit}
            loading={calculation.isPending}
            data-testid="refund-submit"
          >
            환급액 계산하기
          </Button>
        </div>
      </Card>

      {result ? (
        <>
          <Card padding="md" data-testid="refund-result">
            <CardHeader
              title="예상 환급액"
              aside={
                result.creditRatePercent > 0 ? (
                  <Badge tone="success" data-testid="refund-rate">
                    공제율 {result.creditRatePercent}%
                  </Badge>
                ) : (
                  <Badge tone="neutral" data-testid="refund-rate">
                    대상 외
                  </Badge>
                )
              }
            />
            <p className={totalAmountStyle} data-testid="refund-total-credit">
              {formatKrw(result.totals.creditAmount)}
            </p>
            <p className={totalSubStyle}>
              {result.countedPeriod
                ? `${result.countedPeriod.startDate.replaceAll("-", ".")} ~ ${result.countedPeriod.endDate.replaceAll("-", ".")} · 월세 ${result.totals.months}개월분`
                : "계산 대상 기간이 없습니다."}
            </p>

            {ineligibleMessage(result) ? (
              <p className={ineligibleStyle} data-testid="refund-ineligible">
                {ineligibleMessage(result)}
              </p>
            ) : null}

            <p className={sectionLabelStyle}>연도별 내역</p>
            {result.years.length === 0 ? (
              <p className={emptyStyle} data-testid="refund-years-empty">
                소급 대상 연도에 지급한 월세가 없습니다.
              </p>
            ) : (
              <div data-testid="refund-year-list">
                {result.years.map((row) => (
                  <div key={row.year} className={yearRowStyle} data-testid="refund-year-row" data-year={row.year}>
                    <span className={yearLabelStyle}>
                      {row.year}년 · {row.months}개월
                    </span>
                    <span className={yearCreditStyle} data-testid="refund-year-credit">
                      {formatKrw(row.creditAmount)}
                    </span>
                    <span className={yearDetailStyle}>
                      지급 월세 {formatKrw(row.paidRent)} · 공제 대상 {formatKrw(row.eligibleRent)}
                      {row.creditRatePercent > 0 ? ` × ${row.creditRatePercent}%` : " · 대상 외"}
                    </span>
                    {row.cappedOutRent > 0 ? (
                      <span className={yearCapStyle} data-testid="refund-year-capped">
                        연 한도 {formatKrw(row.annualRentCap)} 초과분 {formatKrw(row.cappedOutRent)}{" "}
                        제외
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            <p className={totalRowStyle}>
              <span>합계</span>
              <span className={totalRowValueStyle} data-testid="refund-total-row">
                {formatKrw(result.totals.creditAmount)}
              </span>
            </p>
            <p className={css({ mt: "2", textStyle: "caption", color: "text.muted" })}>
              지급 월세 합계 {formatKrw(result.totals.paidRent)} 중 공제 대상{" "}
              {formatKrw(result.totals.eligibleRent)} 기준 · 원 단위 미만은 내림합니다.
            </p>
          </Card>

          <section className={ctaCardStyle} aria-labelledby="refund-cta-headline">
            <h2 className={ctaHeadlineStyle} id="refund-cta-headline">
              {result.totals.creditAmount > 0
                ? `${formatKrw(result.totals.creditAmount)} 환급 신청하기`
                : "환급 신청 알아보기"}
            </h2>
            <p className={ctaDescStyle}>
              계약서와 주민등록등본만 있으면 신청할 수 있습니다. 입력한 값은 신청서에 그대로
              채워집니다.
            </p>
            <Link
              href={refundCtaHref(result.input, loggedIn)}
              className={linkResetStyle}
              onClick={handleCtaClick}
              data-testid="refund-cta"
              data-logged-in={loggedIn ? "true" : "false"}
            >
              <Button fullWidth size="lg">
                {refundCtaLabel(loggedIn)}
              </Button>
            </Link>
            <p className={ctaFootnoteStyle}>
              {loggedIn
                ? "신청 화면에서 서류를 올리면 심사가 시작됩니다."
                : "전화번호만 있으면 30초면 시작합니다."}
            </p>
          </section>
        </>
      ) : null}

      <p className={footerStyle}>
        자리 데모의 환급 계산기입니다. 실제 세법 자문이 아니며, 신청 전 국세청 홈택스나 세무 전문가의
        확인을 권합니다.
      </p>
    </main>
  );
}
