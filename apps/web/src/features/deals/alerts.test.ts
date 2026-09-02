/**
 * 알림 매칭 규칙 (T4.4) — **DB 없음**.
 *
 * T4.4 최소 테스트 축 **알림 매칭(지역+단지+유형 조합)** 이 여기 있다.
 * 구독의 세 칸(지역·단지·유형)이 만드는 **조합 전부**를 표로 확인한다.
 */
import { describe, expect, test } from "vitest";
import { alertMatches, buildAlertMessage, matchDeals, type AlertMessageDeal } from "./alerts";
import type { RealDealTypeValue } from "./types";

const DEAL = { lawdCd: "11200", aptName: "신금호파크자이", dealType: "JEONSE" as const };

type Case = {
  name: string;
  alert: { lawdCd: string; aptName: string | null; dealType: RealDealTypeValue | null };
  expected: boolean;
};

describe("세 칸 AND — 빈 칸은 «전부»", () => {
  const cases: Case[] = [
    // 지역만
    { name: "지역만 구독 — 같은 지역", alert: { lawdCd: "11200", aptName: null, dealType: null }, expected: true },
    { name: "지역만 구독 — 다른 지역", alert: { lawdCd: "11680", aptName: null, dealType: null }, expected: false },
    // 지역 + 유형
    { name: "지역+유형 — 유형 일치", alert: { lawdCd: "11200", aptName: null, dealType: "JEONSE" }, expected: true },
    { name: "지역+유형 — 유형 불일치", alert: { lawdCd: "11200", aptName: null, dealType: "WOLSE" }, expected: false },
    { name: "지역+유형 — 매매 구독에 전세 거래", alert: { lawdCd: "11200", aptName: null, dealType: "SALE" }, expected: false },
    // 지역 + 단지
    { name: "지역+단지 — 단지 일치", alert: { lawdCd: "11200", aptName: "신금호파크자이", dealType: null }, expected: true },
    { name: "지역+단지 — 단지 불일치", alert: { lawdCd: "11200", aptName: "센트라스", dealType: null }, expected: false },
    // 지역 + 단지 + 유형
    { name: "셋 다 일치", alert: { lawdCd: "11200", aptName: "신금호파크자이", dealType: "JEONSE" }, expected: true },
    { name: "단지만 어긋남", alert: { lawdCd: "11200", aptName: "센트라스", dealType: "JEONSE" }, expected: false },
    { name: "유형만 어긋남", alert: { lawdCd: "11200", aptName: "신금호파크자이", dealType: "WOLSE" }, expected: false },
    { name: "지역만 어긋남", alert: { lawdCd: "11680", aptName: "신금호파크자이", dealType: "JEONSE" }, expected: false },
  ];

  for (const item of cases) {
    test(item.name, () => {
      expect(alertMatches(item.alert, DEAL)).toBe(item.expected);
    });
  }
});

describe("단지명은 공백 무시 완전일치", () => {
  const alert = { lawdCd: "11200", aptName: "e편한세상 금호파크힐스", dealType: null };

  test("공백 표기가 달라도 잡는다", () => {
    expect(
      alertMatches(alert, { lawdCd: "11200", aptName: "e편한세상금호파크힐스", dealType: "SALE" }),
    ).toBe(true);
  });

  test("**부분일치는 아니다** — 다른 단지를 끌어오지 않는다", () => {
    expect(
      alertMatches(
        { lawdCd: "11200", aptName: "자이", dealType: null },
        { lawdCd: "11200", aptName: "신금호파크자이", dealType: "SALE" },
      ),
    ).toBe(false);
    expect(
      alertMatches(alert, { lawdCd: "11200", aptName: "e편한세상금호파크힐스2차", dealType: "SALE" }),
    ).toBe(false);
  });
});

describe("matchDeals", () => {
  const deals = [
    { lawdCd: "11200", aptName: "신금호파크자이", dealType: "JEONSE" as const },
    { lawdCd: "11200", aptName: "신금호파크자이", dealType: "WOLSE" as const },
    { lawdCd: "11200", aptName: "센트라스", dealType: "JEONSE" as const },
    { lawdCd: "11680", aptName: "신금호파크자이", dealType: "JEONSE" as const },
  ];

  test("지역 전체 구독은 그 지역 3건을 잡는다", () => {
    expect(matchDeals({ lawdCd: "11200", aptName: null, dealType: null }, deals)).toHaveLength(3);
  });

  test("단지 구독은 2건", () => {
    expect(
      matchDeals({ lawdCd: "11200", aptName: "신금호파크자이", dealType: null }, deals),
    ).toHaveLength(2);
  });

  test("단지+유형 구독은 1건", () => {
    expect(
      matchDeals({ lawdCd: "11200", aptName: "신금호파크자이", dealType: "WOLSE" }, deals),
    ).toHaveLength(1);
  });

  test("잡히는 게 없으면 빈 배열 — 알림을 만들지 않는다", () => {
    expect(matchDeals({ lawdCd: "41110", aptName: null, dealType: null }, deals)).toEqual([]);
  });
});

describe("알림톡 문구", () => {
  const deals: AlertMessageDeal[] = [
    {
      lawdCd: "11200",
      aptName: "신금호파크자이",
      dealType: "JEONSE",
      areaM2: 59.98,
      floor: 11,
      dealDate: "2026-07-14",
      price: null,
      deposit: 85_000,
      monthlyRent: 0,
    },
    {
      lawdCd: "11200",
      aptName: "신금호파크자이",
      dealType: "WOLSE",
      areaM2: 84.9,
      floor: -1,
      dealDate: "2026-07-10",
      price: null,
      deposit: 3_000,
      monthlyRent: 55,
    },
  ];

  test("제목에 대상·유형·건수가 들어간다", () => {
    const message = buildAlertMessage({
      regionLabel: "서울 성동구",
      alert: { lawdCd: "11200", aptName: "신금호파크자이", dealType: null },
      deals,
    });
    expect(message.title).toBe("[자리] 신금호파크자이 실거래 신규 실거래 2건");
    expect(message.body).toContain("8억 5,000만원");
    expect(message.body).toContain("3,000만원 / 월 55만원");
  });

  test("단지를 안 고른 구독은 지역 이름으로 말한다", () => {
    const message = buildAlertMessage({
      regionLabel: "서울 성동구",
      alert: { lawdCd: "11200", aptName: null, dealType: "JEONSE" },
      deals: [deals[0]!],
    });
    expect(message.title).toBe("[자리] 서울 성동구 전세 신규 실거래 1건");
  });

  test("4건이 넘으면 «외 N건» 으로 접는다", () => {
    const many = [...deals, ...deals, ...deals];
    const message = buildAlertMessage({
      regionLabel: "서울 성동구",
      alert: { lawdCd: "11200", aptName: null, dealType: null },
      deals: many,
    });
    expect(message.title).toContain("6건");
    expect(message.body).toContain("외 3건");
  });
});
