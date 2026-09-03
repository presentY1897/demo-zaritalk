import type { Metadata } from "next";
import { siteUrlObject, siteUrl as resolveSiteUrl } from "@/lib/seo";
import { ProfileType } from "@zari/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Badge, Card } from "@zari/ui";
import { css } from "styled-system/css";
import { readUnitCommutes } from "@/features/listing/commute";
import { listingDescription, listingJsonLd, listingTitle, serializeJsonLd } from "@/features/listing/jsonld";
import {
  ListingCommuteButton,
  ListingDetailTracker,
  ListingInquiryButton,
} from "@/features/listing/ListingDetailClient";
import {
  DEAL_TYPE_LABEL,
  formatArea,
  formatAvailableFrom,
  formatFloor,
  formatMoneyKo,
  formatRooms,
} from "@/features/listing/price";
import { getPublicListing, listingAddress } from "@/features/listing/public";
import { LISTING_STATUS_META } from "@/features/listing/status";
import { KakaoMap } from "@/features/search/KakaoMap";
import { currentUser } from "@/features/shell/session";
import { listWorkplaces } from "@/features/workplace/queries";

/**
 * `/listings/[id]` — **비로그인 공개** 매물 상세 (T3.3).
 *
 * ## 왜 `(app)` 바로 아래인가
 *
 * 로그인 강제는 `(app)/(protected)/layout.tsx` 한 곳이 한다(T0.5). 그 그룹 **밖**에 두면
 * 480px 셸은 그대로 쓰면서 로그인은 걸리지 않는다 — 공개 고지서(T1.8)·환급 계산기(T2.3)·
 * `/search`(T3.2)와 같은 자리다.
 *
 * ## 서버 렌더인 이유
 *
 * 이 화면은 **검색 유입과 링크 공유의 착지점**이다. 크롤러와 카카오톡 미리보기 봇은 JS 를
 * 돌리지 않으므로 조건·주소·사진이 HTML 안에 이미 있어야 한다. 그래서 본체는 서버 컴포넌트이고
 * 상호작용 세 조각만 클라이언트다(`features/listing/ListingDetailClient.tsx`).
 *
 * ## robots — 공개 중(OPEN)만 색인한다
 *
 * | 상태 | robots | 이유 |
 * |---|---|---|
 * | `OPEN` | `index, follow` | 개인정보가 없고(등록자 이름조차 담지 않는다) 검색 유입이 목적인 페이지다 |
 * | `RESERVED`·`CLOSED` | `noindex, follow` | 더 이상 구할 수 없는 매물이다. 색인에 남으면 검색 결과가 거짓말이 된다 |
 *
 * 공개 고지서(T1.8)가 통째로 `noindex` 인 것과 다르다 — 그쪽은 이름·호실·금액이 든
 * 개인 문서이고, 이쪽은 광고다. 환급 계산기(T2.3)와 같은 편에 선다.
 * **404 로 감추지 않는 이유**는 `features/listing/public.ts` 주석 참고(이미 공유된 링크가
 * 갑자기 404 가 되면 안 되고, 소프트 404 가 쌓인다).
 *
 * ## JSON-LD
 *
 * 타입 선택 근거와 전세·월세를 금액으로 옮기는 규칙은 `features/listing/jsonld.ts` 주석에 있다.
 */

const SITE_NAME = "자리 데모";
// 사이트 URL 도출은 `lib/seo` 한 곳에서만 한다(T6.4)
const siteUrl = resolveSiteUrl();
const metadataBase = siteUrlObject();

/** metadata 와 페이지가 같은 요청에서 DB 를 두 번 읽지 않게 한다(T1.8 과 같은 방식) */
const getListing = cache((id: string) => getPublicListing(id));

type PageProps = {
  // Next 16 — `params` 는 Promise 다
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListing(id);

  if (!listing) {
    return {
      title: `매물을 찾을 수 없습니다 · ${SITE_NAME}`,
      robots: { index: false, follow: false },
    };
  }

  const title = listingTitle(listing);
  const description = listingDescription(listing);
  const canonical = `/listings/${listing.id}`;
  const open = listing.status === "OPEN";

  return {
    metadataBase,
    title: `${title} · ${SITE_NAME}`,
    description,
    alternates: { canonical },
    // 공개 중인 매물만 색인한다 — 예약·종료 매물이 검색에 남으면 안 된다
    robots: { index: open, follow: true },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "ko_KR",
      url: canonical,
      title,
      description,
      ...(listing.photos.length > 0 ? { images: [listing.photos[0] as string] } : {}),
    },
    twitter: {
      card: listing.photos.length > 0 ? "summary_large_image" : "summary",
      title,
      description,
    },
  };
}

/* ------------------------------------------------------------------ */
/* 스타일 — 색은 전부 semantic 토큰(T0.6)                              */
/* ------------------------------------------------------------------ */

const pageStyle = css({ pb: "section" });
const galleryStyle = css({
  display: "flex",
  gap: "1",
  overflowX: "auto",
  scrollSnapType: "x mandatory",
  bg: "bg.subtle",
  scrollbarWidth: "none",
});
const photoStyle = css({
  w: "full",
  flexShrink: 0,
  aspectRatio: "4 / 3",
  objectFit: "cover",
  scrollSnapAlign: "center",
});
const photoEmptyStyle = css({
  w: "full",
  aspectRatio: "16 / 9",
  bg: "bg.subtle",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textStyle: "caption",
  color: "text.muted",
});
const bodyStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const backStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  textStyle: "caption",
  color: "text.brand",
  textDecoration: "none",
});
const badgeRowStyle = css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap", mt: "2" });
const priceStyle = css({ textStyle: "headline", color: "text", fontFamily: "numeric", mt: "1" });
const subtitleStyle = css({ textStyle: "body", color: "text.muted", mt: "1" });
const bannerStyle = css({
  px: "3",
  py: "2.5",
  rounded: "field",
  bg: "warning.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "warning.border",
  textStyle: "caption",
  color: "warning.text",
});
const sectionTitleStyle = css({ textStyle: "subtitle", color: "text", mb: "2" });
const rowStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "2",
  py: "1.5",
  textStyle: "body",
  color: "text.muted",
});
const rowValueStyle = css({ color: "text", fontFamily: "numeric" });
const descriptionStyle = css({
  textStyle: "body",
  color: "text",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});
const mapCardStyle = css({ rounded: "card", overflow: "hidden", borderWidth: "hairline", borderStyle: "solid", borderColor: "border" });
const mapCaptionStyle = css({ textStyle: "caption", color: "text.muted", mt: "2" });
const actionsStyle = css({ display: "flex", flexDirection: "column", gap: "2" });
const footerStyle = css({ textStyle: "caption", color: "text.muted", textAlign: "center" });

/* ------------------------------------------------------------------ */

export default async function ListingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) notFound();

  const user = await currentUser();
  const tenantProfile = user?.profiles.find((profile) => profile.type === ProfileType.TENANT);
  const workplaces = tenantProfile ? await listWorkplaces(tenantProfile.id) : [];
  const commutes = await readUnitCommutes(
    listing.unitId,
    workplaces.map((workplace) => ({ id: workplace.id, label: workplace.label })),
  );

  const status = LISTING_STATUS_META[listing.status];
  const title = listingTitle(listing);
  const address = listingAddress(listing);
  const specs = [
    formatRooms(listing.unit.rooms),
    formatArea(listing.unit.areaM2),
    formatFloor(listing.unit.floor),
  ].filter((spec): spec is string => Boolean(spec));

  const jsonLd = listingJsonLd({ listing, siteUrl });

  return (
    <main className={pageStyle} data-testid="listing-detail" data-listing-id={listing.id}>
      {/* 구조화 데이터 — 크롤러가 읽는다. 직렬화는 `<`·`>`·`&` 를 이스케이프한다(jsonld.ts) */}
      <script
        type="application/ld+json"
        data-testid="listing-jsonld"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <ListingDetailTracker
        listingId={listing.id}
        status={listing.status}
        dealType={listing.dealType}
        loggedIn={Boolean(user)}
      />

      {listing.photos.length > 0 ? (
        <div className={galleryStyle} data-testid="listing-photos">
          {listing.photos.map((photo, index) => (
            /* 외부 URL 사진이라 `next/image` 를 쓰지 않는다(도메인을 알 수 없어
               `images.remotePatterns` 를 적을 수 없고 `next.config.ts` 는 이 task 소유가 아니다) */
            <img
              key={photo}
              className={photoStyle}
              src={photo}
              alt={`${title} 사진 ${index + 1}`}
              loading={index === 0 ? "eager" : "lazy"}
            />
          ))}
        </div>
      ) : (
        <div className={photoEmptyStyle} aria-hidden>
          등록된 사진이 없습니다
        </div>
      )}

      <div className={bodyStyle}>
        <div>
          <Link href="/search" className={backStyle}>
            ← 매물 찾기로
          </Link>
          <div className={badgeRowStyle}>
            <Badge tone={listing.dealType === "JEONSE" ? "brand" : "info"}>
              {DEAL_TYPE_LABEL[listing.dealType]}
            </Badge>
            <Badge tone={status.tone} data-testid="listing-detail-status">
              {status.label}
            </Badge>
            <Badge tone="neutral">
              {listing.listedBy.role === "REALTOR" ? "중개인 등록" : "임대인 직접"}
            </Badge>
          </div>
          <h1 className={priceStyle} data-testid="listing-detail-price">
            {listing.priceLabel}
          </h1>
          <p className={subtitleStyle} data-testid="listing-detail-title">
            {listing.building.name} {listing.unit.label}
            {specs.length > 0 ? ` · ${specs.join(" · ")}` : ""}
          </p>
        </div>

        {listing.status === "OPEN" ? null : (
          <p className={bannerStyle} role="status" data-testid="listing-detail-banner">
            {listing.status === "RESERVED"
              ? "예약된 매물입니다. 계약이 진행 중이라 문의가 어려울 수 있습니다."
              : "종료된 매물입니다. 더 이상 구할 수 없어 검색에는 노출되지 않습니다."}
          </p>
        )}

        <Card padding="md" aria-labelledby="listing-terms">
          <h2 className={sectionTitleStyle} id="listing-terms">
            거래 조건
          </h2>
          <p className={rowStyle}>
            <span>거래유형</span>
            <span className={rowValueStyle}>{DEAL_TYPE_LABEL[listing.dealType]}</span>
          </p>
          <p className={rowStyle}>
            <span>보증금</span>
            <span className={rowValueStyle}>{formatMoneyKo(listing.deposit)}</span>
          </p>
          {listing.dealType === "WOLSE" ? (
            <p className={rowStyle}>
              <span>월세</span>
              <span className={rowValueStyle}>{formatMoneyKo(listing.monthlyRent)}</span>
            </p>
          ) : null}
          <p className={rowStyle}>
            <span>입주</span>
            <span className={rowValueStyle}>{formatAvailableFrom(listing.availableFrom)}</span>
          </p>
        </Card>

        <Card padding="md" aria-labelledby="listing-unit">
          <h2 className={sectionTitleStyle} id="listing-unit">
            호실 정보
          </h2>
          <p className={rowStyle}>
            <span>건물 · 호실</span>
            <span className={rowValueStyle}>
              {listing.building.name} {listing.unit.label}
            </span>
          </p>
          <p className={rowStyle}>
            <span>층</span>
            <span className={rowValueStyle}>{formatFloor(listing.unit.floor) ?? "정보 없음"}</span>
          </p>
          <p className={rowStyle}>
            <span>전용면적</span>
            <span className={rowValueStyle}>{formatArea(listing.unit.areaM2) ?? "정보 없음"}</span>
          </p>
          <p className={rowStyle}>
            <span>방 구조</span>
            <span className={rowValueStyle}>{formatRooms(listing.unit.rooms) ?? "정보 없음"}</span>
          </p>
        </Card>

        {listing.description ? (
          <Card padding="md" aria-labelledby="listing-description">
            <h2 className={sectionTitleStyle} id="listing-description">
              상세 설명
            </h2>
            <p className={descriptionStyle} data-testid="listing-detail-description">
              {listing.description}
            </p>
          </Card>
        ) : null}

        <section aria-labelledby="listing-location">
          <h2 className={sectionTitleStyle} id="listing-location">
            위치
          </h2>
          <div className={mapCardStyle}>
            <KakaoMap
              center={{ lat: listing.building.lat, lng: listing.building.lng }}
              level={4}
              height="220px"
              zoomable={false}
              markers={[
                {
                  id: listing.id,
                  lat: listing.building.lat,
                  lng: listing.building.lng,
                  label: listing.pinLabel,
                  active: true,
                },
              ]}
              testId="listing-map"
            />
          </div>
          <p className={mapCaptionStyle} data-testid="listing-detail-address">
            {address}
          </p>
        </section>

        <div className={actionsStyle}>
          <ListingCommuteButton
            listingId={listing.id}
            unitId={listing.unitId}
            loggedIn={Boolean(user)}
            workplaces={workplaces}
            commutes={commutes}
          />
          <ListingInquiryButton
            listingId={listing.id}
            dealType={listing.dealType}
            role={listing.listedBy.role}
            priceLabel={listing.priceLabel}
            title={title}
          />
        </div>

        <p className={footerStyle}>
          자리 데모의 예시 매물입니다. 실제 거래·중개와는 무관합니다.
        </p>
      </div>
    </main>
  );
}
