"use client";

/**
 * `/landlord/units/[id]` 화면 본체 (T1.1) — 현재 계약 카드 · 과거 이력 · 수납 요약,
 * 공실이면 「매물 등록」(T3.1)·「중개 요청」(T3.6 `/landlord/brokerage?unitId=`) 진입 버튼.
 *
 * 계약 등록·상세(T1.2)·수납(T1.5)·매물 관리(T3.1 `/landlord/units/[id]/listing`)로 넘어가는
 * 진입점이 여기 있다.
 */
import { Badge, Button, Card, CardHeader, Sheet } from "@zari/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { css } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { LISTING_STATUS_META } from "@/features/listing/status";
import { UnitForm } from "./UnitForm";
import { formatArea, formatDate, formatKrw, formatManwon, leaseKindLabel } from "./format";
import { useDeleteUnit, useUnit, useUpdateUnit } from "./hooks";
import { UNIT_STATUS_META } from "./unit-status";
import type { LeaseSummaryDto, ListingStatusValue, UnitDetailDto } from "./types";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const backStyle = css({ textStyle: "caption", color: "text.brand", textDecoration: "none" });
const headRowStyle = css({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "3",
});
const titleRowStyle = css({ display: "flex", alignItems: "center", gap: "2" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const subStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });
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
const ctaRowStyle = css({ display: "flex", gap: "2" });
const historyItemStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "3",
  py: "2",
  textStyle: "caption",
  color: "text.muted",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  _last: { borderBottomWidth: "0" },
});
const hintStyle = css({ textStyle: "caption", color: "text.muted" });
const emptyStyle = css({ textStyle: "body", color: "text.muted" });

const LEASE_STATUS_LABEL: Record<LeaseSummaryDto["status"], string> = {
  ACTIVE: "계약중",
  PENDING_TENANT: "세입자 연결 대기",
  ENDED: "종료",
  CANCELLED: "취소",
};

/** 매물 상태 라벨·tone — 규칙 원본은 T3.1 의 `features/listing/status.ts` */
const LISTING_STATUS_LABEL: Record<ListingStatusValue, string> = {
  OPEN: LISTING_STATUS_META.OPEN.label,
  RESERVED: LISTING_STATUS_META.RESERVED.label,
  CLOSED: LISTING_STATUS_META.CLOSED.label,
};

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

export function UnitDetailView({ initialUnit }: { initialUnit: UnitDetailDto }) {
  const router = useRouter();
  const { data: unit = initialUnit } = useUnit(initialUnit.id, initialUnit);
  const updateUnit = useUpdateUnit(unit.id);
  const deleteUnit = useDeleteUnit(unit.id, unit.buildingId);
  const [sheetOpen, setSheetOpen] = useState(false);

  const meta = UNIT_STATUS_META[unit.status];
  const lease = unit.currentLease;
  const summary = unit.chargeSummary;

  function closeSheet() {
    setSheetOpen(false);
    updateUnit.reset();
    deleteUnit.reset();
  }

  return (
    <main className={pageStyle}>
      <Link href={`/landlord/buildings/${unit.buildingId}`} className={backStyle}>
        ← {unit.building.name}
      </Link>

      <div className={headRowStyle}>
        <div>
          <div className={titleRowStyle}>
            <h1 className={titleStyle}>{unit.label}</h1>
            <Badge tone={meta.tone} size="md" data-testid="unit-status-badge">
              {meta.label}
            </Badge>
          </div>
          <p className={subStyle}>
            {[
              unit.floor != null ? `${unit.floor}층` : null,
              unit.areaM2 != null ? formatArea(unit.areaM2) : null,
              unit.rooms != null ? `방 ${unit.rooms}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || unit.building.address}
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setSheetOpen(true)}
          data-testid="unit-edit"
        >
          호실 수정
        </Button>
      </div>

      {lease ? (
        <Card padding="md" data-testid="current-lease-card">
          <CardHeader
            title="현재 계약"
            aside={
              <Badge tone={lease.status === "ACTIVE" ? "success" : "warning"}>
                {LEASE_STATUS_LABEL[lease.status]}
              </Badge>
            }
          />
          <div className={rowStyle}>
            <span className={keyStyle}>세입자</span>
            <span className={valueStyle}>
              {lease.tenantName}
              {lease.tenantProfileId ? "" : " (미가입)"}
            </span>
          </div>
          <div className={rowStyle}>
            <span className={keyStyle}>{leaseKindLabel(lease.monthlyRent)}</span>
            <span className={numericStyle}>
              보증금 {formatManwon(lease.deposit)}
              {lease.monthlyRent > 0 ? ` / 월 ${formatManwon(lease.monthlyRent)}` : ""}
            </span>
          </div>
          {lease.maintenanceFee > 0 ? (
            <div className={rowStyle}>
              <span className={keyStyle}>관리비</span>
              <span className={numericStyle}>{formatManwon(lease.maintenanceFee)}</span>
            </div>
          ) : null}
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
          {/* 계약 상세·수납(T1.2·T1.5) 진입 */}
          <div className={css({ mt: "3" })}>
            <Button
              fullWidth
              variant="secondary"
              onClick={() => router.push(`/landlord/leases/${lease.id}`)}
              data-testid="lease-detail"
            >
              계약 상세·수납
            </Button>
          </div>
        </Card>
      ) : (
        <Card padding="md" data-testid="vacant-card">
          <CardHeader title="공실" aside={<Badge tone="neutral">계약 없음</Badge>} />
          <p className={emptyStyle}>
            매물로 올리거나 주변 중개인에게 중개를 요청해 세입자를 찾을 수 있습니다.
          </p>
          <div className={css({ mt: "3" })}>
            <div className={ctaRowStyle}>
              {/* 매물 등록·상태 관리는 T3.1 의 `/landlord/units/[id]/listing` */}
              <Button
                fullWidth
                onClick={() => router.push(`/landlord/units/${unit.id}/listing`)}
                data-testid="listing-create"
              >
                매물 등록
              </Button>
              {/* 중개 요청은 T3.6 의 `/landlord/brokerage`(T0.5 확정 경로).
                  `?unitId=` 를 달아 보내면 그 화면이 이 호실을 고른 채 요청 시트를 연다 */}
              <Button
                fullWidth
                variant="secondary"
                onClick={() => router.push(`/landlord/brokerage?unitId=${unit.id}`)}
                data-testid="brokerage-request"
              >
                중개 요청
              </Button>
            </div>
            <div className={css({ mt: "2" })}>
              <Button
                fullWidth
                variant="secondary"
                onClick={() => router.push(`/landlord/leases/new?unitId=${unit.id}`)}
                data-testid="lease-create"
              >
                계약 등록
              </Button>
            </div>
          </div>
        </Card>
      )}

      {summary ? (
        <Card padding="md" data-testid="charge-summary-card">
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
              {summary.totalCount}건{summary.latestMonth ? ` (최근 ${summary.latestMonth})` : ""}
            </span>
          </div>
          <div className={rowStyle}>
            <span className={keyStyle}>미납</span>
            <span className={numericStyle}>
              {summary.unpaidCount}건 · {formatKrw(summary.unpaidAmount)}
            </span>
          </div>
          {/* 금액 계산(이월·연체료)은 T1.4 월세 원장 엔진 소유다. 여기서는 저장된 값만 합산한다 */}
          <p className={hintStyle}>저장된 청구서 기준 합계입니다. 청구·수납 상세는 T1.5.</p>
        </Card>
      ) : null}

      {unit.listing ? (
        <Card padding="md" data-testid="listing-card">
          <CardHeader
            title="매물"
            aside={
              <Badge tone={LISTING_STATUS_META[unit.listing.status].tone}>
                {LISTING_STATUS_LABEL[unit.listing.status]}
              </Badge>
            }
          />
          <div className={rowStyle}>
            <span className={keyStyle}>
              {unit.listing.dealType === "JEONSE" ? "전세" : "월세"}
            </span>
            <span className={numericStyle}>
              보증금 {formatManwon(unit.listing.deposit)}
              {unit.listing.monthlyRent > 0 ? ` / 월 ${formatManwon(unit.listing.monthlyRent)}` : ""}
            </span>
          </div>
          <div className={css({ mt: "3" })}>
            <Button
              fullWidth
              variant="secondary"
              onClick={() => router.push(`/landlord/units/${unit.id}/listing`)}
              data-testid="listing-manage"
            >
              매물 관리
            </Button>
          </div>
        </Card>
      ) : null}

      <Card padding="md">
        <CardHeader title="지난 계약" />
        {unit.pastLeases.length === 0 ? (
          <p className={hintStyle}>지난 계약 이력이 없습니다.</p>
        ) : (
          unit.pastLeases.map((past) => (
            <div key={past.id} className={historyItemStyle} data-testid="past-lease">
              <span>
                {past.tenantName} · {LEASE_STATUS_LABEL[past.status]}
              </span>
              <span>
                {formatDate(past.startDate)} ~ {formatDate(past.endDate)}
              </span>
            </div>
          ))
        )}
      </Card>

      <Sheet open={sheetOpen} onClose={closeSheet} title={`${unit.label} 수정`}>
        <UnitForm
          mode="edit"
          defaultValue={unit}
          pending={updateUnit.isPending}
          deletePending={deleteUnit.isPending}
          errorMessage={errorMessage(updateUnit.error ?? deleteUnit.error)}
          onSubmit={async (input) => {
            try {
              await updateUnit.mutateAsync(input);
              closeSheet();
              router.refresh();
            } catch {
              /* 실패 문구는 폼에 표시된다 */
            }
          }}
          onDelete={async () => {
            try {
              await deleteUnit.mutateAsync();
              router.replace(`/landlord/buildings/${unit.buildingId}`);
              router.refresh();
            } catch {
              /* 계약이 걸려 있으면 409 — 문구를 폼에 표시한다 */
            }
          }}
        />
      </Sheet>
    </main>
  );
}
