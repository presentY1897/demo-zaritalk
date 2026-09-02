"use client";

/**
 * `/tenant` 세입자 홈 (T1.3) — 세입자 탭바의 "홈"(경로는 T0.5 에서 확정).
 *
 * 내 계약 카드 · 이번 달 납부 상태 · 「자리페이로 결제」(T2.2) · 환급 배너 · 민원 진입.
 * 숫자는 전부 서버가 원장 엔진(T1.4)으로 계산해 준 `TenantHomeDto` 를 그대로 그린다 —
 * 화면에서 금액·상태를 다시 계산하지 않는다(임대인 수납 화면 T1.5 와 같은 숫자를 본다).
 *
 * ## Phase 2 가 채울 자리
 * | 자리 | 목적지 | 담당 task | 지금 |
 * |---|---|---|---|
 * | 「자리페이로 결제」 | `/tenant/pay/[chargeId]` | [T2.2](../../../../docs/tasks/t2.2-pay-ui.md) ✅ | 연결됨 (납부할 잔액이 있을 때만) |
 * | 납부 이력 | `/tenant/payments` | T2.2 ✅ | 화면은 있고 홈 진입점은 두지 않았다 |
 * | 환급 배너 | `/refund/calculator` | T2.3 ✅ | 연결됨 (배너 클릭 = 계산기) |
 * | 환급 신청 현황 | `/tenant/refund` | [T2.4](../../../../docs/tasks/t2.4-refund-apply.md) ✅ | 배너 아래 링크 + 세입자 탭바 「환급」 |
 * | 민원 접수 | `/tenant/complaints` | [T2.6](../../../../docs/tasks/t2.6-complaint.md) ✅ | 연결됨 |
 *
 * 목적지가 아직 없는 버튼은 **비활성 + "곧 제공"** 으로 둔다 — 눌러서 404 로 빠지지 않게.
 */
import { Badge, Button, buttonRecipe, Card, CardHeader, useTrack } from "@zari/ui";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { css } from "styled-system/css";
import { formatDate, formatKrw, formatManwon, leaseKindLabel } from "@/features/landlord/format";
import { CHARGE_STATUS_META, LEASE_STATUS_META } from "@/features/lease/status";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import type { ChargeDto, TenantHomeDto, TenantLeaseCardDto } from "./types";

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
const linesStyle = css({
  display: "flex",
  flexWrap: "wrap",
  columnGap: "3",
  rowGap: "0.5",
  mt: "2",
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
const rowStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "3",
  py: "1.5",
  textStyle: "caption",
  color: "text.muted",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  _last: { borderBottomWidth: "0" },
});
const rowValueStyle = css({ textStyle: "numeric", color: "text" });
const rowTextStyle = css({ textStyle: "label", color: "text" });
const sectionLabelStyle = css({
  mt: "4",
  mb: "2",
  textStyle: "label",
  color: "text.muted",
});
const historyRowStyle = css({
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
const historyMonthStyle = css({ textStyle: "label", color: "text" });
const historyAmountStyle = css({
  textStyle: "numeric",
  color: "text",
  ml: "auto",
  mr: "2",
});
const actionStyle = css({ mt: "4", display: "flex", flexDirection: "column", gap: "2" });
const soonStyle = css({
  textStyle: "caption",
  color: "text.muted",
  textAlign: "center",
});
const bannerLinkStyle = css({ textDecoration: "none", color: "inherit", display: "block" });
/** 환급 배너 아래 보조 링크 — 신청 현황(`/tenant/refund`, T2.4)으로 (T1.3 배너는 계산기로 간다) */
const refundStatusLinkStyle = css({
  textStyle: "caption",
  color: "text.brand",
  textDecoration: "underline",
  alignSelf: "flex-end",
});
const bannerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  p: "gutter",
  rounded: "card",
  bg: "primary.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "primary.border",
});
const bannerTitleStyle = css({ textStyle: "bodyStrong", color: "text" });
const bannerDescStyle = css({ textStyle: "caption", color: "text.muted", mt: "0.5" });

/** "월세 550,000 + 관리비 30,000" — 0원 줄은 뺀다(원장 엔진이 만든 4줄 중에서) */
function breakdownText(charge: ChargeDto): string {
  return charge.lines
    .filter((line) => line.amount > 0)
    .map((line) => `${line.label} ${line.amount.toLocaleString("ko-KR")}`)
    .join(" + ");
}

function CurrentCharge({ charge, monthLabel }: { charge: ChargeDto | null; monthLabel: string }) {
  if (!charge) {
    return (
      <p className={emptyStyle} data-testid="tenant-charge-empty">
        {monthLabel} 청구가 아직 없습니다.
      </p>
    );
  }

  const meta = CHARGE_STATUS_META[charge.status];
  const paidOff = charge.outstanding === 0;

  return (
    <div data-testid="tenant-current-charge" data-charge-status={charge.status}>
      <div className={css({ display: "flex", alignItems: "center", gap: "2", mb: "1" })}>
        <span className={captionStyle}>
          {charge.year}년 {charge.month}월분 · 기한 {formatDate(charge.dueDate)}
        </span>
        <Badge tone={meta.tone} data-testid="tenant-charge-status">
          {meta.label}
        </Badge>
      </div>
      <p
        className={charge.status === "OVERDUE" ? amountDangerStyle : amountStyle}
        data-testid="tenant-charge-amount"
      >
        {formatKrw(paidOff ? charge.totalDue : charge.outstanding)}
      </p>
      <p className={amountSubStyle}>
        {paidOff
          ? "이번 달 납부가 끝났습니다."
          : `청구 ${formatKrw(charge.totalDue)} 중 ${formatKrw(charge.paidAmount)} 납부${
              charge.overdueDays > 0 ? ` · 기한 ${charge.overdueDays}일 경과` : ""
            }`}
      </p>
      <p className={linesStyle}>
        {charge.lines
          .filter((line) => line.amount > 0)
          .map((line) => (
            <span key={line.key}>
              {line.label} {line.amount.toLocaleString("ko-KR")}
            </span>
          ))}
      </p>
    </div>
  );
}

function LeaseCard({ card, monthLabel }: { card: TenantLeaseCardDto; monthLabel: string }) {
  const { lease, currentCharge, charges } = card;
  const statusMeta = LEASE_STATUS_META[lease.status];
  const payable = currentCharge !== null && currentCharge.outstanding > 0;

  return (
    <Card padding="md" data-testid="tenant-lease-card">
      <CardHeader
        title={`${lease.unit.buildingName} ${lease.unit.label}`}
        aside={<Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>}
      />

      <p className={sectionLabelStyle}>{monthLabel} 납부</p>
      <CurrentCharge charge={currentCharge} monthLabel={monthLabel} />

      <div className={actionStyle}>
        {payable ? (
          <Link
            href={`/tenant/pay/${currentCharge.id}`}
            className={buttonRecipe({ variant: "primary", size: "md", fullWidth: true })}
            data-testid="tenant-pay-cta"
          >
            자리페이로 결제 · {formatKrw(currentCharge.outstanding)}
          </Link>
        ) : (
          <Button fullWidth disabled data-testid="tenant-pay-cta">
            자리페이로 결제
          </Button>
        )}
      </div>

      <p className={sectionLabelStyle}>계약 조건</p>
      <div className={rowStyle}>
        <span>임대인</span>
        <span className={rowTextStyle}>{lease.landlordName}</span>
      </div>
      <div className={rowStyle}>
        <span>주소</span>
        <span className={rowTextStyle}>{lease.unit.buildingAddress}</span>
      </div>
      <div className={rowStyle}>
        <span>보증금</span>
        <span className={rowValueStyle}>{formatManwon(lease.deposit)}</span>
      </div>
      <div className={rowStyle}>
        <span>{leaseKindLabel(lease.monthlyRent)}</span>
        <span className={rowValueStyle}>{formatKrw(lease.monthlyRent)}</span>
      </div>
      <div className={rowStyle}>
        <span>관리비</span>
        <span className={rowValueStyle}>{formatKrw(lease.maintenanceFee)}</span>
      </div>
      <div className={rowStyle}>
        <span>납부일</span>
        <span className={rowValueStyle}>매월 {lease.paymentDay}일</span>
      </div>
      <div className={rowStyle}>
        <span>계약 기간</span>
        <span className={rowValueStyle}>
          {formatDate(lease.startDate)} ~ {formatDate(lease.endDate)}
        </span>
      </div>

      {charges.length > 0 ? (
        <>
          <p className={sectionLabelStyle}>최근 청구</p>
          <div data-testid="tenant-charge-history">
            {charges.map((charge) => {
              const meta = CHARGE_STATUS_META[charge.status];
              return (
                <div
                  key={charge.id}
                  className={historyRowStyle}
                  data-testid="tenant-charge-row"
                  data-charge-month={`${charge.year}-${String(charge.month).padStart(2, "0")}`}
                >
                  <span className={historyMonthStyle}>
                    {charge.year}.{String(charge.month).padStart(2, "0")}
                  </span>
                  <span className={historyAmountStyle}>{formatKrw(charge.totalDue)}</span>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
              );
            })}
          </div>
          <p className={css({ mt: "2", textStyle: "caption", color: "text.muted" })}>
            {breakdownText(charges[0]!)}
          </p>
        </>
      ) : null}
    </Card>
  );
}

export function TenantHomeView({ home }: { home: TenantHomeDto }) {
  const { track } = useTrack();
  const viewed = useRef(false);

  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track(TRACK_EVENTS.TENANT_HOME_VIEW, {
      leaseCount: home.leases.length,
      pendingCount: home.pendingCount,
      outstanding: home.outstanding.amount,
    });
  }, [track, home.leases.length, home.pendingCount, home.outstanding.amount]);

  return (
    <main className={pageStyle}>
      <header className={headerStyle}>
        <h1 className={titleStyle}>홈</h1>
        <p className={captionStyle}>{formatDate(home.asOf)} 기준</p>
      </header>

      {/* 수락 대기 계약 — 아직 "내 계약" 이 아니라 배너로만 알린다 */}
      {home.pendingCount > 0 ? (
        <Link
          href="/tenant/leases/accept"
          className={bannerLinkStyle}
          data-testid="tenant-pending-banner"
        >
          <div className={bannerStyle}>
            <div>
              <p className={bannerTitleStyle}>수락 대기 계약 {home.pendingCount}건</p>
              <p className={bannerDescStyle}>조건을 확인하고 수락하면 내 계약으로 연결됩니다.</p>
            </div>
            <Badge tone="warning">확인</Badge>
          </div>
        </Link>
      ) : null}

      <div className={cardListStyle}>
        {home.leases.length === 0 ? (
          <Card padding="md" data-testid="tenant-no-lease">
            <CardHeader title="연결된 계약이 없습니다" />
            <p className={amountSubStyle}>
              임대인이 내 번호로 계약을 등록하면 여기에서 수락할 수 있습니다. 수락하면 매달 납부
              내역과 고지서가 이 화면에 모입니다.
            </p>
          </Card>
        ) : (
          home.leases.map((card) => (
            <LeaseCard key={card.lease.id} card={card} monthLabel={home.month.label} />
          ))
        )}

        {home.outstanding.count > 0 ? (
          <Card padding="md" data-testid="tenant-outstanding">
            <CardHeader
              title="밀린 금액"
              aside={<Badge tone="danger">{home.outstanding.count}건</Badge>}
            />
            <p className={amountDangerStyle} data-testid="tenant-outstanding-amount">
              {formatKrw(home.outstanding.amount)}
            </p>
            <p className={amountSubStyle}>완납되지 않은 청구의 남은 금액 합계입니다.</p>
          </Card>
        ) : null}

        {/*
          환급 — 배너는 **계산기**(비로그인도 쓰는 유입 경로, T2.3)로 보내고, 신청 현황은
          그 아래 링크와 탭바 「환급」(`/tenant/refund`, T2.4)으로 들어간다.
          배너 자체를 현황으로 돌리지 않은 이유: 아직 신청한 적 없는 세입자에게는 "얼마 받는지"가
          먼저다. 상태 화면의 빈 상태도 계산기로 한 번 더 안내한다.
        */}
        <Link
          href="/refund/calculator"
          className={bannerLinkStyle}
          data-testid="tenant-refund-banner"
        >
          <Card padding="md" interactive>
            <CardHeader title="월세 환급 받기" aside={<Badge tone="brand">계산하기</Badge>} />
            <p className={amountSubStyle}>
              연말정산 월세 세액공제를 최대 5년까지 소급해 받을 수 있습니다. 총급여와 월세를 넣으면
              연도별 예상 환급액이 바로 나옵니다.
            </p>
          </Card>
        </Link>

        <Link
          href="/tenant/refund"
          className={refundStatusLinkStyle}
          data-testid="tenant-refund-status-link"
        >
          이미 신청했나요? 신청 현황 보기 →
        </Link>

        <Card padding="md" data-testid="tenant-complaint-cta">
          <CardHeader title="집에 문제가 있나요?" />
          <p className={amountSubStyle}>
            누수·보일러 같은 문제를 임대인에게 접수하고 처리 상태를 볼 수 있습니다.
          </p>
          <div className={actionStyle}>
            <Link
              href="/tenant/complaints"
              className={buttonRecipe({ variant: "secondary", size: "md", fullWidth: true })}
              data-testid="tenant-complaint-link"
            >
              민원 접수하기
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
