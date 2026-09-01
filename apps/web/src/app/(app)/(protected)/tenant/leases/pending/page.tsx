import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, CardHeader } from "@zari/ui";
import { css } from "styled-system/css";
import { findPendingLeasesForPhone } from "@/features/profiles/pending-lease";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "계약 수락 대기 — 자리 데모",
  description: "내 번호로 등록된 임대차 계약 수락 대기 목록",
};

const pageStyle = css({
  px: "gutter",
  py: "8",
  display: "flex",
  flexDirection: "column",
  gap: "section",
});
const titleStyle = css({ textStyle: "headline", color: "text" });
const leadStyle = css({ textStyle: "body", color: "text.muted" });
const listStyle = css({ display: "flex", flexDirection: "column", gap: "3" });
const rowStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "2",
  textStyle: "caption",
  color: "text.muted",
  py: "0.5",
});
const rowValueStyle = css({ color: "text", fontFamily: "numeric" });
const placeholderStyle = css({
  bg: "warning.subtle",
  border: "1px solid",
  borderColor: "warning.border",
  rounded: "card",
  p: "gutter",
  textStyle: "caption",
  color: "warning.text",
});
const linkStyle = css({ color: "text.brand", textDecoration: "underline" });

const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;
/** `@db.Date` 는 UTC 자정 Date 로 오므로 ISO 앞 10자를 그대로 쓴다(로컬 타임존 보정 금지) */
const day = (value: Date) => value.toISOString().slice(0, 10);

/**
 * `/tenant/leases/pending` — **T1.3(세입자 계약 수락) 플레이스홀더** (T0.4에서 임시 생성).
 *
 * 온보딩에서 세입자 프로필을 만들 때 내 번호로 `PENDING_TENANT` 계약이 있으면 이리로 보낸다.
 * 리다이렉트 판정(`features/profiles/pending-lease.ts`)과 대기 계약 조회는 진짜지만,
 * **수락 처리(계약-프로필 연결, `tenantAcceptedAt` 기록)는 T1.3에서 구현한다.**
 */
export default async function PendingLeasesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const leases = await findPendingLeasesForPhone(user.phone);

  return (
    <main className={pageStyle}>
      <header className={css({ display: "flex", flexDirection: "column", gap: "1.5" })}>
        <h1 className={titleStyle}>세입자 계약 수락</h1>
        <p className={leadStyle}>
          {leases.length > 0
            ? "임대인이 내 번호로 등록해 둔 계약입니다. 수락하면 수납 내역과 고지서가 연결됩니다."
            : "수락 대기 중인 계약이 없습니다."}
        </p>
      </header>

      <section className={listStyle}>
        {leases.map((lease) => (
          <Card key={lease.id}>
            <CardHeader
              title={`${lease.unit.building.name} ${lease.unit.label}`}
              aside={<Badge tone="warning">수락 대기</Badge>}
            />
            <p className={rowStyle}>
              <span>임대인 주소</span>
              <span className={css({ color: "text" })}>{lease.unit.building.address}</span>
            </p>
            <p className={rowStyle}>
              <span>보증금 / 월세</span>
              <span className={rowValueStyle}>
                {won(lease.deposit)} / {won(lease.monthlyRent)}
              </span>
            </p>
            <p className={rowStyle}>
              <span>관리비</span>
              <span className={rowValueStyle}>{won(lease.maintenanceFee)}</span>
            </p>
            <p className={rowStyle}>
              <span>계약 기간</span>
              <span className={rowValueStyle}>
                {day(lease.startDate)} ~ {day(lease.endDate)}
              </span>
            </p>
            <p className={rowStyle}>
              <span>납부일</span>
              <span className={rowValueStyle}>매월 {lease.paymentDay}일</span>
            </p>
          </Card>
        ))}
      </section>

      <p className={placeholderStyle} data-testid="t13-placeholder">
        수락 버튼과 계약 연결은 <strong>T1.3(세입자 계약 수락)</strong> 에서 구현합니다. 지금은
        전화번호 매칭으로 찾은 대기 계약만 보여 주는 플레이스홀더 화면입니다.
      </p>

      <Link className={linkStyle} href="/">
        홈으로 가기
      </Link>
    </main>
  );
}
