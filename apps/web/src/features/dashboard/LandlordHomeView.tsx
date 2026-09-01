"use client";

/**
 * `/landlord` 임대인 홈 대시보드 본체 (T1.9) — 데모에서 가장 먼저 보이는 화면.
 *
 * 숫자는 전부 서버가 만든 `LandlordSummaryDto` 를 그대로 그린다(화면에서 다시 계산하지 않는다).
 * 첫 데이터는 서버 컴포넌트가 `initialData` 로 넘겨주고, 이후 수납·계약이 바뀌면
 * `dashboardKeys.landlordSummary` 무효화로 다시 읽힌다.
 *
 * ## 화면이 구분해 보여 주는 두 가지 "연체"
 * | 카드 문구 | 뜻 | 출처 |
 * |---|---|---|
 * | **연체 n건** (danger 배지) | 기한이 지났는데 **한 푼도 안 낸** 청구 | 실효 상태 `OVERDUE` |
 * | **부분납 포함 미납 n건** (카드 하단 각주) | 기한이 지나고 잔액이 남은 청구 **전부** | `isDelinquent()` |
 *
 * ## 카드 → 화면 이동
 * | 카드 | 목적지 | 담당 task |
 * |---|---|---|
 * | 이번 달 수납 현황 | `/landlord/ledger` | T1.6 (작업 중 — 머지 전에는 404) |
 * | 연체 청구 행 | `/landlord/leases/[id]` | T1.2 (작업 중 — 머지 전에는 404) |
 * | 만기 임박 계약 행 | `/landlord/leases/[id]` | T1.2 |
 * | 자산 | `/landlord/buildings` | T1.1 ✅ 동작 |
 * | 미확인 민원·견적 | `/landlord/complaints/[id]` · `/landlord/workorders/[id]` | T2.6 · T5.3 |
 */
import { Badge, Card, CardHeader, useTrack, type BadgeTone } from "@zari/ui";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { css } from "styled-system/css";
import { formatDate, formatKrw } from "@/features/landlord/format";
import { UNIT_STATUS_META, UNIT_STATUS_ORDER } from "@/features/landlord/unit-status";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { useLandlordSummary } from "./hooks";
import type { ChargeStatus, LandlordSummaryDto, OverdueChargeDto } from "./types";

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
const cardListStyle = css({ display: "flex", flexDirection: "column", gap: "gutter" });
const amountStyle = css({ textStyle: "display", fontFamily: "numeric", color: "text" });
const amountDangerStyle = css({ textStyle: "display", fontFamily: "numeric", color: "danger.text" });
const amountSubStyle = css({ textStyle: "body", color: "text.muted", mt: "1" });
const badgeRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "1.5", mt: "3" });
const rowsStyle = css({ display: "flex", flexDirection: "column", gap: "2", mt: "3" });
const rowLinkStyle = css({ textDecoration: "none", color: "inherit", display: "block" });
const rowStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  p: "3",
  rounded: "field",
  bg: "bg.subtle",
  _hover: { bg: "neutral.subtle" },
});
const rowHeadStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "2",
});
const rowTitleStyle = css({ textStyle: "bodyStrong", color: "text" });
const rowAmountStyle = css({ textStyle: "bodyStrong", fontFamily: "numeric", color: "danger.text" });
const rowMetaStyle = css({ textStyle: "caption", color: "text.muted" });
const linesStyle = css({
  display: "flex",
  flexWrap: "wrap",
  columnGap: "3",
  rowGap: "0.5",
  mt: "1",
  textStyle: "caption",
  color: "text.muted",
  fontFamily: "numeric",
});
const emptyStyle = css({
  p: "5",
  mt: "2",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "dashed",
  borderColor: "border",
  textAlign: "center",
  textStyle: "body",
  color: "text.muted",
});
const footNoteStyle = css({
  mt: "3",
  pt: "3",
  borderTopWidth: "hairline",
  borderColor: "border",
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "2",
  textStyle: "caption",
  color: "text.muted",
});
const footNoteValueStyle = css({ fontFamily: "numeric", color: "text" });
const moreLinkStyle = css({
  display: "inline-block",
  mt: "3",
  textStyle: "label",
  color: "text.brand",
  textDecoration: "underline",
});
const trackStyle = css({
  mt: "3",
  h: "2",
  w: "full",
  rounded: "pill",
  bg: "bg.subtle",
  overflow: "hidden",
});
const barStyle = css({ h: "full", rounded: "pill", bg: "primary" });
const statRowStyle = css({
  display: "flex",
  gap: "2",
  mt: "3",
});
const statStyle = css({ flex: "1", minW: "0" });
const statLabelStyle = css({ textStyle: "caption", color: "text.muted" });
const statValueStyle = css({
  textStyle: "bodyStrong",
  fontFamily: "numeric",
  color: "text",
  whiteSpace: "nowrap",
  mt: "0.5",
});

/** 청구 상태 → 배지 라벨·색 (T0.6 semantic 토큰. 하드코딩 색상 없음) */
const CHARGE_STATUS_META: Record<ChargeStatus, { label: string; tone: BadgeTone }> = {
  PAID: { label: "완납", tone: "success" },
  PARTIALLY_PAID: { label: "부분납", tone: "warning" },
  OVERDUE: { label: "연체", tone: "danger" },
  SCHEDULED: { label: "예정", tone: "neutral" },
};
const CHARGE_STATUS_ORDER: ChargeStatus[] = ["PAID", "PARTIALLY_PAID", "OVERDUE", "SCHEDULED"];

/** 만기가 가까울수록 강한 색 — 30일 이내는 경고 */
function expiryTone(daysLeft: number): BadgeTone {
  return daysLeft <= 30 ? "warning" : "info";
}

function OverdueRow({
  item,
  onSelect,
}: {
  item: OverdueChargeDto;
  onSelect: (item: OverdueChargeDto) => void;
}) {
  return (
    <Link
      href={`/landlord/leases/${item.leaseId}`}
      className={rowLinkStyle}
      data-testid="home-overdue-item"
      onClick={() => onSelect(item)}
    >
      <div className={rowStyle}>
        <div className={rowHeadStyle}>
          <span className={rowTitleStyle}>
            {item.buildingName} {item.unitLabel}
          </span>
          <span className={rowAmountStyle}>{formatKrw(item.outstanding)}</span>
        </div>
        <p className={rowMetaStyle}>
          {item.tenantName} · {item.year}년 {item.month}월분 · 기한 {formatDate(item.dueDate)} (
          {item.overdueDays}일 경과)
        </p>
        <p className={linesStyle}>
          {item.lines
            .filter((line) => line.amount > 0)
            .map((line) => (
              <span key={line.key}>
                {line.label} {line.amount.toLocaleString("ko-KR")}
              </span>
            ))}
        </p>
      </div>
    </Link>
  );
}

export function LandlordHomeView({ initialSummary }: { initialSummary: LandlordSummaryDto }) {
  const { data: summary = initialSummary } = useLandlordSummary(initialSummary);
  const { track } = useTrack();
  const viewed = useRef(false);

  const { collection, overdue, delinquent, expiring, portfolio, inbox } = summary;

  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track(TRACK_EVENTS.LANDLORD_HOME_VIEW, {
      overdueCount: overdue.count,
      expiringCount: expiring.count,
      inboxCount: inbox.total,
    });
  }, [track, overdue.count, expiring.count, inbox.total]);

  return (
    <main className={pageStyle}>
      <header className={headerStyle}>
        <h1 className={titleStyle}>홈</h1>
        <p className={captionStyle}>{formatDate(summary.asOf)} 기준</p>
      </header>

      <div className={cardListStyle}>
        {/* 미확인 민원·견적 — 0 이면 배지를 숨긴다(카드째 사라진다).
            T2.6·T5.3 데이터가 들어오면 그대로 채워진다. */}
        {inbox.total > 0 && (
          <Card padding="md" data-testid="home-inbox">
            <CardHeader
              title="확인할 일"
              aside={<Badge tone="brand" solid>{inbox.total}</Badge>}
            />
            <div className={badgeRowStyle}>
              {inbox.complaintCount > 0 && (
                <Link
                  href={
                    inbox.latestComplaintId
                      ? `/landlord/complaints/${inbox.latestComplaintId}`
                      : "/landlord"
                  }
                  className={rowLinkStyle}
                >
                  <Badge tone="warning" size="md" data-testid="home-inbox-complaint">
                    새 민원 {inbox.complaintCount}건
                  </Badge>
                </Link>
              )}
              {inbox.quoteCount > 0 && (
                <Link
                  href={
                    inbox.latestQuoteWorkOrderId
                      ? `/landlord/workorders/${inbox.latestQuoteWorkOrderId}`
                      : "/landlord"
                  }
                  className={rowLinkStyle}
                >
                  <Badge tone="info" size="md" data-testid="home-inbox-quote">
                    새 견적 {inbox.quoteCount}건
                  </Badge>
                </Link>
              )}
            </div>
          </Card>
        )}

        {/* ① 이번 달 수납 현황 */}
        <Card padding="md" data-testid="home-collection">
          <CardHeader
            title={`${summary.month.label} 수납`}
            aside={
              <Badge tone={collection.collectedPct >= 100 ? "success" : "neutral"}>
                {collection.collectedPct}%
              </Badge>
            }
          />
          <p className={amountStyle} data-testid="home-collection-paid">
            {formatKrw(collection.paidAmount)}
          </p>
          <p className={amountSubStyle}>
            청구 <strong data-testid="home-collection-billed">{formatKrw(collection.billedAmount)}</strong>{" "}
            중 수납
          </p>
          <div
            className={trackStyle}
            role="progressbar"
            aria-label={`${summary.month.label} 수납률`}
            aria-valuenow={collection.collectedPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className={barStyle} style={{ width: `${collection.collectedPct}%` }} />
          </div>
          <div className={statRowStyle}>
            <div className={statStyle}>
              <p className={statLabelStyle}>청구</p>
              <p className={statValueStyle}>{collection.chargeCount}건</p>
            </div>
            <div className={statStyle}>
              <p className={statLabelStyle}>완납</p>
              <p className={statValueStyle}>{collection.paidCount}건</p>
            </div>
            <div className={statStyle}>
              <p className={statLabelStyle}>미수금</p>
              <p className={statValueStyle}>{formatKrw(collection.outstandingAmount)}</p>
            </div>
          </div>
          {collection.chargeCount === 0 ? (
            <p className={emptyStyle}>{summary.month.label}에 발행된 청구가 없습니다.</p>
          ) : (
            <div className={badgeRowStyle}>
              {CHARGE_STATUS_ORDER.filter((status) => collection.statusCounts[status] > 0).map(
                (status) => (
                  <Badge key={status} tone={CHARGE_STATUS_META[status].tone}>
                    {CHARGE_STATUS_META[status].label} {collection.statusCounts[status]}
                  </Badge>
                ),
              )}
            </div>
          )}
          <Link href="/landlord/ledger" className={moreLinkStyle}>
            임대장부에서 월별로 보기
          </Link>
        </Card>

        {/* ② 연체 — 실효 상태 OVERDUE(한 푼도 안 낸 청구)만 센다 */}
        <Card padding="md" data-testid="home-overdue">
          <CardHeader
            title="연체"
            aside={
              <Badge
                tone={overdue.count > 0 ? "danger" : "success"}
                solid={overdue.count > 0}
                data-testid="home-overdue-count"
              >
                {overdue.count}건
              </Badge>
            }
          />
          {overdue.count === 0 ? (
            <p className={emptyStyle}>연체 중인 청구가 없습니다.</p>
          ) : (
            <>
              <p className={amountDangerStyle} data-testid="home-overdue-amount">
                {formatKrw(overdue.amount)}
              </p>
              <p className={amountSubStyle}>기한이 지났는데 한 푼도 안 낸 청구입니다.</p>
              <div className={rowsStyle}>
                {overdue.items.map((item) => (
                  <OverdueRow
                    key={item.chargeId}
                    item={item}
                    onSelect={(selected) =>
                      track(TRACK_EVENTS.LANDLORD_OVERDUE_CLICK, {
                        leaseId: selected.leaseId,
                        chargeId: selected.chargeId,
                        outstanding: selected.outstanding,
                      })
                    }
                  />
                ))}
              </div>
            </>
          )}
          {/* 같은 화면에서 라벨로 구분한다 — 위는 OVERDUE, 아래는 isDelinquent(부분납 포함) */}
          <div className={footNoteStyle} data-testid="home-delinquent">
            <span>부분납 포함 미납</span>
            <span className={footNoteValueStyle}>
              {delinquent.count}건 · {formatKrw(delinquent.amount)}
            </span>
          </div>
        </Card>

        {/* ③ 만기 임박(3개월 이내) */}
        <Card padding="md" data-testid="home-expiring">
          <CardHeader
            title={`만기 ${expiring.withinDays}일 이내`}
            aside={
              <Badge
                tone={expiring.count > 0 ? "warning" : "neutral"}
                data-testid="home-expiring-count"
              >
                {expiring.count}건
              </Badge>
            }
          />
          {expiring.count === 0 ? (
            <p className={emptyStyle}>
              {expiring.withinDays}일 안에 만기되는 계약이 없습니다.
            </p>
          ) : (
            <div className={rowsStyle}>
              {expiring.items.map((item) => (
                <Link
                  key={item.leaseId}
                  href={`/landlord/leases/${item.leaseId}`}
                  className={rowLinkStyle}
                  data-testid="home-expiring-item"
                  onClick={() =>
                    track(TRACK_EVENTS.LANDLORD_EXPIRY_CLICK, {
                      leaseId: item.leaseId,
                      daysLeft: item.daysLeft,
                    })
                  }
                >
                  <div className={rowStyle}>
                    <div className={rowHeadStyle}>
                      <span className={rowTitleStyle}>
                        {item.buildingName} {item.unitLabel}
                      </span>
                      <Badge tone={expiryTone(item.daysLeft)}>
                        {item.daysLeft === 0 ? "오늘 만기" : `${item.daysLeft}일 남음`}
                      </Badge>
                    </div>
                    <p className={rowMetaStyle}>
                      {item.tenantName} · 만기 {formatDate(item.endDate)} · 월세{" "}
                      {item.monthlyRent.toLocaleString("ko-KR")}원
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* ④ 자산 요약 — 자산 탭(T1.1)으로 */}
        <Link href="/landlord/buildings" className={rowLinkStyle} data-testid="home-portfolio">
          <Card padding="md" interactive>
            <CardHeader
              title="자산"
              aside={<Badge tone="info">건물 {portfolio.buildingCount}</Badge>}
            />
            <p className={amountSubStyle}>
              호실 {portfolio.unitCount} · 공실 {portfolio.statusCounts.VACANT}
            </p>
            {portfolio.unitCount === 0 ? (
              <p className={emptyStyle}>등록한 건물이 없습니다. 자산 탭에서 첫 건물을 등록해 주세요.</p>
            ) : (
              <div className={badgeRowStyle}>
                {UNIT_STATUS_ORDER.filter((status) => portfolio.statusCounts[status] > 0).map(
                  (status) => (
                    <Badge key={status} tone={UNIT_STATUS_META[status].tone}>
                      {UNIT_STATUS_META[status].label} {portfolio.statusCounts[status]}
                    </Badge>
                  ),
                )}
              </div>
            )}
          </Card>
        </Link>
      </div>
    </main>
  );
}
