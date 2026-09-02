/**
 * `<item>` → 거래 한 줄 정규화 (T4.3) — **DB 없음**.
 *
 * 최소 테스트 축 ① **응답 파싱(면적·층·금액)** 과 ② **만원 단위 보존**이 여기 있다.
 */
import { describe, expect, test } from "vitest";
import {
  dealSignature,
  normalizeAptName,
  normalizeDeals,
  parseAreaM2,
  parseDealDate,
  parseFloorValue,
  parseManwon,
  parseYearValue,
  toNormalizedDeal,
} from "./parse";
import { readDealFixture } from "./testing";
import { parseXmlItems } from "./xml";

const RENT_ITEMS = parseXmlItems(readDealFixture("rent-11200-202607"));
const TRADE_ITEMS = parseXmlItems(readDealFixture("trade-11200-202607"));
const EDGE_ITEMS = parseXmlItems(readDealFixture("edge-cases"));
const CANCELLED_ITEMS = parseXmlItems(readDealFixture("trade-cancelled"));

describe("축 ② 만원 단위 보존 — 원으로 환산하지 않는다", () => {
  test("콤마를 떼되 단위는 만원 그대로", () => {
    // "85,000" 은 8억 5천만원이다. 원으로 바꾸면 850_000_000 이지만 저장은 85_000 이어야 한다
    expect(parseManwon("85,000")).toBe(85_000);
    expect(parseManwon("249,000")).toBe(249_000);
    expect(parseManwon("250")).toBe(250);
    expect(parseManwon("1,235,000")).toBe(1_235_000);
  });

  test("전월세 첫 행: 보증금 85,000만원 = 8.5억, 원 환산이 아니다", () => {
    const deal = toNormalizedDeal(RENT_ITEMS[0]!, { lawdCd: "11200", endpoint: "RENT" })!;
    expect(deal.deposit).toBe(85_000);
    expect(deal.deposit).not.toBe(850_000_000);
    expect(deal.price).toBeNull();
  });

  test("매매 첫 행: 매매가 249,000만원 = 24.9억", () => {
    const deal = toNormalizedDeal(TRADE_ITEMS[0]!, { lawdCd: "11200", endpoint: "TRADE" })!;
    expect(deal.price).toBe(249_000);
    expect(deal.deposit).toBeNull();
    expect(deal.monthlyRent).toBeNull();
  });

  test("전월세 fixture 30건 모두 만원 단위 정수다(21억 = 210,000 을 넘지 않는다)", () => {
    const { deals } = normalizeDeals(RENT_ITEMS, { lawdCd: "11200", endpoint: "RENT" });
    for (const deal of deals) {
      expect(Number.isInteger(deal.deposit)).toBe(true);
      expect(deal.deposit!).toBeLessThan(2_100_000_000);
    }
  });

  test("빈 값·공백·숫자 아님은 null", () => {
    expect(parseManwon(" ")).toBeNull();
    expect(parseManwon("")).toBeNull();
    expect(parseManwon(undefined)).toBeNull();
    expect(parseManwon("삼억")).toBeNull();
    expect(parseManwon("8.5")).toBeNull();
  });
});

describe("축 ① 응답 파싱 — 면적·층·거래일", () => {
  test("전용면적은 소수 그대로", () => {
    expect(parseAreaM2("59.98")).toBe(59.98);
    expect(parseAreaM2("84.417")).toBe(84.417);
    expect(parseAreaM2(" ")).toBeNull();
    expect(parseAreaM2("0")).toBeNull();
    expect(parseAreaM2("-3")).toBeNull();
  });

  test("층은 지하(-1)도 읽고 빈 값은 null", () => {
    expect(parseFloorValue("11")).toBe(11);
    expect(parseFloorValue("-1")).toBe(-1);
    expect(parseFloorValue(" ")).toBeNull();
    expect(parseFloorValue(undefined)).toBeNull();
  });

  test("건축년도는 범위를 벗어나면 null", () => {
    expect(parseYearValue("2016")).toBe(2016);
    expect(parseYearValue(" ")).toBeNull();
    expect(parseYearValue("20")).toBeNull();
  });

  test("거래일은 UTC 자정 Date 다 (@db.Date 규칙)", () => {
    const date = parseDealDate({ dealYear: "2026", dealMonth: "7", dealDay: "14" })!;
    expect(date.toISOString()).toBe("2026-07-14T00:00:00.000Z");
  });

  test("있을 수 없는 날짜(2월 30일)는 버린다 — Date 가 다음 달로 넘어가기 때문", () => {
    expect(parseDealDate({ dealYear: "2026", dealMonth: "2", dealDay: "30" })).toBeNull();
    expect(parseDealDate({ dealYear: "2026", dealMonth: "13", dealDay: "1" })).toBeNull();
    expect(parseDealDate({ dealYear: "1999", dealMonth: "1", dealDay: "1" })).toBeNull();
    expect(parseDealDate({ dealYear: " ", dealMonth: "7", dealDay: "14" })).toBeNull();
  });

  test("전월세 첫 행 전체", () => {
    const deal = toNormalizedDeal(RENT_ITEMS[0]!, { lawdCd: "11200", endpoint: "RENT" })!;
    expect(deal).toMatchObject({
      lawdCd: "11200",
      dealType: "JEONSE",
      aptName: "신금호파크자이",
      areaM2: 59.98,
      floor: 11,
      deposit: 85_000,
      monthlyRent: 0,
      builtYear: 2016,
    });
    expect(deal.dealDate.toISOString()).toBe("2026-07-14T00:00:00.000Z");
    // 원본을 그대로 들고 있어 나중에 필드가 더 필요해지면 여기서 꺼낸다
    expect(deal.raw.aptSeq).toBe("11200-3086");
  });
});

describe("유형 판정 — 엔드포인트 + 월세액", () => {
  test("매매 엔드포인트는 전부 SALE", () => {
    const { deals } = normalizeDeals(TRADE_ITEMS, { lawdCd: "11200", endpoint: "TRADE" });
    expect(deals.length).toBeGreaterThan(0);
    expect(new Set(deals.map((deal) => deal.dealType))).toEqual(new Set(["SALE"]));
  });

  test("전월세는 monthlyRent 0 이면 JEONSE, 0보다 크면 WOLSE", () => {
    const { deals } = normalizeDeals(RENT_ITEMS, { lawdCd: "11200", endpoint: "RENT" });
    for (const deal of deals) {
      expect(deal.dealType).toBe(deal.monthlyRent! > 0 ? "WOLSE" : "JEONSE");
    }
    expect(deals.some((deal) => deal.dealType === "JEONSE")).toBe(true);
  });

  test("월세 칸이 비어 있으면 0(전세)으로 본다", () => {
    const deal = toNormalizedDeal(
      { aptNm: "테스트", excluUseAr: "59.9", dealYear: "2026", dealMonth: "7", dealDay: "1", deposit: "10,000", monthlyRent: "" },
      { lawdCd: "11200", endpoint: "RENT" },
    )!;
    expect(deal.dealType).toBe("JEONSE");
    expect(deal.monthlyRent).toBe(0);
  });
});

describe("버리는 행", () => {
  test("경계값 fixture — 6건 중 3건만 살아남는다", () => {
    const { deals, discarded } = normalizeDeals(EDGE_ITEMS, {
      lawdCd: "11200",
      endpoint: "RENT",
    });
    // 살아남는 것: 콤마아파트(전세) · 지하층빌라(월세) · 층없음(월세)
    // 버리는 것: 보증금 없음(엔티티 & 아파트) · 단지명 없음 · 면적 없음
    expect(deals.map((deal) => deal.aptName)).toEqual(["콤마아파트", "지하층빌라", "층없음"]);
    expect(discarded).toBe(3);
  });

  test("지하층·건축년도 없음·층 없음이 그대로 보존된다", () => {
    const { deals } = normalizeDeals(EDGE_ITEMS, { lawdCd: "11200", endpoint: "RENT" });
    expect(deals[0]).toMatchObject({ deposit: 1_235_000, dealType: "JEONSE" });
    expect(deals[1]).toMatchObject({ floor: -1, builtYear: null, monthlyRent: 55, dealType: "WOLSE" });
    expect(deals[2]).toMatchObject({ floor: null, monthlyRent: 30, dealType: "WOLSE" });
  });

  test("해제된 매매(cdealType=O)는 저장하지 않는다", () => {
    const { deals, discarded } = normalizeDeals(CANCELLED_ITEMS, {
      lawdCd: "11200",
      endpoint: "TRADE",
    });
    expect(deals.map((deal) => deal.aptName)).toEqual(["정상단지"]);
    expect(discarded).toBe(1);
  });
});

describe("서명 — 멱등의 열쇠", () => {
  const base = {
    lawdCd: "11200",
    dealType: "JEONSE" as const,
    aptName: "신금호파크자이",
    areaM2: 59.98,
    floor: 11,
    dealDate: new Date("2026-07-14T00:00:00.000Z"),
    price: null,
    deposit: 85_000,
    monthlyRent: 0,
    builtYear: 2016,
  };

  test("같은 내용이면 같은 서명", () => {
    expect(dealSignature(base)).toBe(dealSignature({ ...base }));
  });

  test("단지명의 공백 차이는 같은 거래로 본다", () => {
    expect(dealSignature({ ...base, aptName: "신금호 파크자이" })).toBe(dealSignature(base));
  });

  test("금액·층·면적·거래일·유형이 하나라도 다르면 다른 서명", () => {
    expect(dealSignature({ ...base, deposit: 85_001 })).not.toBe(dealSignature(base));
    expect(dealSignature({ ...base, floor: 12 })).not.toBe(dealSignature(base));
    expect(dealSignature({ ...base, areaM2: 59.99 })).not.toBe(dealSignature(base));
    expect(dealSignature({ ...base, dealType: "WOLSE" })).not.toBe(dealSignature(base));
    expect(
      dealSignature({ ...base, dealDate: new Date("2026-07-15T00:00:00.000Z") }),
    ).not.toBe(dealSignature(base));
  });

  test("면적은 소수 둘째 자리까지만 본다 (Float 왕복에서 끝자리가 흔들려도 같은 거래)", () => {
    expect(dealSignature({ ...base, areaM2: 84.417 })).toBe(
      dealSignature({ ...base, areaM2: 84.4172 }),
    );
  });

  test("층이 null 인 행과 0층 행은 다른 서명이다", () => {
    expect(dealSignature({ ...base, floor: null })).not.toBe(dealSignature({ ...base, floor: 0 }));
  });

  test("normalizeAptName 은 공백만 지운다", () => {
    expect(normalizeAptName(" e편한세상 금호 파크힐스 ")).toBe("e편한세상금호파크힐스");
  });
});
