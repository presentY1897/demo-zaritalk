"use client";

/**
 * `/tenant/leases/accept` — 대기 계약 목록 → 조건 확인 → 수락/거절 (T1.3).
 *
 * 임대인이 내 번호로 등록해 둔 `PENDING_TENANT` 계약을 보여 준다. 수락하면 계약이 내 계정에
 * 연결되고(`tenantProfileId`·`tenantAcceptedAt`) `ACTIVE` 로 넘어가며 세입자 홈으로 이동한다.
 * **거절은 되돌릴 수 없어** 확인 시트를 한 번 거친다.
 *
 * 조건은 서버가 만든 DTO 를 그대로 그린다 — 금액·기간을 화면에서 다시 계산하지 않는다.
 */
import { Badge, Button, Card, CardHeader, Sheet, useTrack } from "@zari/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { css } from "styled-system/css";
import { formatDate, formatKrw, formatManwon, leaseKindLabel } from "@/features/landlord/format";
import { formatPhone } from "@/lib/phone";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { useAcceptLease, useDeclineLease, usePendingLeases } from "./hooks";
import type { PendingLeaseDto } from "./types";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const headerStyle = css({ display: "flex", flexDirection: "column", gap: "1" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const leadStyle = css({ textStyle: "body", color: "text.muted" });
const listStyle = css({ display: "flex", flexDirection: "column", gap: "gutter" });
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
const actionsStyle = css({ display: "flex", gap: "2", mt: "4" });
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
const emptyStyle = css({
  p: "6",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "dashed",
  borderColor: "border",
  textAlign: "center",
  textStyle: "body",
  color: "text.muted",
});
const noticeStyle = css({
  p: "gutter",
  rounded: "card",
  bg: "info.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "info.border",
  textStyle: "caption",
  color: "info.text",
});
const linkStyle = css({ textStyle: "label", color: "text.brand", textDecoration: "underline" });
const sheetTextStyle = css({ textStyle: "body", color: "text" });
const sheetListStyle = css({
  mt: "3",
  pl: "4",
  display: "flex",
  flexDirection: "column",
  gap: "1",
  textStyle: "caption",
  color: "text.muted",
  listStyleType: "disc",
});

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={rowStyle}>
      <span>{label}</span>
      {children}
    </div>
  );
}

export type PendingLeaseAcceptViewProps = { initialLeases: PendingLeaseDto[] };

export function PendingLeaseAcceptView({ initialLeases }: PendingLeaseAcceptViewProps) {
  const router = useRouter();
  const { track } = useTrack();
  const { data: leases = initialLeases } = usePendingLeases(initialLeases);
  const accept = useAcceptLease();
  const decline = useDeclineLease();
  const [declining, setDeclining] = useState<PendingLeaseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const viewed = useRef(false);

  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track(TRACK_EVENTS.TENANT_LEASE_ACCEPT_VIEW, { pendingCount: initialLeases.length });
  }, [track, initialLeases.length]);

  const busy = accept.isPending || decline.isPending;

  async function onAccept(lease: PendingLeaseDto) {
    setError(null);
    try {
      const result = await accept.mutateAsync(lease.id);
      track(TRACK_EVENTS.TENANT_LEASE_ACCEPT_COMPLETE, {
        leaseId: lease.id,
        chargeCreated: Boolean(result.charge),
      });
      router.replace("/tenant");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "수락하지 못했습니다.");
    }
  }

  async function onDecline(lease: PendingLeaseDto) {
    setError(null);
    try {
      const result = await decline.mutateAsync(lease.id);
      track(TRACK_EVENTS.TENANT_LEASE_DECLINE_COMPLETE, {
        leaseId: lease.id,
        removedCharges: result.settlement.removedCharges,
      });
      setDeclining(null);
      router.refresh();
    } catch (cause) {
      setDeclining(null);
      setError(cause instanceof Error ? cause.message : "거절하지 못했습니다.");
    }
  }

  return (
    <main className={pageStyle}>
      <header className={headerStyle}>
        <h1 className={titleStyle}>세입자 계약 수락</h1>
        <p className={leadStyle}>
          {leases.length > 0
            ? "임대인이 내 번호로 등록해 둔 계약입니다. 조건을 확인하고 수락하면 수납 내역과 고지서가 연결됩니다."
            : "수락 대기 중인 계약이 없습니다."}
        </p>
      </header>

      {error ? (
        <p className={errorStyle} role="alert" data-testid="accept-error">
          {error}
        </p>
      ) : null}

      {leases.length === 0 ? (
        <>
          <p className={emptyStyle} data-testid="pending-empty">
            임대인이 계약을 등록하면 여기에서 확인할 수 있습니다.
          </p>
          <Link className={linkStyle} href="/tenant">
            세입자 홈으로 가기
          </Link>
        </>
      ) : (
        <section className={listStyle}>
          {leases.map((lease) => (
            <Card key={lease.id} padding="md" data-testid="pending-lease">
              <CardHeader
                title={`${lease.unit.buildingName} ${lease.unit.label}`}
                aside={<Badge tone="warning">수락 대기</Badge>}
              />
              <Row label="주소">
                <span className={rowTextStyle}>{lease.unit.buildingAddress}</span>
              </Row>
              <Row label="임대인">
                <span className={rowTextStyle}>{lease.landlordName}</span>
              </Row>
              <Row label="계약자">
                <span className={rowTextStyle}>
                  {lease.tenantName} · {formatPhone(lease.tenantPhone)}
                </span>
              </Row>
              <Row label="보증금">
                <span className={rowValueStyle}>{formatManwon(lease.deposit)}</span>
              </Row>
              <Row label={leaseKindLabel(lease.monthlyRent)}>
                <span className={rowValueStyle} data-testid="pending-monthly-rent">
                  {formatKrw(lease.monthlyRent)}
                </span>
              </Row>
              <Row label="관리비">
                <span className={rowValueStyle}>{formatKrw(lease.maintenanceFee)}</span>
              </Row>
              <Row label="납부일">
                <span className={rowValueStyle}>매월 {lease.paymentDay}일</span>
              </Row>
              <Row label="계약 기간">
                <span className={rowValueStyle}>
                  {formatDate(lease.startDate)} ~ {formatDate(lease.endDate)}
                </span>
              </Row>
              <Row label="연체이율">
                <span className={rowValueStyle}>
                  {lease.lateFeeRatePct === null ? "없음" : `월 ${lease.lateFeeRatePct}%`}
                </span>
              </Row>

              <div className={actionsStyle}>
                <Button
                  variant="secondary"
                  onClick={() => setDeclining(lease)}
                  disabled={busy}
                  data-testid="pending-decline"
                >
                  거절
                </Button>
                <Button
                  fullWidth
                  loading={accept.isPending}
                  disabled={busy}
                  onClick={() => void onAccept(lease)}
                  data-testid="pending-accept"
                >
                  이 조건으로 수락
                </Button>
              </div>
            </Card>
          ))}
        </section>
      )}

      <p className={noticeStyle}>
        조건이 다르면 수락하지 말고 임대인에게 수정을 요청하세요. 수락해야 이번 달 납부 내역과
        고지서가 내 계정에 연결됩니다.
      </p>

      <Sheet
        open={declining !== null}
        onClose={() => setDeclining(null)}
        title="계약을 거절할까요?"
        description={
          declining ? `${declining.unit.buildingName} ${declining.unit.label}` : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeclining(null)} disabled={decline.isPending}>
              닫기
            </Button>
            <Button
              variant="danger"
              fullWidth
              loading={decline.isPending}
              onClick={() => declining && void onDecline(declining)}
              data-testid="decline-confirm"
            >
              거절하기
            </Button>
          </>
        }
      >
        <p className={sheetTextStyle}>거절하면 이 계약은 취소되고 목록에서 사라집니다.</p>
        <ul className={sheetListStyle}>
          <li>임대인 화면에는 「취소」로 표시되고 호실은 공실로 돌아갑니다.</li>
          <li>조건을 고쳐 다시 등록해 달라고 임대인에게 요청할 수 있습니다.</li>
          <li>되돌릴 수 없습니다.</li>
        </ul>
      </Sheet>
    </main>
  );
}
