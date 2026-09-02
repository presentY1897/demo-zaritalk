"use client";

/**
 * 실거래가 수집 수동 실행 패널 (T4.3) — 데모 중에 "크론이 돈 것처럼" 지역·월을 긁어 오는 버튼.
 *
 * 실제 호출은 서버 액션(`triggerDealSync`)이 한다 — 시크릿을 브라우저로 내보내지 않기 위해서다.
 * 색은 전부 `@zari/ui` semantic 토큰만 쓴다(하드코딩 색상 0).
 */
import { Badge, Button, Card, Input } from "@zari/ui";
import { useState, useTransition } from "react";
import { css } from "styled-system/css";
import { triggerDealSync } from "./actions";
import { defaultMonths, isDealYm, QUICK_REGIONS, type TriggerDealSyncResult } from "./shared";

const formStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-end",
  gap: "4",
  mt: "6",
  maxW: "720px",
});
const fieldStyle = css({ display: "flex", flexDirection: "column", gap: "1.5", minW: "220px" });
const labelStyle = css({ textStyle: "label", color: "text" });
const selectStyle = css({
  h: "44px",
  px: "3",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  textStyle: "body",
  color: "text",
});
const cardStyle = css({ mt: "6", maxW: "720px" });
const rowStyle = css({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: "3",
  py: "1.5",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderColor: "border",
  _last: { borderBottomWidth: "0" },
});
const rowLabelStyle = css({ textStyle: "body", color: "text.muted" });
const valueStyle = css({ textStyle: "body", color: "text", fontFamily: "numeric" });
const noteStyle = css({ textStyle: "caption", color: "text.muted", mt: "3" });
const inlineNoteStyle = css({ textStyle: "caption", color: "text.muted" });
const errorStyle = css({ textStyle: "body", color: "danger.text", mt: "4" });
const headRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  mb: "3",
});
const sectionTitleStyle = css({ textStyle: "subtitle", color: "text" });
const failureStyle = css({
  textStyle: "caption",
  color: "danger.text",
  mt: "3",
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

function summaryRows(result: Extract<TriggerDealSyncResult, { ok: true }>) {
  const { summary } = result;
  return [
    ["실행 시각", summary.ranAt],
    ["훑은 지역", `${summary.regionsScanned}곳`],
    ["훑은 월", `${summary.monthsScanned}개월`],
    ["국토부 API 호출", `${summary.requests}회`],
    ["받은 거래", `${summary.fetched}건 (버림 ${summary.discarded}건)`],
    ["신규 저장", `${summary.created}건`],
    ["이미 있어 건너뜀", `${summary.skipped}건`],
    ["실패 조각", `${summary.failures.length}건`],
    ["구독자 알림", `${summary.alertsSent}건`],
    ["소요", `${summary.durationMs}ms`],
  ] as const;
}

export function DealSyncPanel({ webUrl }: { webUrl: string }) {
  const [lawdCd, setLawdCd] = useState("");
  const [months, setMonths] = useState(defaultMonths().join(", "));
  const [result, setResult] = useState<TriggerDealSyncResult | null>(null);
  const [pending, startTransition] = useTransition();

  const parsedMonths = months
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter((value) => value !== "");
  const monthsValid = parsedMonths.length === 0 || parsedMonths.every(isDealYm);

  const run = () => {
    startTransition(async () => {
      setResult(await triggerDealSync({ lawdCd, months: parsedMonths }));
    });
  };

  return (
    <div>
      <div className={formStyle}>
        <label className={fieldStyle}>
          <span className={labelStyle}>지역 (LAWD_CD)</span>
          <select
            className={selectStyle}
            value={lawdCd}
            onChange={(event) => setLawdCd(event.target.value)}
          >
            {QUICK_REGIONS.map((region) => (
              <option key={region.code || "auto"} value={region.code}>
                {region.label}
              </option>
            ))}
          </select>
        </label>

        <div className={fieldStyle}>
          <Input
            label="수집 월 (YYYYMM, 쉼표로 여러 개)"
            value={months}
            onChange={(event) => setMonths(event.target.value)}
            error={monthsValid ? undefined : "YYYYMM 여섯 자리로 입력해 주세요."}
            placeholder="202609, 202608"
          />
        </div>

        <Button onClick={run} loading={pending} size="lg" disabled={!monthsValid}>
          지금 수집
        </Button>
      </div>

      <p className={inlineNoteStyle}>
        호출 대상 <code className={valueStyle}>{webUrl}/api/deals/sync</code>
      </p>

      {result?.ok === false && (
        <p className={errorStyle}>
          실행 실패{result.status ? ` (HTTP ${result.status})` : ""} — {result.message}
        </p>
      )}

      {result?.ok && (
        <Card padding="lg" className={cardStyle}>
          <div className={headRowStyle}>
            <span className={sectionTitleStyle}>수집 결과</span>
            <Badge tone={result.summary.failures.length > 0 ? "warning" : "success"} solid>
              {result.summary.failures.length > 0 ? "부분 성공" : "완료"}
            </Badge>
          </div>
          {summaryRows(result).map(([label, value]) => (
            <div key={label} className={rowStyle}>
              <span className={rowLabelStyle}>{label}</span>
              <span className={valueStyle}>{value}</span>
            </div>
          ))}

          {result.summary.failures.length > 0 && (
            <div className={failureStyle}>
              {result.summary.failures.map((failure) => (
                <span key={`${failure.lawdCd}-${failure.dealYm}-${failure.endpoint}`}>
                  {failure.lawdCd} · {failure.dealYm} · {failure.endpoint} — {failure.reason}
                  {failure.status ? ` (HTTP ${failure.status})` : ""}
                </span>
              ))}
            </div>
          )}

          <p className={noteStyle}>
            한 번 더 눌러 보세요 — 멱등이라 「신규 저장 0건 / 이미 있어 건너뜀」으로 바뀝니다.
          </p>
        </Card>
      )}
    </div>
  );
}
