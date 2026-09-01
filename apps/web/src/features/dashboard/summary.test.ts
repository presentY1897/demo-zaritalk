/**
 * 대시보드 집계 단위 테스트 (T1.9) — **DB 없이** 순수 함수만 돌린다.
 *
 * "오늘"·"이번 달"·"만기 90일" 은 시계에 따라 답이 달라지므로 `asOf` 를 **고정 값으로 주입**한다
 * (T1.4 크론 테스트가 `now` 를 못 박는 것과 같은 방식).
 * 시나리오는 시드(`packages/db/prisma/seed.ts`)를 그대로 옮겼다 — 화면에 나올 숫자가 곧 여기 기댓값이다.
 */
import { describe, expect, test } from "vitest";
import { kstToday, utcDate } from "@/lib/rent";
import {
  buildLandlordSummary,
  type SummaryBuildingInput,
  type SummaryChargeInput,
  type SummaryInboxInput,
  type SummaryLeaseInput,
} from "./summary";

/** 시드가 상정한 "오늘" — KST 2026-09-01 */
const ASOF = utcDate(2026, 9, 1);

function charge(input: Partial<SummaryChargeInput> & { id: string; year: number; month: number }) {
  return {
    dueDate: utcDate(input.year, input.month, 5),
    rentAmount: 650_000,
    maintenanceAmount: 50_000,
    carriedOverAmount: 0,
    lateFeeAmount: 0,
    totalDue: 700_000,
    paidAmount: 0,
    ...input,
  } satisfies SummaryChargeInput;
}

function lease(input: Partial<SummaryLeaseInput> & { id: string }): SummaryLeaseInput {
  return {
    status: "ACTIVE",
    tenantName: "박세입",
    monthlyRent: 650_000,
    endDate: utcDate(2027, 2, 28),
    charges: [],
    ...input,
  };
}

/** 시드 201호 — 6월 완납 / 7월 부분납(잔액 30만) / 8월 연체(이월+연체료) / 9월 예정 */
const SEED_201_CHARGES: SummaryChargeInput[] = [
  charge({ id: "c6", year: 2026, month: 6, paidAmount: 700_000 }),
  charge({ id: "c7", year: 2026, month: 7, paidAmount: 400_000 }),
  charge({
    id: "c8",
    year: 2026,
    month: 8,
    carriedOverAmount: 300_000,
    lateFeeAmount: 15_500,
    totalDue: 1_015_500,
    paidAmount: 0,
  }),
  charge({ id: "c9", year: 2026, month: 9 }),
];

/** 시드 그대로의 건물 1채(101호 공실 · 201호 ACTIVE · 202호 PENDING_TENANT) */
function seedBuildings(): SummaryBuildingInput[] {
  return [
    {
      id: "b1",
      name: "행당해피빌",
      units: [
        { id: "u101", label: "101호", leases: [] },
        {
          id: "u201",
          label: "201호",
          leases: [lease({ id: "l201", charges: SEED_201_CHARGES })],
        },
        {
          id: "u202",
          label: "202호",
          leases: [
            lease({
              id: "l202",
              status: "PENDING_TENANT",
              tenantName: "홍미가",
              monthlyRent: 550_000,
              endDate: utcDate(2027, 7, 24),
              charges: [
                charge({
                  id: "c202-8",
                  year: 2026,
                  month: 8,
                  dueDate: utcDate(2026, 8, 25),
                  rentAmount: 550_000,
                  maintenanceAmount: 30_000,
                  totalDue: 580_000,
                  paidAmount: 580_000,
                }),
              ],
            }),
          ],
        },
      ],
    },
  ];
}

const EMPTY_INBOX: SummaryInboxInput = { complaintCount: 0, quoteCount: 0 };

function summarize(
  buildings: SummaryBuildingInput[],
  asOf: Date = ASOF,
  inbox: SummaryInboxInput = EMPTY_INBOX,
) {
  return buildLandlordSummary({ buildings, inbox, asOf });
}

describe("연체 — 실효 상태 OVERDUE(한 푼도 안 낸 청구)", () => {
  test("시드 기준 1건 · 1,015,500원", () => {
    const summary = summarize(seedBuildings());

    expect(summary.overdue.count).toBe(1);
    expect(summary.overdue.amount).toBe(1_015_500);
    expect(summary.overdue.items).toHaveLength(1);
  });

  test("연체 행에 건물·호실·세입자·청구월·경과일수·항목 분해가 담긴다", () => {
    const [item] = summarize(seedBuildings()).overdue.items;

    expect(item).toMatchObject({
      chargeId: "c8",
      leaseId: "l201",
      unitId: "u201",
      buildingName: "행당해피빌",
      unitLabel: "201호",
      tenantName: "박세입",
      year: 2026,
      month: 8,
      dueDate: "2026-08-05",
      overdueDays: 27, // 8/5 → 9/1
      totalDue: 1_015_500,
      paidAmount: 0,
      outstanding: 1_015_500,
    });
    // 원장 엔진 describeCharge 의 4줄 — 이월 300,000 + 연체료 15,500 이 그대로 보인다
    expect(item?.lines.map((line) => [line.label, line.amount])).toEqual([
      ["월세", 650_000],
      ["관리비", 50_000],
      ["전월 이월", 300_000],
      ["연체료", 15_500],
    ]);
  });

  test("부분납 청구는 연체로 세지 않는다 (7월 청구는 빠진다)", () => {
    const summary = summarize(seedBuildings());
    expect(summary.overdue.items.map((item) => item.month)).toEqual([8]);
  });

  test("기한 당일은 아직 연체가 아니다", () => {
    const buildings: SummaryBuildingInput[] = [
      {
        id: "b1",
        name: "행당해피빌",
        units: [
          {
            id: "u1",
            label: "101호",
            leases: [lease({ id: "l1", charges: [charge({ id: "c", year: 2026, month: 9 })] })],
          },
        ],
      },
    ];

    expect(summarize(buildings, utcDate(2026, 9, 5)).overdue.count).toBe(0);
    expect(summarize(buildings, utcDate(2026, 9, 6)).overdue.count).toBe(1);
  });

  test("기한이 오래된 것부터 나열한다", () => {
    const buildings: SummaryBuildingInput[] = [
      {
        id: "b1",
        name: "행당해피빌",
        units: [
          {
            id: "u1",
            label: "101호",
            leases: [
              lease({
                id: "l1",
                charges: [
                  charge({ id: "new", year: 2026, month: 8 }),
                  charge({ id: "old", year: 2026, month: 6 }),
                ],
              }),
            ],
          },
        ],
      },
    ];

    expect(summarize(buildings).overdue.items.map((item) => item.chargeId)).toEqual(["old", "new"]);
  });
});

describe("미납 — isDelinquent(부분납 포함)", () => {
  test("시드 기준 2건 · 1,315,500원 — 연체(1건)와 다른 숫자다", () => {
    const summary = summarize(seedBuildings());

    expect(summary.delinquent.count).toBe(2); // 7월 부분납 + 8월 연체
    expect(summary.delinquent.amount).toBe(300_000 + 1_015_500);
    expect(summary.delinquent.count).not.toBe(summary.overdue.count);
  });

  test("연체는 미납의 부분집합이다", () => {
    const summary = summarize(seedBuildings());
    expect(summary.delinquent.count).toBeGreaterThanOrEqual(summary.overdue.count);
    expect(summary.delinquent.amount).toBeGreaterThanOrEqual(summary.overdue.amount);
  });

  test("기한 전 미납은 세지 않는다 (9월 예정 청구)", () => {
    expect(summarize(seedBuildings(), utcDate(2026, 9, 1)).delinquent.count).toBe(2);
    // 9/5 이 지나면 9월 청구도 미납·연체로 넘어간다
    expect(summarize(seedBuildings(), utcDate(2026, 9, 6)).delinquent.count).toBe(3);
  });
});

describe("이번 달 수납 현황 (KST 달력)", () => {
  test("시드 기준 2026년 9월 — 청구 1건 700,000원, 수납 0원", () => {
    const summary = summarize(seedBuildings());

    expect(summary.month).toEqual({ year: 2026, month: 9, label: "2026년 9월" });
    expect(summary.collection).toMatchObject({
      chargeCount: 1,
      billedAmount: 700_000,
      paidAmount: 0,
      outstandingAmount: 700_000,
      paidCount: 0,
      unpaidCount: 1,
      collectedPct: 0,
    });
    expect(summary.collection.statusCounts).toEqual({
      SCHEDULED: 1,
      PARTIALLY_PAID: 0,
      PAID: 0,
      OVERDUE: 0,
    });
  });

  test("8월이 이번 달이면 연체 1건 + 완납 1건이 함께 잡힌다", () => {
    const summary = summarize(seedBuildings(), utcDate(2026, 8, 20));

    expect(summary.collection.chargeCount).toBe(2); // 201호 8월 + 202호 8월
    expect(summary.collection.billedAmount).toBe(1_015_500 + 580_000);
    expect(summary.collection.paidAmount).toBe(580_000);
    expect(summary.collection.paidCount).toBe(1);
    expect(summary.collection.statusCounts).toEqual({
      SCHEDULED: 0,
      PARTIALLY_PAID: 0,
      PAID: 1,
      OVERDUE: 1,
    });
    // floor(580000 / 1595500 * 100) = 36
    expect(summary.collection.collectedPct).toBe(36);
  });

  test("수납률은 내림이고 100을 넘지 않는다", () => {
    const buildings: SummaryBuildingInput[] = [
      {
        id: "b1",
        name: "행당해피빌",
        units: [
          {
            id: "u1",
            label: "101호",
            leases: [
              lease({
                id: "l1",
                charges: [charge({ id: "c", year: 2026, month: 9, paidAmount: 699_999 })],
              }),
            ],
          },
        ],
      },
    ];
    // 699999/700000 = 99.999…% → 99 (내림). "100%" 는 진짜 완납일 때만 뜬다
    expect(summarize(buildings).collection.collectedPct).toBe(99);
  });

  test("청구가 0원이면 수납률은 0 (0으로 나누지 않는다)", () => {
    expect(summarize([]).collection.collectedPct).toBe(0);
  });

  test("월 경계는 KST 로 판정한다 — UTC 8/31 15:30 은 한국에서 9월 1일", () => {
    const summary = summarize(seedBuildings(), kstToday(new Date("2026-08-31T15:30:00Z")));

    expect(summary.month.month).toBe(9);
    expect(summary.asOf).toBe("2026-09-01");
    expect(summary.collection.chargeCount).toBe(1); // 9월 청구 1건
  });
});

describe("만기 임박 — 90일 필터", () => {
  function withEndDate(endDate: Date, status: SummaryLeaseInput["status"] = "ACTIVE") {
    return summarize([
      {
        id: "b1",
        name: "행당해피빌",
        units: [{ id: "u1", label: "101호", leases: [lease({ id: "l1", status, endDate })] }],
      },
    ]);
  }

  test("기준 일수는 원장 엔진의 EXPIRY_NOTICE_DAYS(90)", () => {
    expect(summarize([]).expiring.withinDays).toBe(90);
  });

  test("90일째는 포함, 91일째는 제외", () => {
    expect(withEndDate(utcDate(2026, 11, 30)).expiring.count).toBe(1); // 9/1 + 90일
    expect(withEndDate(utcDate(2026, 12, 1)).expiring.count).toBe(0); // 91일
  });

  test("오늘 만기는 포함, 이미 지난 만기는 제외", () => {
    expect(withEndDate(utcDate(2026, 9, 1)).expiring.items[0]?.daysLeft).toBe(0);
    expect(withEndDate(utcDate(2026, 8, 31)).expiring.count).toBe(0);
  });

  test("끝난 계약(ENDED·CANCELLED)은 만기 임박에 넣지 않는다", () => {
    expect(withEndDate(utcDate(2026, 10, 1), "ENDED").expiring.count).toBe(0);
    expect(withEndDate(utcDate(2026, 10, 1), "CANCELLED").expiring.count).toBe(0);
    expect(withEndDate(utcDate(2026, 10, 1), "PENDING_TENANT").expiring.count).toBe(1);
  });

  test("시드 계약은 둘 다 90일 밖이라 0건이다 (2027-02-28 · 2027-07-24)", () => {
    expect(summarize(seedBuildings()).expiring.count).toBe(0);
  });

  test("만기가 가까운 것부터 나열하고 남은 일수를 함께 준다", () => {
    const summary = summarize([
      {
        id: "b1",
        name: "행당해피빌",
        units: [
          { id: "u1", label: "101호", leases: [lease({ id: "far", endDate: utcDate(2026, 11, 1) })] },
          { id: "u2", label: "201호", leases: [lease({ id: "near", endDate: utcDate(2026, 9, 30) })] },
        ],
      },
    ]);

    expect(summary.expiring.items.map((item) => item.leaseId)).toEqual(["near", "far"]);
    expect(summary.expiring.items[0]).toMatchObject({
      unitLabel: "201호",
      endDate: "2026-09-30",
      daysLeft: 29,
      monthlyRent: 650_000,
    });
  });
});

describe("자산 요약 (호실 상태)", () => {
  test("시드 기준 건물 1 · 호실 3 — 연체 1 · 대기 1 · 공실 1", () => {
    const summary = summarize(seedBuildings());

    expect(summary.portfolio.buildingCount).toBe(1);
    expect(summary.portfolio.unitCount).toBe(3);
    expect(summary.portfolio.statusCounts).toEqual({
      OCCUPIED: 0,
      PENDING: 1,
      OVERDUE: 1,
      VACANT: 1,
    });
  });

  test("연체 청구가 사라지면 그 호실은 계약중으로 돌아온다", () => {
    const buildings = seedBuildings();
    const unit201 = buildings[0]!.units[1]!;
    // 8월 청구를 완납 처리
    unit201.leases = [
      lease({
        id: "l201",
        charges: SEED_201_CHARGES.map((c) =>
          c.id === "c8" ? { ...c, paidAmount: c.totalDue } : c,
        ),
      }),
    ];

    expect(summarize(buildings).portfolio.statusCounts.OCCUPIED).toBe(1);
    expect(summarize(buildings).portfolio.statusCounts.OVERDUE).toBe(0);
  });
});

describe("미확인 민원·견적", () => {
  test("0이면 total 0 이고 링크 대상도 null (화면에서 배지를 숨긴다)", () => {
    expect(summarize(seedBuildings()).inbox).toEqual({
      complaintCount: 0,
      quoteCount: 0,
      total: 0,
      latestComplaintId: null,
      latestQuoteWorkOrderId: null,
    });
  });

  test("데이터가 들어오면 그대로 채워진다 (T2.6·T5.3)", () => {
    const summary = summarize(seedBuildings(), ASOF, {
      complaintCount: 2,
      quoteCount: 3,
      latestComplaintId: "cp1",
      latestQuoteWorkOrderId: "wo1",
    });

    expect(summary.inbox).toEqual({
      complaintCount: 2,
      quoteCount: 3,
      total: 5,
      latestComplaintId: "cp1",
      latestQuoteWorkOrderId: "wo1",
    });
  });
});

describe("빈 상태", () => {
  test("건물이 하나도 없어도 0으로 채운 응답을 돌려준다", () => {
    const summary = summarize([]);

    expect(summary.overdue).toEqual({ count: 0, amount: 0, items: [] });
    expect(summary.delinquent).toEqual({ count: 0, amount: 0 });
    expect(summary.expiring.items).toEqual([]);
    expect(summary.portfolio).toEqual({
      buildingCount: 0,
      unitCount: 0,
      statusCounts: { OCCUPIED: 0, PENDING: 0, OVERDUE: 0, VACANT: 0 },
    });
    expect(summary.collection.chargeCount).toBe(0);
    expect(summary.asOf).toBe("2026-09-01");
  });
});
