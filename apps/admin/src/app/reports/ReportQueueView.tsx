"use client";

/**
 * `/reports` 신고 처리 큐 화면 (T4.2) — 데스크톱 2단(목록 + 대상 미리보기·액션).
 *
 * **규칙을 하나도 들고 있지 않다.** 버튼은 응답의 `availableActions` 를 그대로 그리고(라벨·톤·설명까지),
 * 상태 배지도 `statusLabel`·`statusTone` 을 읽는다 — 블라인드 노출 규칙과 액션의 파급 범위는
 * web 한 곳(`apps/web/src/features/community/moderation.ts`)에만 있다.
 *
 * 색은 전부 semantic 토큰이다(하드코딩 색상 0, T0.6).
 */
import { Badge, Button, Card, CardHeader } from "@zari/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { css } from "styled-system/css";
import { runReportAction } from "./actions";
import {
  formatMoment,
  profileTypeLabel,
  REPORT_FILTERS,
  type AdminReportItem,
  type QueueResult,
} from "./shared";

const headStyle = css({ display: "flex", alignItems: "center", gap: "3" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const descStyle = css({ textStyle: "body", color: "text.muted", mt: "2", maxW: "720px" });
const filterRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "2", mt: "4" });
const filterStyle = css({
  px: "3",
  py: "1.5",
  rounded: "pill",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  textStyle: "caption",
  color: "text.muted",
  textDecoration: "none",
  bg: "bg.card",
});
const filterActiveStyle = css({ borderColor: "primary.border", bg: "primary.subtle", color: "text" });
const layoutStyle = css({
  mt: "5",
  display: "grid",
  gridTemplateColumns: { base: "1fr", lg: "minmax(280px, 380px) 1fr" },
  gap: "4",
  alignItems: "start",
});
const listStyle = css({ display: "flex", flexDirection: "column", gap: "2" });
const rowStyle = css({
  w: "full",
  textAlign: "left",
  p: "3",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: "1",
});
const rowActiveStyle = css({ borderColor: "primary.border", bg: "primary.subtle" });
const rowTopStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
});
const rowNameStyle = css({ textStyle: "bodyStrong", color: "text" });
const rowMetaStyle = css({ textStyle: "caption", color: "text.muted" });
const fieldGridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "2",
  mt: "2",
});
const fieldStyle = css({ display: "flex", flexDirection: "column", gap: "0.5" });
const fieldLabelStyle = css({ textStyle: "caption", color: "text.muted" });
const fieldValueStyle = css({ textStyle: "body", color: "text" });
const previewStyle = css({
  mt: "3",
  p: "3",
  rounded: "field",
  bg: "bg.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  display: "flex",
  flexDirection: "column",
  gap: "2",
});
const previewBodyStyle = css({ textStyle: "body", color: "text", whiteSpace: "pre-wrap" });
const reasonStyle = css({
  mt: "3",
  p: "3",
  rounded: "field",
  bg: "warning.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "warning.border",
  textStyle: "caption",
  color: "warning.text",
  whiteSpace: "pre-wrap",
});
const actionRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "2", mt: "4" });
const actionHintStyle = css({ textStyle: "caption", color: "text.muted", mt: "2" });
const noticeStyle = css({
  mt: "3",
  p: "3",
  rounded: "field",
  bg: "info.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "info.border",
  textStyle: "caption",
  color: "info.text",
});
const errorStyle = css({
  mt: "3",
  p: "3",
  rounded: "field",
  bg: "danger.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "danger.border",
  textStyle: "caption",
  color: "danger.text",
});
const emptyStyle = css({ textStyle: "body", color: "text.muted" });

export function ReportQueueView({ filterKey, queue }: { filterKey: string; queue: QueueResult }) {
  const router = useRouter();
  const [items, setItems] = useState<AdminReportItem[]>(queue.ok ? queue.reports : []);
  const [selectedId, setSelectedId] = useState<string | null>(
    queue.ok ? (queue.reports[0]?.id ?? null) : null,
  );
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(queue.ok ? null : queue.message);

  const selected = items.find((item) => item.id === selectedId) ?? null;

  async function handleAction(action: string) {
    if (!selected) return;
    setError(null);
    setMessage(null);
    setPending(action);
    try {
      const result = await runReportAction({ reportId: selected.id, action });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setItems((prev) =>
        prev.map((item) => (item.id === result.report.id ? result.report : item)),
      );
      setMessage(
        result.alsoClosedReportIds.length > 0
          ? `${result.report.statusLabel} 처리 완료 · 같은 대상의 다른 신고 ${result.alsoClosedReportIds.length}건도 함께 종결했습니다.`
          : `${result.report.statusLabel} 처리 완료`,
      );
      // 「대기」 필터면 처리한 건이 목록에서 빠진다 — 서버 데이터를 다시 읽는다
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <main>
      <div className={headStyle}>
        <h1 className={titleStyle}>신고 처리</h1>
        <Badge tone="brand">T4.2</Badge>
      </div>
      <p className={descStyle}>
        커뮤니티에 접수된 글·댓글 신고를 처리합니다. 블라인드하면 대상이 가려지고 같은 대상의 다른
        대기 신고도 함께 종결되며, 처리자와 시각이 기록됩니다.
      </p>

      <nav className={filterRowStyle}>
        {REPORT_FILTERS.map((filter) => {
          const active = filter.key === filterKey;
          const count = queue.ok
            ? filter.statuses.reduce((sum, status) => sum + (queue.counts[status] ?? 0), 0)
            : 0;
          return (
            <Link
              key={filter.key}
              href={`/reports?filter=${filter.key}`}
              className={`${filterStyle} ${active ? filterActiveStyle : ""}`}
              data-testid={`report-filter-${filter.key}`}
            >
              {filter.label} {count}
            </Link>
          );
        })}
      </nav>

      {error ? (
        <p className={errorStyle} role="alert" data-testid="report-queue-error">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className={noticeStyle} role="status" data-testid="report-queue-message">
          {message}
        </p>
      ) : null}

      <div className={layoutStyle}>
        <div className={listStyle} data-testid="report-queue-list">
          {items.length === 0 ? (
            <p className={emptyStyle}>이 필터에 해당하는 신고가 없습니다.</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${rowStyle} ${item.id === selectedId ? rowActiveStyle : ""}`}
                onClick={() => setSelectedId(item.id)}
                data-testid="report-queue-row"
                data-report-id={item.id}
              >
                <span className={rowTopStyle}>
                  <span className={rowNameStyle}>
                    {item.targetType === "POST" ? "글" : "댓글"} · {item.target?.postTitle ?? "(삭제됨)"}
                  </span>
                  <Badge tone={item.statusTone}>{item.statusLabel}</Badge>
                </span>
                <span className={rowMetaStyle}>
                  {item.reason} · {item.reporterName}({profileTypeLabel(item.reporterProfileType)})
                </span>
                <span className={rowMetaStyle}>
                  {formatMoment(item.createdAt)}
                  {item.openSiblingCount > 0 ? ` · 같은 대상 대기 ${item.openSiblingCount}건` : ""}
                </span>
              </button>
            ))
          )}
        </div>

        <Card padding="lg">
          {!selected ? (
            <p className={emptyStyle}>왼쪽에서 신고를 선택하세요.</p>
          ) : (
            <>
              <CardHeader
                title={selected.targetType === "POST" ? "신고된 글" : "신고된 댓글"}
                aside={<Badge tone={selected.statusTone}>{selected.statusLabel}</Badge>}
              />

              <div className={fieldGridStyle}>
                <div className={fieldStyle}>
                  <span className={fieldLabelStyle}>신고자</span>
                  <span className={fieldValueStyle}>
                    {selected.reporterName} ({profileTypeLabel(selected.reporterProfileType)})
                  </span>
                </div>
                <div className={fieldStyle}>
                  <span className={fieldLabelStyle}>접수 시각</span>
                  <span className={fieldValueStyle}>{formatMoment(selected.createdAt)}</span>
                </div>
                <div className={fieldStyle}>
                  <span className={fieldLabelStyle}>처리자</span>
                  <span className={fieldValueStyle} data-testid="report-handled-by">
                    {selected.handledByName ?? "-"}
                  </span>
                </div>
                <div className={fieldStyle}>
                  <span className={fieldLabelStyle}>처리 시각</span>
                  <span className={fieldValueStyle} data-testid="report-handled-at">
                    {selected.handledAt ? formatMoment(selected.handledAt) : "-"}
                  </span>
                </div>
              </div>

              <p className={reasonStyle} data-testid="report-reason">
                신고 사유 · {selected.reason}
              </p>

              {selected.target ? (
                <div className={previewStyle} data-testid="report-target-preview">
                  <span className={rowMetaStyle}>
                    {selected.target.regionName} · {selected.target.authorName}(
                    {profileTypeLabel(selected.target.authorProfileType)}) ·{" "}
                    {formatMoment(selected.target.createdAt)}
                    {selected.target.moderation === "BLINDED" ? " · 블라인드됨" : ""}
                  </span>
                  <strong className={rowNameStyle}>{selected.target.postTitle}</strong>
                  <p className={previewBodyStyle}>{selected.target.body}</p>
                </div>
              ) : (
                <p className={emptyStyle}>대상을 찾을 수 없습니다(이미 삭제됨).</p>
              )}

              <div className={actionRowStyle}>
                {selected.availableActions.length === 0 ? (
                  <p className={emptyStyle}>이미 처리된 신고입니다.</p>
                ) : (
                  selected.availableActions.map((action) => (
                    <Button
                      key={action.action}
                      variant={action.tone === "danger" ? "danger" : "secondary"}
                      loading={pending === action.action}
                      disabled={pending !== null}
                      onClick={() => void handleAction(action.action)}
                      data-testid={`report-action-${action.action}`}
                      title={action.description}
                    >
                      {action.label}
                    </Button>
                  ))
                )}
              </div>

              {selected.availableActions.length > 0 ? (
                <p className={actionHintStyle}>
                  {selected.availableActions.map((action) => `${action.label}: ${action.description}`).join(" / ")}
                </p>
              ) : null}
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
