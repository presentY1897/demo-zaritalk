"use client";

/**
 * `/refunds` 환급 심사 큐 화면 (T2.5) — 데스크톱 2단(목록 + 상세).
 *
 * **규칙을 하나도 들고 있지 않다.** 버튼은 응답의 `availableActions` 를 그대로 그리고,
 * 코멘트 필수 여부도 그 안의 `requiresNote` 를 읽는다 — 상태 전이표는 web 한 곳에만 있다
 * (`apps/web/src/features/refund/status.ts`). 서버가 막을 것을 화면이 미리 비활성으로 보여 줄 뿐,
 * 최종 판정은 언제나 API 가 한다.
 *
 * 색은 전부 semantic 토큰이다(하드코딩 색상 0, T0.6).
 */
import { Badge, Button, Card, CardHeader } from "@zari/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { css } from "styled-system/css";
import { runRefundReview } from "./actions";
import {
  adminDocumentHref,
  formatKrw,
  REFUND_FILTERS,
  type AdminRefundItem,
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
const filterActiveStyle = css({
  borderColor: "primary.border",
  bg: "primary.subtle",
  color: "text",
});
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
const rowTopStyle = css({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2" });
const rowNameStyle = css({ textStyle: "bodyStrong", color: "text" });
const rowMetaStyle = css({ textStyle: "caption", color: "text.muted", fontFamily: "numeric" });
const detailGridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "2",
  mt: "2",
});
const fieldStyle = css({ display: "flex", flexDirection: "column", gap: "0.5" });
const fieldLabelStyle = css({ textStyle: "caption", color: "text.muted" });
const fieldValueStyle = css({ textStyle: "body", color: "text", fontFamily: "numeric" });
const tableRowStyle = css({
  display: "grid",
  gridTemplateColumns: "80px 1fr 1fr 1fr",
  gap: "2",
  py: "2",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  textStyle: "caption",
  color: "text",
  fontFamily: "numeric",
  _last: { borderBottomWidth: "0" },
});
const tableHeadStyle = css({ color: "text.muted" });
const docRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  py: "2",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  _last: { borderBottomWidth: "0" },
});
const docLinkStyle = css({
  textStyle: "body",
  color: "text.brand",
  textDecoration: "underline",
  wordBreak: "break-all",
});
const docMetaStyle = css({ textStyle: "caption", color: "text.muted", fontFamily: "numeric" });
const textareaStyle = css({
  w: "full",
  minH: "96px",
  p: "3",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  color: "text",
  textStyle: "body",
});
const actionRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "2", mt: "3" });
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
  whiteSpace: "pre-wrap",
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
const noteBoxStyle = css({
  mt: "2",
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
const emptyStyle = css({ textStyle: "body", color: "text.muted" });

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  return iso.slice(0, 16).replace("T", " ");
}

export function RefundReviewView({
  filterKey,
  queue,
}: {
  filterKey: string;
  queue: QueueResult;
}) {
  const router = useRouter();
  const [items, setItems] = useState<AdminRefundItem[]>(queue.ok ? queue.applications : []);
  const [selectedId, setSelectedId] = useState<string | null>(
    queue.ok ? (queue.applications[0]?.id ?? null) : null,
  );
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(queue.ok ? null : queue.message);

  const selected = items.find((item) => item.id === selectedId) ?? null;

  async function handleAction(action: string, requiresNote: boolean) {
    if (!selected) return;
    if (requiresNote && note.trim() === "") {
      setError("이 액션에는 심사 코멘트가 필요합니다.");
      return;
    }
    setError(null);
    setMessage(null);
    setPending(action);
    try {
      const result = await runRefundReview({
        applicationId: selected.id,
        action,
        note: note.trim() ? note.trim() : undefined,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setItems((prev) =>
        prev.map((item) => (item.id === result.application.id ? result.application : item)),
      );
      setNote("");
      setMessage(
        `${result.application.statusLabel} 처리 완료 · 알림톡 시뮬 발송(${result.notification.toPhone})`,
      );
      // 필터가 「처리 대기」면 상태가 바뀌며 목록에서 빠질 수 있다 — 서버 데이터를 다시 읽는다
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <main>
      <div className={headStyle}>
        <h1 className={titleStyle}>환급 심사</h1>
        <Badge tone="brand">T2.5</Badge>
      </div>
      <p className={descStyle}>
        세입자가 낸 월세 세액공제 신청을 심사합니다. 액션마다 상태·심사자·시각이 기록되고 세입자에게
        알림톡(시뮬)이 발송됩니다.
      </p>

      <nav className={filterRowStyle}>
        {REFUND_FILTERS.map((filter) => {
          const active = filter.key === filterKey;
          const count = queue.ok
            ? filter.statuses.reduce((sum, status) => sum + (queue.counts[status] ?? 0), 0)
            : 0;
          return (
            <Link
              key={filter.key}
              href={`/refunds?filter=${filter.key}`}
              className={`${filterStyle} ${active ? filterActiveStyle : ""}`}
              data-testid={`refund-filter-${filter.key}`}
            >
              {filter.label} {count}
            </Link>
          );
        })}
      </nav>

      {error ? (
        <p className={errorStyle} role="alert" data-testid="refund-review-error">
          {error}
        </p>
      ) : null}

      <div className={layoutStyle}>
        <div className={listStyle} data-testid="refund-review-list">
          {items.length === 0 ? (
            <Card padding="lg">
              <p className={emptyStyle}>이 상태의 신청이 없습니다.</p>
            </Card>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${rowStyle} ${item.id === selectedId ? rowActiveStyle : ""}`}
                data-testid={`refund-review-row-${item.id}`}
                onClick={() => {
                  setSelectedId(item.id);
                  setNote("");
                  setMessage(null);
                  setError(null);
                }}
              >
                <span className={rowTopStyle}>
                  <span className={rowNameStyle}>{item.tenantName}</span>
                  <Badge tone={item.statusTone}>{item.statusLabel}</Badge>
                </span>
                <span className={rowMetaStyle}>
                  {formatKrw(item.expectedAmount)} · {item.startYear}~{item.endYear}년분
                </span>
                <span className={rowMetaStyle}>
                  제출 {formatDateTime(item.submittedAt)} · 서류 {item.documents.length}건
                </span>
              </button>
            ))
          )}
        </div>

        {selected ? (
          <div data-testid="refund-review-detail">
            <Card padding="lg">
              <CardHeader
                title={`${selected.tenantName} · ${formatKrw(selected.expectedAmount)}`}
                aside={<Badge tone={selected.statusTone}>{selected.statusLabel}</Badge>}
              />
              <div className={detailGridStyle}>
                <div className={fieldStyle}>
                  <span className={fieldLabelStyle}>연락처</span>
                  <span className={fieldValueStyle}>{selected.tenantPhone}</span>
                </div>
                <div className={fieldStyle}>
                  <span className={fieldLabelStyle}>연 총급여</span>
                  <span className={fieldValueStyle}>{formatKrw(selected.annualIncome)}</span>
                </div>
                <div className={fieldStyle}>
                  <span className={fieldLabelStyle}>월세</span>
                  <span className={fieldValueStyle}>{formatKrw(selected.monthlyRent)}</span>
                </div>
                <div className={fieldStyle}>
                  <span className={fieldLabelStyle}>임차 기간</span>
                  <span className={fieldValueStyle}>
                    {selected.startDate} ~ {selected.endDate}
                  </span>
                </div>
                <div className={fieldStyle}>
                  <span className={fieldLabelStyle}>연결 계약</span>
                  <span className={fieldValueStyle}>
                    {selected.lease
                      ? `${selected.lease.buildingName} ${selected.lease.unitLabel}`
                      : "직접 입력"}
                  </span>
                </div>
                <div className={fieldStyle}>
                  <span className={fieldLabelStyle}>기준일</span>
                  <span className={fieldValueStyle}>{selected.asOf}</span>
                </div>
                <div className={fieldStyle}>
                  <span className={fieldLabelStyle}>제출</span>
                  <span className={fieldValueStyle}>{formatDateTime(selected.submittedAt)}</span>
                </div>
                <div className={fieldStyle}>
                  <span className={fieldLabelStyle}>최근 결정</span>
                  <span className={fieldValueStyle}>
                    {formatDateTime(selected.decidedAt)}
                    {selected.reviewedByName ? ` · ${selected.reviewedByName}` : ""}
                  </span>
                </div>
              </div>

              {selected.reviewNote ? (
                <p className={noteBoxStyle} data-testid="refund-review-last-note">
                  마지막 심사 코멘트: {selected.reviewNote}
                </p>
              ) : null}
            </Card>

            <Card padding="lg" className={css({ mt: "4" })}>
              <CardHeader title="산출 내역" />
              <div className={`${tableRowStyle} ${tableHeadStyle}`}>
                <span>연도</span>
                <span>개월</span>
                <span>지급 월세</span>
                <span>공제액</span>
              </div>
              {selected.calc.years.map((year) => (
                <div key={year.year} className={tableRowStyle} data-testid={`refund-calc-${year.year}`}>
                  <span>{year.year}</span>
                  <span>{year.months}개월</span>
                  <span>{formatKrw(year.paidRent)}</span>
                  <span>{formatKrw(year.creditAmount)}</span>
                </div>
              ))}
              <div className={tableRowStyle}>
                <span>합계</span>
                <span>{selected.calc.totals.months}개월</span>
                <span>{formatKrw(selected.calc.totals.paidRent)}</span>
                <span data-testid="refund-calc-total">
                  {formatKrw(selected.calc.totals.creditAmount)}
                </span>
              </div>
            </Card>

            <Card padding="lg" className={css({ mt: "4" })}>
              <CardHeader
                title="서류"
                aside={<Badge tone="neutral">{selected.documents.length}건</Badge>}
              />
              {selected.documents.length === 0 ? (
                <p className={emptyStyle}>올라온 서류가 없습니다.</p>
              ) : (
                selected.documents.map((doc) => (
                  <div key={doc.id} className={docRowStyle}>
                    <a
                      className={docLinkStyle}
                      href={adminDocumentHref(selected.id, doc.id)}
                      target="_blank"
                      rel="noreferrer"
                      data-testid={`refund-doc-${doc.id}`}
                    >
                      {doc.slotLabel} · {doc.name}
                    </a>
                    <span className={docMetaStyle}>
                      {Math.max(1, Math.round(doc.size / 1024))}KB ·{" "}
                      {doc.stage === "SUPPLEMENT" ? "보완" : "최초"} ·{" "}
                      {formatDateTime(doc.uploadedAt)}
                    </span>
                  </div>
                ))
              )}
            </Card>

            <Card padding="lg" className={css({ mt: "4" })}>
              <CardHeader title="심사 액션" />
              <label className={fieldLabelStyle} htmlFor="refund-review-note">
                심사 코멘트 (보완요청·반려는 필수)
              </label>
              <textarea
                id="refund-review-note"
                className={textareaStyle}
                data-testid="refund-review-note"
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
                placeholder="예) 주민등록등본에 전입일이 보이지 않습니다. 다시 올려 주세요."
              />
              <div className={actionRowStyle}>
                {selected.availableActions.length === 0 ? (
                  <p className={emptyStyle}>종결된 신청이라 더 할 수 있는 액션이 없습니다.</p>
                ) : (
                  selected.availableActions.map((action) => (
                    <Button
                      key={action.action}
                      type="button"
                      variant={action.action === "REJECT" ? "danger" : "primary"}
                      loading={pending === action.action}
                      data-testid={`refund-action-${action.action}`}
                      onClick={() => void handleAction(action.action, action.requiresNote)}
                    >
                      {action.label}
                    </Button>
                  ))
                )}
              </div>
              {message ? (
                <p className={noticeStyle} data-testid="refund-review-message">
                  {message}
                </p>
              ) : null}
            </Card>
          </div>
        ) : (
          <Card padding="lg">
            <p className={emptyStyle}>왼쪽 목록에서 신청을 고르면 상세가 열립니다.</p>
          </Card>
        )}
      </div>
    </main>
  );
}
