/**
 * 매물 구조화 데이터 단위 테스트 (T3.3) — **DB 없이 돈다**.
 *
 * task 완료 기준이 "OG·JSON-LD 유효" 라 **직렬화한 문자열을 다시 파싱해** 구조를 확인한다
 * (객체를 그대로 보면 `<script>` 에 실제로 들어가는 문자열이 유효한지는 알 수 없다).
 */
import { describe, expect, test } from "vitest";
import {
  LEASE_OUT,
  listingDescription,
  listingJsonLd,
  listingTitle,
  serializeJsonLd,
} from "./jsonld";
import type { PublicListingDto } from "./types";

const SITE = "https://demo-zaritalk.vercel.app";

function makeListing(overrides: Partial<PublicListingDto> = {}): PublicListingDto {
  return {
    id: "cmf0listing1",
    unitId: "cmf0unit1",
    dealType: "WOLSE",
    deposit: 10_000_000,
    monthlyRent: 500_000,
    status: "OPEN",
    priceLabel: "월세 1,000만/50만",
    pinLabel: "월 50만",
    description: "역까지 도보 5분",
    photos: ["https://cdn.example.com/a.jpg"],
    availableFrom: "2026-11-01",
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    listedBy: { role: "LANDLORD" },
    unit: { id: "cmf0unit1", label: "101호", floor: 1, areaM2: 23.1, rooms: 1 },
    building: {
      id: "cmf0b1",
      name: "행당해피빌",
      address: "서울 성동구 행당동 347",
      roadAddress: "서울 성동구 행당로 79",
      lat: 37.56152,
      lng: 127.03648,
    },
    commute: null,
    ...overrides,
  };
}

/** 실제로 `<script>` 에 들어가는 문자열을 다시 읽는다 */
function roundTrip(listing: PublicListingDto): Record<string, unknown> {
  const serialized = serializeJsonLd(listingJsonLd({ listing, siteUrl: SITE }));
  return JSON.parse(serialized) as Record<string, unknown>;
}

describe("구조", () => {
  test("RealEstateListing → mainEntity(Offer) → itemOffered(Apartment) 3단이다", () => {
    const json = roundTrip(makeListing());
    expect(json["@context"]).toBe("https://schema.org");
    expect(json["@type"]).toBe("RealEstateListing");

    const offer = json.mainEntity as Record<string, unknown>;
    expect(offer["@type"]).toBe("Offer");

    const accommodation = offer.itemOffered as Record<string, unknown>;
    expect(accommodation["@type"]).toBe("Apartment");
  });

  test("URL 과 @id 가 절대 주소다", () => {
    const json = roundTrip(makeListing());
    expect(json.url).toBe(`${SITE}/listings/cmf0listing1`);
    expect(json["@id"]).toBe(`${SITE}/listings/cmf0listing1#listing`);
    expect((json.mainEntity as Record<string, unknown>)["@id"]).toBe(
      `${SITE}/listings/cmf0listing1#offer`,
    );
  });

  test("사이트 주소 끝의 슬래시를 겹치지 않는다", () => {
    const json = JSON.parse(
      serializeJsonLd(listingJsonLd({ listing: makeListing(), siteUrl: `${SITE}/` })),
    ) as Record<string, unknown>;
    expect(json.url).toBe(`${SITE}/listings/cmf0listing1`);
  });

  test("주소·좌표·면적·방수를 담는다", () => {
    const accommodation = (roundTrip(makeListing()).mainEntity as Record<string, unknown>)
      .itemOffered as Record<string, unknown>;

    expect(accommodation.address).toEqual({
      "@type": "PostalAddress",
      addressCountry: "KR",
      streetAddress: "서울 성동구 행당로 79",
    });
    expect(accommodation.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: 37.56152,
      longitude: 127.03648,
    });
    expect(accommodation.floorSize).toEqual({
      "@type": "QuantitativeValue",
      value: 23.1,
      unitCode: "MTK",
    });
    expect(accommodation.numberOfRooms).toBe(1);
    expect(accommodation.floorLevel).toBe("1");
  });

  test("모르는 값(면적·방수·층)은 키 자체를 넣지 않는다", () => {
    const listing = makeListing({
      unit: { id: "u", label: "101호", floor: null, areaM2: null, rooms: null },
    });
    const accommodation = (roundTrip(listing).mainEntity as Record<string, unknown>)
      .itemOffered as Record<string, unknown>;

    expect("floorSize" in accommodation).toBe(false);
    expect("numberOfRooms" in accommodation).toBe(false);
    expect("floorLevel" in accommodation).toBe(false);
  });

  test("사진이 없으면 image 키가 없다", () => {
    const json = roundTrip(makeListing({ photos: [] }));
    expect("image" in json).toBe(false);
  });
});

describe("전세·월세를 금액으로 옮기기", () => {
  test("월세는 price 가 월세이고 priceSpecification 에 보증금·월세가 둘 다 있다", () => {
    const offer = roundTrip(makeListing()).mainEntity as Record<string, unknown>;
    expect(offer.price).toBe(500_000);
    expect(offer.priceCurrency).toBe("KRW");

    const specs = offer.priceSpecification as Record<string, unknown>[];
    expect(specs).toHaveLength(2);
    expect(specs[0]).toMatchObject({ "@type": "PriceSpecification", name: "보증금", price: 10_000_000 });
    expect(specs[1]).toMatchObject({
      "@type": "UnitPriceSpecification",
      name: "월세",
      price: 500_000,
      // 월세가 일시금으로 읽히지 않도록 "1개월당" 을 못 박는다
      unitCode: "MON",
    });
  });

  test("전세는 price 가 보증금이고 월세 항목이 없다", () => {
    const offer = roundTrip(
      makeListing({ dealType: "JEONSE", deposit: 250_000_000, monthlyRent: 0 }),
    ).mainEntity as Record<string, unknown>;

    expect(offer.price).toBe(250_000_000);
    const specs = offer.priceSpecification as Record<string, unknown>[];
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ name: "보증금", price: 250_000_000 });
  });

  test("매매가 아니라 임대라는 것을 businessFunction 으로 못 박는다", () => {
    const offer = roundTrip(makeListing()).mainEntity as Record<string, unknown>;
    expect(offer.businessFunction).toBe(LEASE_OUT);
  });

  test("입주가능일은 availabilityStarts 로 나간다", () => {
    const offer = roundTrip(makeListing()).mainEntity as Record<string, unknown>;
    expect(offer.availabilityStarts).toBe("2026-11-01");

    const immediate = roundTrip(makeListing({ availableFrom: null })).mainEntity as Record<
      string,
      unknown
    >;
    expect("availabilityStarts" in immediate).toBe(false);
  });
});

describe("상태 → availability", () => {
  test.each([
    ["OPEN", "https://schema.org/InStock"],
    ["RESERVED", "https://schema.org/LimitedAvailability"],
    ["CLOSED", "https://schema.org/SoldOut"],
  ] as const)("%s 는 %s", (status, availability) => {
    const offer = roundTrip(makeListing({ status })).mainEntity as Record<string, unknown>;
    expect(offer.availability).toBe(availability);
  });
});

describe("개인정보·안전", () => {
  test("등록자 정보(seller·author)를 담지 않는다", () => {
    const serialized = serializeJsonLd(listingJsonLd({ listing: makeListing(), siteUrl: SITE }));
    expect(serialized).not.toContain("seller");
    expect(serialized).not.toContain("author");
  });

  test("설명에 </script> 가 있어도 스크립트 블록이 깨지지 않는다", () => {
    const listing = makeListing({ description: '</script><img src=x onerror="alert(1)">' });
    const serialized = serializeJsonLd(listingJsonLd({ listing, siteUrl: SITE }));

    expect(serialized).not.toContain("<");
    expect(serialized).not.toContain(">");
    expect(serialized).toContain("\\u003c");
    // 이스케이프해도 JSON 의미는 그대로다
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    expect(String(parsed.description)).toContain("</script>");
  });
});

describe("제목·설명 (메타와 같은 문자열)", () => {
  test("제목은 건물·호실·가격이다", () => {
    expect(listingTitle(makeListing())).toBe("행당해피빌 101호 월세 1,000만/50만");
  });

  test("설명은 조건을 잇고 상세 설명을 뒤에 붙인다", () => {
    expect(listingDescription(makeListing())).toBe(
      "월세 1,000만/50만 · 원룸 · 23.1㎡ (약 7.0평) · 1층 · 서울 성동구 행당로 79 — 역까지 도보 5분",
    );
  });

  test("상세 설명이 없으면 조건만", () => {
    expect(listingDescription(makeListing({ description: null }))).toBe(
      "월세 1,000만/50만 · 원룸 · 23.1㎡ (약 7.0평) · 1층 · 서울 성동구 행당로 79",
    );
  });
});
