"use client";

/**
 * `/landlord/leases/[id]` 화면 본체 (T1.2 + T1.5).
 *
 * 두 task 가 이 한 화면을 나눠 갖는다:
 * - **계약 탭**(T1.2) — 조건 요약 · 세입자 연결 상태 · 종료 처리
 * - **수납 탭**(T1.5) — 월별 청구 리스트 → 행을 누르면 청구 상세 시트
 *
 * 청구 금액·상태는 서버가 원장 엔진으로 만들어 준 값을 그대로 그린다(직접 계산 없음).
 */
import { Badge, Button, Card, CardHeader, Sheet, useTrack } from "@zari/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { css, cx } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { formatDate, formatKrw, formatManwon, leaseKindLabel } from "@/features/landlord/format";
import { formatPhone } from "@/lib/phone";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { NoticeSendSheet } from "@/features/notice/NoticeSendSheet";
import { ChargeList } from "./ChargeList";
import { ChargeSheet } from "./ChargeSheet";
import { useCharges, useLease, useUpdateLease } from "./hooks";
import { LEASE_STATUS_META } from "./status";
import type { ChargeDto, LeaseDetailDto } from "./types";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const backStyle = css({ textStyle: "caption", color: "text.brand", textDecoration: "none" });
const titleRowStyle = css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const subStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });
const tabsStyle = css({
  display: "flex",
  gap: "1",
  p: "1",
  rounded: "pill",
  bg: "bg.subtle",
});
const tabStyle = css({
  flex: "1",
  minH: "tap",
  px: "3",
  rounded: "pill",
  border: "none",
  bg: "transparent",
  color: "text.muted",
  textStyle: "label",
  cursor: "pointer",
  _focusVisible: { outline: "2px solid", outlineColor: "border.focus", outlineOffset: "2px" },
});
const tabActiveStyle = css({ bg: "bg.card", color: "text", boxShadow: "card" });
const rowStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "3",
  py: "2",
  textStyle: "body",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  _last: { borderBottomWidth: "0" },
});
const keyStyle = css({ color: "text.muted" });
const valueStyle = css({ color: "text" });
const numericStyle = css({ textStyle: "numeric", color: "text" });
const hintStyle = css({ textStyle: "caption", color: "text.muted" });
const sectionStyle = css({ display: "flex", flexDirection: "column", gap: "3" });
const sectionHeadStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
});
const sectionTitleStyle = css({ textStyle: "subtitle", color: "text" });
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
const endBodyStyle = css({ display: "flex", flexDirection: "column", gap: "3" });

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

export type LeaseDetailViewProps = {
  initialLease: LeaseDetailDto;
  initialCharges: ChargeDto[];
  /** 처음에 열 탭 — 수납 탭으로 바로 들어오고 싶을 때 */
  initialTab?: "terms" | "charges";
};

export function LeaseDetailView({
  initialLease,
  initialCharges,
  initialTab = "terms",
}: LeaseDetailViewProps) {
  const router = useRouter();
  const { track } = useTrack();
  const { data: lease = initialLease } = useLease(initialLease.id, initialLease);
  const { data: charges = initialCharges } = useCharges(initialLease.id, initialCharges);
  const updateLease = useUpdateLease(initialLease.id);

  const [tab, setTab] = useState<"terms" | "charges">(initialTab);
  const [selectedChargeId, setSelectedChargeId] = useState<string | null>(null);
  const [endSheetOpen, setEndSheetOpen] = useState(false);
  // 고지서 발송(T1.7). chargeId 가 있으면 그 청구를, 없으면 시트가 미납 최신 청구를 고른다.
  const [noticeChargeId, setNoticeChargeId] = useState<string | null | undefined>(undefined);

  const meta = LEASE_STATUS_META[lease.status];
  const summary = lease.chargeSummary;
  const selectedCharge = charges.find((charge) => charge.id === selectedChargeId) ?? null;
  const canEnd = lease.status === "ACTIVE" || lease.status === "PENDING_TENANT";

  return (
    <main className={pageStyle}>
      <Link href={`/landlord/units/${lease.unitId}`} className={backStyle}>
        ← {lease.unit.buildingName} {lease.unit.label}
      </Link>

      <div>
        <div className={titleRowStyle}>
          <h1 className={titleStyle}>
            {lease.unit.buildingName} {lease.unit.label}
          </h1>
          <Badge tone={meta.tone} size="md" data-testid="lease-status-badge">
            {meta.label}
          </Badge>
        </div>
        <p className={subStyle}>
          {lease.tenantName} · {formatDate(lease.startDate)} ~ {formatDate(lease.endDate)}
        </p>
      </div>

      <div className={tabsStyle} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "terms"}
          className={cx(tabStyle, tab === "terms" ? tabActiveStyle : undefined)}
          onClick={() => setTab("terms")}
          data-testid="lease-tab-terms"
        >
          계약 조건
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "charges"}
          className={cx(tabStyle, tab === "charges" ? tabActiveStyle : undefined)}
          onClick={() => setTab("charges")}
          data-testid="lease-tab-charges"
        >
          수납 {summary.totalCount > 0 ? `(${summary.totalCount})` : ""}
        </button>
      </div>

      {tab === "terms" ? (
        <>
          <Card padding="md" data-testid="lease-terms-card">
            <CardHeader title="계약 조건" />
            <div className={rowStyle}>
              <span className={keyStyle}>{leaseKindLabel(lease.monthlyRent)}</span>
              <span className={numericStyle}>
                보증금 {formatManwon(lease.deposit)}
                {lease.monthlyRent > 0 ? ` / 월 ${formatManwon(lease.monthlyRent)}` : ""}
              </span>
            </div>
            <div className={rowStyle}>
              <span className={keyStyle}>관리비</span>
              <span className={numericStyle}>{formatKrw(lease.maintenanceFee)}</span>
            </div>
            <div className={rowStyle}>
              <span className={keyStyle}>납부일</span>
              <span className={valueStyle}>매월 {lease.paymentDay}일</span>
            </div>
            <div className={rowStyle}>
              <span className={keyStyle}>계약 기간</span>
              <span className={valueStyle}>
                {formatDate(lease.startDate)} ~ {formatDate(lease.endDate)}
              </span>
            </div>
            <div className={rowStyle}>
              <span className={keyStyle}>연체이율</span>
              <span className={valueStyle}>
                {lease.lateFeeRatePct != null ? `월 ${lease.lateFeeRatePct}%` : "없음"}
              </span>
            </div>
          </Card>

          <Card padding="md" data-testid="lease-tenant-card">
            <CardHeader
              title="세입자"
              aside={
                <Badge tone={lease.tenantProfileId ? "success" : "warning"}>
                  {lease.tenantProfileId ? "연결됨" : "연결 대기"}
                </Badge>
              }
            />
            <div className={rowStyle}>
              <span className={keyStyle}>이름</span>
              <span className={valueStyle}>{lease.tenantName}</span>
            </div>
            <div className={rowStyle}>
              <span className={keyStyle}>연락처</span>
              <span className={numericStyle}>{formatPhone(lease.tenantPhone)}</span>
            </div>
            <p className={hintStyle}>
              {lease.tenantProfileId
                ? "세입자가 계약을 수락해 앱에서 청구를 확인할 수 있습니다."
                : "세입자가 이 번호로 가입하면 계약을 수락할 수 있습니다."}
            </p>
          </Card>

          <Card padding="md" data-testid="lease-summary-card">
            <CardHeader
              title="수납 요약"
              aside={
                summary.overdueCount > 0 ? (
                  <Badge tone="danger">연체 {summary.overdueCount}</Badge>
                ) : (
                  <Badge tone="success">연체 없음</Badge>
                )
              }
            />
            <div className={rowStyle}>
              <span className={keyStyle}>청구</span>
              <span className={valueStyle}>
                {summary.totalCount}건
                {summary.latestMonth ? ` (최근 ${summary.latestMonth})` : ""}
              </span>
            </div>
            <div className={rowStyle}>
              <span className={keyStyle}>미납</span>
              <span className={numericStyle}>
                {summary.unpaidCount}건 · {formatKrw(summary.unpaidAmount)}
              </span>
            </div>
          </Card>

          {canEnd ? (
            <Card padding="md">
              <CardHeader title="계약 종료" />
              <p className={hintStyle}>
                종료하면 오늘 이후로 예정된 청구는 사라지고, 이미 발생한 미납은 정산 대상으로
                남습니다.
              </p>
              <div className={css({ mt: "3" })}>
                <Button
                  variant="danger"
                  fullWidth
                  onClick={() => setEndSheetOpen(true)}
                  data-testid="lease-end-open"
                >
                  계약 종료
                </Button>
              </div>
            </Card>
          ) : null}
        </>
      ) : (
        <section className={sectionStyle}>
          <div className={sectionHeadStyle}>
            <h2 className={sectionTitleStyle}>월별 청구</h2>
            <Button
              variant="secondary"
              size="sm"
              data-testid="lease-notice-send"
              onClick={() => setNoticeChargeId(null)}
            >
              고지서 발송
            </Button>
          </div>
          <ChargeList
            charges={charges}
            onSelect={(charge) => {
              setSelectedChargeId(charge.id);
              track(TRACK_EVENTS.CHARGE_SHEET_OPEN, {
                month: `${charge.year}-${String(charge.month).padStart(2, "0")}`,
                status: charge.status,
              });
            }}
          />
          <p className={hintStyle}>
            청구 총액 = 월세 + 관리비 + 전월 이월 + 연체료. 미납은 다음 달로 이월됩니다.
          </p>
        </section>
      )}

      <ChargeSheet
        scope={{ leaseId: lease.id, unitId: lease.unitId, buildingId: lease.unit.buildingId }}
        charge={selectedCharge}
        open={selectedCharge !== null}
        onClose={() => setSelectedChargeId(null)}
        onSendNotice={(chargeId) => setNoticeChargeId(chargeId)}
      />

      <NoticeSendSheet
        open={noticeChargeId !== undefined}
        onClose={() => setNoticeChargeId(undefined)}
        leaseId={lease.id}
        {...(noticeChargeId ? { defaultChargeId: noticeChargeId } : {})}
      />

      <Sheet
        open={endSheetOpen}
        onClose={() => {
          setEndSheetOpen(false);
          updateLease.reset();
        }}
        title="계약을 종료할까요?"
        description="종료일은 오늘로 기록됩니다."
      >
        <div className={endBodyStyle}>
          <p className={hintStyle}>
            오늘 이후로 예정된 청구(납부 기록이 없는 것)는 삭제되고, 이미 발생한 미납 청구는
            그대로 남습니다. 남은 미납은 보증금 정산에서 다룹니다.
          </p>
          {summary.unpaidCount > 0 ? (
            <p className={hintStyle} data-testid="lease-end-unpaid">
              현재 미납 {summary.unpaidCount}건 · {formatKrw(summary.unpaidAmount)}
            </p>
          ) : null}
          {updateLease.error ? (
            <p className={errorBoxStyle} role="alert">
              {errorMessage(updateLease.error)}
            </p>
          ) : null}
          <Button
            variant="danger"
            fullWidth
            size="lg"
            loading={updateLease.isPending}
            disabled={updateLease.isPending}
            onClick={async () => {
              try {
                const result = await updateLease.mutateAsync({ status: "ENDED" });
                track(TRACK_EVENTS.LEASE_END_COMPLETE, {
                  leaseId: lease.id,
                  removedCharges: result.settlement?.removedScheduledCharges ?? 0,
                  remainingUnpaid: result.settlement?.remainingUnpaidCount ?? 0,
                });
                setEndSheetOpen(false);
                router.refresh();
              } catch {
                /* 실패 문구는 시트 안에 표시된다 */
              }
            }}
            data-testid="lease-end-confirm"
          >
            종료하기
          </Button>
        </div>
      </Sheet>
    </main>
  );
}
