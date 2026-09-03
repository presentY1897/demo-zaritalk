"use client";

/**
 * `/realtor/listings` 중개인 매물 화면 (T3.7) — **내가 맡은 매물 관리**.
 * T0.5 가 배정한 중개인 「매물」 탭 목적지의 플레이스홀더를 대체한다.
 *
 * 두 묶음이다:
 * 1. **내가 올린 매물** — `Listing.listedByProfileId = 내 프로필`
 * 2. **수락했지만 아직 안 올린 호실** — 여기서 바로 등록으로 넘어간다
 *
 * 등록·수정·상태 변경 화면은 새로 만들지 않았다 — T3.1 의 `/landlord/units/[id]/listing` 이
 * 이미 "소유 임대인 **또는 수락 중개인**" 을 받는다(`requireListingActorForUnit`).
 * 화면을 하나 더 만들면 상태 전이·409 규칙이 두 벌이 된다.
 */
import { Badge, Button, Card, CardHeader } from "@zari/ui";
import Link from "next/link";
import { css } from "styled-system/css";
import { formatBrokeragePlace } from "@/features/brokerage/status";
import type { RealtorListingsResult } from "@/features/brokerage/types";
import { formatManwon } from "@/features/landlord/format";
import { LISTING_STATUS_META } from "@/features/listing/status";

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
const sectionTitleStyle = css({ textStyle: "subtitle", color: "text", mb: "2" });
const listStyle = css({ display: "flex", flexDirection: "column", gap: "3" });
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
const rowStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "3",
  py: "2",
  textStyle: "body",
  color: "text",
});
const keyStyle = css({ color: "text.muted" });

export function RealtorListingsView({ data }: { data: RealtorListingsResult }) {
  return (
    <main className={pageStyle}>
      <header className={headerStyle}>
        <h1 className={titleStyle}>매물</h1>
        <p className={captionStyle}>
          수락한 중개 요청의 호실에 매물을 올리고 상태를 관리합니다.
        </p>
      </header>

      <section>
        <h2 className={sectionTitleStyle}>내가 올린 매물 {data.listings.length}</h2>
        {data.listings.length === 0 ? (
          <p className={emptyStyle} data-testid="realtor-listing-empty">
            아직 올린 매물이 없습니다.
          </p>
        ) : (
          <div className={listStyle}>
            {data.listings.map((listing) => (
              <Card
                key={listing.id}
                padding="md"
                data-testid="realtor-listing-card"
                data-listing-status={listing.status}
                data-unit-label={listing.place.unitLabel}
              >
                <CardHeader
                  title={formatBrokeragePlace(listing.place)}
                  aside={
                    <Badge tone={LISTING_STATUS_META[listing.status].tone}>
                      {LISTING_STATUS_META[listing.status].label}
                    </Badge>
                  }
                />
                <div className={rowStyle}>
                  <span className={keyStyle}>
                    {listing.dealType === "JEONSE" ? "전세" : "월세"}
                  </span>
                  <span>
                    보증금 {formatManwon(listing.deposit)}
                    {listing.monthlyRent > 0 ? ` / 월 ${formatManwon(listing.monthlyRent)}` : ""}
                  </span>
                </div>
                <p className={captionStyle}>{listing.place.buildingAddress}</p>
                <div className={css({ mt: "3" })}>
                  <Link href={`/landlord/units/${listing.place.unitId}/listing`}>
                    <Button fullWidth variant="secondary" data-testid="realtor-listing-manage">
                      매물 관리
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {data.pending.length > 0 ? (
        <section>
          <h2 className={sectionTitleStyle}>등록 대기 {data.pending.length}</h2>
          <div className={listStyle}>
            {data.pending.map((item) => (
              <Card
                key={item.targetId}
                padding="md"
                data-testid="realtor-listing-pending"
                data-unit-label={item.place.unitLabel}
              >
                <CardHeader
                  title={formatBrokeragePlace(item.place)}
                  aside={<Badge tone="success">수락</Badge>}
                />
                <p className={captionStyle}>
                  {item.place.buildingAddress} · 임대인 {item.landlord.name}
                </p>
                <div className={css({ mt: "3" })}>
                  <Link href={`/landlord/units/${item.place.unitId}/listing`}>
                    <Button fullWidth data-testid="realtor-listing-create">
                      매물 등록
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
