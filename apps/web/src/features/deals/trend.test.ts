/**
 * 추이 집계·수집 월 계산 (T4.3·T4.4) — **DB 없음**.
 */
import { describe, expect, test } from "vitest";
import { formatDealYm, monthRange, parseDealYm, recentDealYms, ymKeyOf, ymLabel } from "./period";
import { buildTrend, representativeAmount, type TrendSourceDeal } from "./trend";

function saleAt(ym: string, price: number): TrendSourceDeal {
  return {
    dealType: "SALE",
    dealDate: new Date(`${ym}-15T00:00:00.000Z`),
    price,
    deposit: null,
    monthlyRent: null,
  };
}

describe("수집 월", () => {
  test("YYYYMM 왕복", () => {
    expect(formatDealYm({ year: 2026, month: 7 })).toBe("202607");
    expect(formatDealYm({ year: 2026, month: 12 })).toBe("202612");
    expect(parseDealYm("202607")).toEqual({ year: 2026, month: 7 });
  });

  test("형식·범위를 벗어나면 null", () => {
    expect(parseDealYm("2026")).toBeNull();
    expect(parseDealYm("202613")).toBeNull();
    expect(parseDealYm("202600")).toBeNull();
    expect(parseDealYm("200512")).toBeNull(); // 국토부 데이터는 2006년부터
    expect(parseDealYm("abcdef")).toBeNull();
  });

  test("최신 달이 앞이고 해 경계를 넘는다", () => {
    // KST 기준이라 UTC 2026-01-01 00:00 은 한국에서 이미 1월 1일이다
    expect(recentDealYms(3, new Date("2026-01-05T00:00:00Z"))).toEqual([
      "202601",
      "202512",
      "202511",
    ]);
  });

  test("KST 경계 — UTC 로 전달 마지막 날 15:00 은 한국에서 다음 달 1일이다", () => {
    expect(recentDealYms(1, new Date("2026-06-30T15:00:00Z"))).toEqual(["202607"]);
    expect(recentDealYms(1, new Date("2026-06-30T14:59:00Z"))).toEqual(["202606"]);
  });

  test("월 범위는 UTC 자정 [시작, 다음 달 시작)", () => {
    const july = monthRange({ year: 2026, month: 7 });
    expect(july.start.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(july.end.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    const december = monthRange({ year: 2026, month: 12 });
    expect(december.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  test("버킷 키·라벨", () => {
    expect(ymKeyOf(new Date("2026-07-14T00:00:00Z"))).toBe("2026-07");
    expect(ymLabel("2026-07", 2026)).toBe("7월");
    expect(ymLabel("2025-12", 2026)).toBe("25.12월");
  });
});

describe("대표 금액", () => {
  test("매매는 매매가, 전월세는 보증금", () => {
    expect(representativeAmount(saleAt("2026-07", 120_000))).toBe(120_000);
    expect(
      representativeAmount({
        dealType: "WOLSE",
        dealDate: new Date(),
        price: null,
        deposit: 3_000,
        monthlyRent: 55,
      }),
    ).toBe(3_000);
  });
});

describe("월별 집계", () => {
  test("평균은 내림, 최소·최대·건수가 함께 온다", () => {
    const trend = buildTrend([saleAt("2026-07", 100_000), saleAt("2026-07", 100_001)], {
      apartmentName: "센트라스",
      currentYear: 2026,
    });
    expect(trend.apartmentName).toBe("센트라스");
    expect(trend.points).toHaveLength(1);
    expect(trend.points[0]).toMatchObject({
      ym: "2026-07",
      label: "7월",
      count: 2,
      // (100000 + 100001) / 2 = 100000.5 → 내림
      avgAmount: 100_000,
      minAmount: 100_000,
      maxAmount: 100_001,
      avgMonthlyRent: null,
    });
  });

  test("**오래된 달이 앞**이라 차트가 시간순으로 읽힌다", () => {
    const trend = buildTrend(
      [saleAt("2026-09", 3), saleAt("2026-07", 1), saleAt("2026-08", 2)],
      { apartmentName: null, currentYear: 2026 },
    );
    expect(trend.points.map((point) => point.ym)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  test("거래가 없는 달은 점을 만들지 않는다 (0건과 «수집 안 함» 을 구분할 수 없어서)", () => {
    const trend = buildTrend([saleAt("2026-07", 1), saleAt("2026-09", 2)], {
      apartmentName: null,
      currentYear: 2026,
    });
    expect(trend.points.map((point) => point.ym)).toEqual(["2026-07", "2026-09"]);
  });

  test("월세는 보증금 막대 + 월세 평균 라벨", () => {
    const trend = buildTrend(
      [
        { dealType: "WOLSE", dealDate: new Date("2026-07-01T00:00:00Z"), price: null, deposit: 3_000, monthlyRent: 55 },
        { dealType: "WOLSE", dealDate: new Date("2026-07-20T00:00:00Z"), price: null, deposit: 1_000, monthlyRent: 80 },
      ],
      { apartmentName: null, currentYear: 2026 },
    );
    expect(trend.points[0]).toMatchObject({ avgAmount: 2_000, avgMonthlyRent: 67 });
  });

  test("대표 금액이 없는 행은 집계에서 빠진다", () => {
    const trend = buildTrend(
      [{ dealType: "SALE", dealDate: new Date("2026-07-01T00:00:00Z"), price: null, deposit: null, monthlyRent: null }],
      { apartmentName: null, currentYear: 2026 },
    );
    expect(trend.points).toEqual([]);
  });

  test("span 을 넘으면 **오래된 쪽**을 잘라낸다", () => {
    const deals = Array.from({ length: 5 }, (_, index) =>
      saleAt(`2026-0${index + 1}`, (index + 1) * 1_000),
    );
    const trend = buildTrend(deals, { apartmentName: null, currentYear: 2026, span: 3 });
    expect(trend.points.map((point) => point.ym)).toEqual(["2026-03", "2026-04", "2026-05"]);
  });

  test("빈 입력이면 점이 없다 (차트가 «거래 없음» 을 그린다)", () => {
    expect(buildTrend([], { apartmentName: "센트라스", currentYear: 2026 }).points).toEqual([]);
  });
});
