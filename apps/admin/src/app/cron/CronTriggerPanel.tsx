"use client";

/**
 * 크론 수동 실행 패널 (T1.4) — 데모 중에 "하루가 지난 것처럼" 원장을 돌려 보는 버튼.
 *
 * 실제 호출은 서버 액션(`triggerDailyCron`)이 한다 — 시크릿을 브라우저로 내보내지 않기 위해서다.
 * 색은 전부 `@zari/ui` semantic 토큰만 쓴다(하드코딩 색상 0).
 */
import { Badge, Button, Card } from "@zari/ui";
import { useState, useTransition } from "react";
import { css } from "styled-system/css";
import { triggerDailyCron } from "./actions";
import type { DailyCronSummary, TriggerCronResult } from "./shared";

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
const labelStyle = css({ textStyle: "body", color: "text.muted" });
const valueStyle = css({ textStyle: "body", color: "text", fontFamily: "numeric" });
const actionsStyle = css({ display: "flex", alignItems: "center", gap: "3", mt: "6" });
const noteStyle = css({ textStyle: "caption", color: "text.muted", mt: "3" });
/** 버튼 옆에 붙는 한 줄 — flex 행 안이라 위 여백을 주지 않는다 */
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

/** 결과 요약을 사람이 읽는 줄로 편다. */
function summaryRows(
  result: Extract<TriggerCronResult, { ok: true }>,
): (readonly [string, string])[] {
  const { summary } = result;
  return [
    ["기준일 (KST)", summary.today],
    ["청구 대상 월", `${summary.targetMonth.year}년 ${summary.targetMonth.month}월`],
    ["훑은 ACTIVE 계약", `${summary.leasesScanned}건`],
    ["신규 청구 생성", `${summary.chargesCreated}건`],
    ["이미 있어 건너뜀", `${summary.chargesSkipped}건`],
    ["이월액 정정", `${summary.carriedOverAdjusted}건`],
    ["상태 변경", `${summary.statusChanged}건 (연체 전환 ${summary.statusBreakdown.OVERDUE ?? 0}건)`],
    ["만기 알림 발송", `${summary.expiryNoticesSent}건 (이미 보냄 ${summary.expiryNoticesSkipped}건)`],
    ["소요", `${summary.durationMs}ms`],
    ...dealsRows(summary.deals),
  ];
}

/** 실거래가 수집(T4.3) 결과 줄 — 같은 크론이 원장 뒤에 이어서 돌린다 */
function dealsRows(deals: DailyCronSummary["deals"]): (readonly [string, string])[] {
  if (!deals) return [];
  if (deals.skipped === "NO_KEY") {
    return [["실거래가 수집", "건너뜀 (DATA_GO_KR_API_KEY 없음)"] as const];
  }
  return [
    ["실거래가 — 훑은 지역", `${deals.regionsScanned}곳 / ${deals.monthsScanned}개월`] as const,
    ["실거래가 — API 호출", `${deals.requests}회`] as const,
    ["실거래가 — 신규 저장", `${deals.created}건 (이미 있어 건너뜀 ${deals.alreadyHad}건)`] as const,
    ["실거래가 — 실패 조각", `${deals.failed}건`] as const,
    ["실거래가 — 구독자 알림", `${deals.alertsSent}건`] as const,
  ];
}

export function CronTriggerPanel({ webUrl }: { webUrl: string }) {
  const [result, setResult] = useState<TriggerCronResult | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      setResult(await triggerDailyCron());
    });
  };

  return (
    <div>
      <div className={actionsStyle}>
        <Button onClick={run} loading={pending} size="lg">
          지금 크론 실행
        </Button>
        <span className={inlineNoteStyle}>
          호출 대상 <code className={valueStyle}>{webUrl}/api/cron/daily</code>
        </span>
      </div>

      {result?.ok === false && (
        <p className={errorStyle}>
          실행 실패{result.status ? ` (HTTP ${result.status})` : ""} — {result.message}
        </p>
      )}

      {result?.ok && (
        <Card padding="lg" className={cardStyle}>
          <div className={headRowStyle}>
            <span className={sectionTitleStyle}>실행 결과</span>
            <Badge tone="success" solid>
              완료
            </Badge>
          </div>
          {summaryRows(result).map(([label, value]) => (
            <div key={label} className={rowStyle}>
              <span className={labelStyle}>{label}</span>
              <span className={valueStyle}>{value}</span>
            </div>
          ))}
          <p className={noteStyle}>
            한 번 더 눌러 보세요 — 멱등이라 「신규 청구 생성 0건 / 이미 있어 건너뜀」으로 바뀝니다.
          </p>
        </Card>
      )}
    </div>
  );
}
