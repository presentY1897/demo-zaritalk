/**
 * 매물 상세 구조화 데이터 (T3.3) — schema.org JSON-LD.
 *
 * ## 왜 `RealEstateListing` 인가
 *
 * schema.org 가 **부동산 매물 페이지를 위해 만든 타입**이다("A RealEstateListing is a listing
 * that describes one or more real-estate Offers"). `WebPage` 의 하위 타입이라 "이 **페이지**가
 * 매물 광고다" 를 말하고, 실제 거래 조건은 `mainEntity` 로 매단 `Offer` 가 말한다.
 *
 * 후보로 놓고 버린 것들:
 *
 * | 후보 | 버린 이유 |
 * |---|---|
 * | `Product` + `Offer` | 임대차는 물건 판매가 아니다. `Product` 를 쓰면 보증금이 "판매가" 로 읽힌다 |
 * | `Apartment` 단독 | `Accommodation`(→`Place`) 에는 `offers` 속성이 없다. 금액을 붙일 자리가 없다 |
 * | `Residence`/`House` | 데모 데이터가 다세대·원룸 호실이라 `Apartment` 가 더 가깝다 |
 * | `Offer` 를 최상위로 | 페이지가 곧 매물 광고라는 사실이 사라진다. 크롤러가 "무엇에 대한 페이지" 인지 잃는다 |
 *
 * 그래서 **`RealEstateListing` → `mainEntity`(Offer) → `itemOffered`(Apartment)** 3단이다.
 * `Offer` 에는 `Place` 를 매달 수 없고 `Place` 에는 금액을 매달 수 없으므로,
 * 둘을 잇는 유일하게 올바른 방향이 `Offer.itemOffered` 다.
 *
 * ## 전세·월세를 금액으로 옮기기
 *
 * 한국식 보증금/월세는 schema.org 에 대응 타입이 없다. `Offer` 하나에 값 하나만 담을 수 있으므로:
 *
 * - `price` — **정기적으로 내는 돈**. 월세면 `monthlyRent`, 전세면 `deposit`(한 번에 내는 전부).
 * - `priceSpecification[]` — 조건 **전부**를 각각 이름 붙여 담는다.
 *   - 보증금: `PriceSpecification` `{ name: "보증금" }`
 *   - 월세: `UnitPriceSpecification` `{ name: "월세", unitCode: "MON" }` — `MON` 은 UN/CEFACT 의 "월" 코드다.
 * - `businessFunction: LeaseOut`(GoodRelations) — **파는 게 아니라 빌려주는 것**임을 못 박는다.
 *   이게 없으면 `price` 가 매매가로 읽힌다.
 *
 * ## 상태 → `availability`
 *
 * | `ListingStatus` | schema.org |
 * |---|---|
 * | `OPEN` | `InStock` |
 * | `RESERVED` | `LimitedAvailability` |
 * | `CLOSED` | `SoldOut` |
 *
 * 종료 매물도 JSON-LD 를 그대로 내보낸다 — 페이지가 살아 있으니(문서의 "상태별 노출" 절)
 * 구조화 데이터가 그 상태를 정확히 말해 주는 편이 낫다. 색인은 메타의 `noindex` 가 막는다.
 *
 * ## 개인정보
 *
 * `seller`·`author` 를 넣지 않는다. 등록자 이름은 `PublicListingDto` 에 아예 담기지 않고
 * (`features/listing/public.ts`), 색인되는 구조화 데이터에도 넣지 않는다.
 *
 * 이 파일은 순수 함수다 — `@zari/db` 도 `next` 도 import 하지 않는다(테스트가 DB 없이 돈다).
 */
import { formatArea, formatFloor, formatRooms } from "./price";
import type { ListingStatusValue, PublicListingDto } from "./types";

/** JSON-LD 한 덩어리. 값은 JSON 으로 직렬화 가능한 것만 */
export type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | JsonLdValue[]
  | { [key: string]: JsonLdValue };
export type JsonLdObject = { [key: string]: JsonLdValue };

const AVAILABILITY: Record<ListingStatusValue, string> = {
  OPEN: "https://schema.org/InStock",
  RESERVED: "https://schema.org/LimitedAvailability",
  CLOSED: "https://schema.org/SoldOut",
};

/** GoodRelations — "빌려준다". schema.org `businessFunction` 이 이 어휘를 쓴다 */
export const LEASE_OUT = "http://purl.org/goodrelations/v1#LeaseOut";

/** UN/CEFACT 공통 코드 — 제곱미터 · 월 */
const UNIT_SQUARE_METRE = "MTK";
const UNIT_MONTH = "MON";

/** `undefined` 키를 지운다 — JSON-LD 에 `"floorSize": undefined` 가 남으면 안 된다 */
function compact(object: Record<string, JsonLdValue | undefined>): JsonLdObject {
  const result: JsonLdObject = {};
  for (const [key, value] of Object.entries(object)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

/** 사람이 읽는 매물 이름 — 메타 제목과 같은 문자열을 쓴다 */
export function listingTitle(listing: PublicListingDto): string {
  return `${listing.building.name} ${listing.unit.label} ${listing.priceLabel}`;
}

/** 메타 설명 — 조건을 한 줄로. 설명이 있으면 뒤에 붙인다 */
export function listingDescription(listing: PublicListingDto): string {
  const parts = [
    listing.priceLabel,
    formatRooms(listing.unit.rooms),
    formatArea(listing.unit.areaM2),
    formatFloor(listing.unit.floor),
    listing.building.roadAddress ?? listing.building.address,
  ].filter((part): part is string => Boolean(part));

  const head = parts.join(" · ");
  const tail = listing.description?.trim();
  return tail ? `${head} — ${tail}` : head;
}

export type ListingJsonLdInput = {
  listing: PublicListingDto;
  /** 사이트 절대 주소(끝 슬래시 없음) — 상대 경로를 절대 URL 로 만든다 */
  siteUrl: string;
};

/** `/listings/[id]` 에 심는 구조화 데이터 */
export function listingJsonLd({ listing, siteUrl }: ListingJsonLdInput): JsonLdObject {
  const base = siteUrl.replace(/\/+$/, "");
  const url = `${base}/listings/${listing.id}`;

  const priceSpecification: JsonLdObject[] = [
    compact({
      "@type": "PriceSpecification",
      name: "보증금",
      price: listing.deposit,
      priceCurrency: "KRW",
      valueAddedTaxIncluded: true,
    }),
  ];
  if (listing.dealType === "WOLSE") {
    priceSpecification.push(
      compact({
        "@type": "UnitPriceSpecification",
        name: "월세",
        price: listing.monthlyRent,
        priceCurrency: "KRW",
        // "1개월당" — 이 코드가 없으면 월세가 일시금으로 읽힌다
        unitCode: UNIT_MONTH,
        valueAddedTaxIncluded: true,
      }),
    );
  }

  const accommodation = compact({
    "@type": "Apartment",
    name: `${listing.building.name} ${listing.unit.label}`,
    address: compact({
      "@type": "PostalAddress",
      addressCountry: "KR",
      streetAddress: listing.building.roadAddress ?? listing.building.address,
    }),
    geo: {
      "@type": "GeoCoordinates",
      latitude: listing.building.lat,
      longitude: listing.building.lng,
    },
    floorSize:
      listing.unit.areaM2 === null
        ? undefined
        : {
            "@type": "QuantitativeValue",
            value: listing.unit.areaM2,
            unitCode: UNIT_SQUARE_METRE,
          },
    numberOfRooms: listing.unit.rooms === null ? undefined : listing.unit.rooms,
    floorLevel: listing.unit.floor === null ? undefined : String(listing.unit.floor),
  });

  const offer = compact({
    "@type": "Offer",
    "@id": `${url}#offer`,
    name: listing.priceLabel,
    price: listing.dealType === "WOLSE" ? listing.monthlyRent : listing.deposit,
    priceCurrency: "KRW",
    businessFunction: LEASE_OUT,
    availability: AVAILABILITY[listing.status],
    availabilityStarts: listing.availableFrom ?? undefined,
    priceSpecification,
    itemOffered: accommodation,
  });

  return compact({
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "@id": `${url}#listing`,
    url,
    name: listingTitle(listing),
    description: listingDescription(listing),
    datePosted: listing.createdAt,
    inLanguage: "ko-KR",
    image: listing.photos.length > 0 ? listing.photos : undefined,
    mainEntity: offer,
  });
}

/**
 * `<script type="application/ld+json">` 안에 넣을 문자열.
 *
 * `JSON.stringify` 만으로는 부족하다 — 설명에 `</script>` 가 들어 있으면 스크립트 블록이
 * 거기서 끊기고 그 뒤가 **HTML 로 해석된다**(XSS). `<`·`>`·`&` 를 유니코드 이스케이프로 바꾸면
 * JSON 의미는 그대로면서 HTML 파서가 태그로 읽지 못한다. U+2028·U+2029 는 JSON 에서는
 * 유효하지만 JS 문자열에서는 줄바꿈이라 함께 막는다.
 */
export function serializeJsonLd(value: JsonLdValue): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}
