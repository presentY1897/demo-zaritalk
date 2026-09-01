/**
 * 원장 규칙 단위 테스트 (T1.4). DB를 쓰지 않는다 — 순수 함수라 빠르다.
 *
 * 최소 테스트 축 중 ② 부분납 상태 전이 · ③ 이월 금액 계산 · ④ 연체료 일할이 여기 있다
 * (① 멱등 생성 · ⑥ 크론 401 은 `app/api/cron/daily/route.test.ts`,
 *  ⑤ 말일 보정은 `date.test.ts`).
 *
 * 값은 시드(`packages/db/prisma/seed.ts`) 의 201호 계약을 그대로 쓴다:
 * 월세 650,000 / 관리비 50,000 / 납부일 5일 / 월 연체이율 5%.
 */
import { describe, expect, test } from "vitest";
import { utcDate } from "./date";
import {
  allocateAmount,
  allocatePayments,
  buildChargeDraft,
  calcCarriedOver,
  calcLateFee,
  calcOutstanding,
  calcOverdueDays,
  calcTotalDue,
  describeCharge,
  isDelinquent,
  isExpiringWithin,
  isOverpayment,
  isPastDue,
  resolveChargeStatus,
  sumPayments,
} from "./ledger";
import type { ChargeAmounts, LeaseTerms } from "./types";

/** 시드 201호 계약 조건 */
const SEED_LEASE: LeaseTerms = {
  monthlyRent: 650_000,
  maintenanceFee: 50_000,
  paymentDay: 5,
  lateFeeRatePct: 5,
};

describe("calcTotalDue — 월세 + 관리비 + 이월 + 연체료", () => {
  test("네 항목을 그대로 더한다", () => {
    expect(
      calcTotalDue({
        rentAmount: 650_000,
        maintenanceAmount: 50_000,
        carriedOverAmount: 300_000,
        lateFeeAmount: 15_500,
      }),
    ).toBe(1_015_500);
  });

  test("전세(월세 0) + 관리비만인 달도 성립", () => {
    expect(
      calcTotalDue({
        rentAmount: 0,
        maintenanceAmount: 80_000,
        carriedOverAmount: 0,
        lateFeeAmount: 0,
      }),
    ).toBe(80_000);
  });

  test("0원 청구", () => {
    expect(
      calcTotalDue({
        rentAmount: 0,
        maintenanceAmount: 0,
        carriedOverAmount: 0,
        lateFeeAmount: 0,
      }),
    ).toBe(0);
  });

  test("음수가 섞여 들어와도 0으로 막는다", () => {
    expect(
      calcTotalDue({
        rentAmount: -650_000,
        maintenanceAmount: 50_000,
        carriedOverAmount: 0,
        lateFeeAmount: 0,
      }),
    ).toBe(50_000);
  });
});

describe("축 ② 부분납 상태 전이", () => {
  const dueDate = utcDate(2026, 7, 5);
  const totalDue = 700_000;
  const status = (paidAmount: number, asOf: Date) =>
    resolveChargeStatus({ totalDue, paidAmount, dueDate, asOf });

  test("기한 전 · 미납 → SCHEDULED", () => {
    expect(status(0, utcDate(2026, 7, 1))).toBe("SCHEDULED");
  });

  test("기한 당일은 아직 연체가 아니다", () => {
    expect(status(0, utcDate(2026, 7, 5))).toBe("SCHEDULED");
  });

  test("기한 다음 날 · 미납 → OVERDUE (하루 차이)", () => {
    expect(status(0, utcDate(2026, 7, 6))).toBe("OVERDUE");
  });

  test("1원이라도 들어오면 PARTIALLY_PAID", () => {
    expect(status(1, utcDate(2026, 7, 1))).toBe("PARTIALLY_PAID");
  });

  test("부분납은 기한이 지나도 부분납으로 남는다 (OVERDUE 보다 우선)", () => {
    expect(status(400_000, utcDate(2026, 7, 6))).toBe("PARTIALLY_PAID");
    expect(status(400_000, utcDate(2026, 9, 1))).toBe("PARTIALLY_PAID");
  });

  test("누적 납부가 총액에 도달하면 PAID", () => {
    expect(status(699_999, utcDate(2026, 7, 6))).toBe("PARTIALLY_PAID");
    expect(status(700_000, utcDate(2026, 7, 6))).toBe("PAID");
  });

  test("초과 납부도 PAID", () => {
    expect(status(800_000, utcDate(2026, 7, 6))).toBe("PAID");
  });

  test("총액 0원 청구는 처음부터 PAID", () => {
    expect(
      resolveChargeStatus({ totalDue: 0, paidAmount: 0, dueDate, asOf: utcDate(2026, 7, 1) }),
    ).toBe("PAID");
  });

  test("isPastDue / calcOverdueDays 는 기한 다음 날부터 1일", () => {
    expect(isPastDue(dueDate, utcDate(2026, 7, 5))).toBe(false);
    expect(isPastDue(dueDate, utcDate(2026, 7, 6))).toBe(true);
    expect(calcOverdueDays(dueDate, utcDate(2026, 7, 5))).toBe(0);
    expect(calcOverdueDays(dueDate, utcDate(2026, 7, 1))).toBe(0);
    expect(calcOverdueDays(dueDate, utcDate(2026, 8, 5))).toBe(31);
  });

  test("isDelinquent 는 부분납까지 포함한 '기한 지난 미납'", () => {
    const charge = { totalDue, paidAmount: 400_000, dueDate };
    expect(isDelinquent(charge, utcDate(2026, 7, 5))).toBe(false);
    expect(isDelinquent(charge, utcDate(2026, 7, 6))).toBe(true);
    expect(isDelinquent({ ...charge, paidAmount: 700_000 }, utcDate(2026, 9, 1))).toBe(false);
  });

  test("sumPayments · calcOutstanding · isOverpayment", () => {
    expect(sumPayments([{ amount: 300_000 }, { amount: 100_000 }])).toBe(400_000);
    expect(sumPayments([])).toBe(0);
    expect(calcOutstanding(700_000, 400_000)).toBe(300_000);
    // 초과 납부여도 잔액은 음수가 되지 않는다
    expect(calcOutstanding(700_000, 900_000)).toBe(0);
    expect(isOverpayment(700_000, 400_000, 300_000)).toBe(false);
    expect(isOverpayment(700_000, 400_000, 300_001)).toBe(true);
  });
});

describe("축 ③ 이월 금액 계산", () => {
  test("전월 미납 잔액이 그대로 이월액", () => {
    expect(calcCarriedOver({ dueDate: utcDate(2026, 7, 5), totalDue: 700_000, paidAmount: 400_000 }))
      .toBe(300_000);
  });

  test("전월 완납이면 0", () => {
    expect(calcCarriedOver({ dueDate: utcDate(2026, 6, 5), totalDue: 700_000, paidAmount: 700_000 }))
      .toBe(0);
  });

  test("전월 초과 납부여도 음수가 되지 않는다", () => {
    expect(calcCarriedOver({ dueDate: utcDate(2026, 6, 5), totalDue: 700_000, paidAmount: 800_000 }))
      .toBe(0);
  });

  test("첫 달(전월 청구 없음)은 0", () => {
    expect(calcCarriedOver(null)).toBe(0);
    expect(calcCarriedOver(undefined)).toBe(0);
  });

  test("전액 미납이면 총액 전부가 이월된다", () => {
    expect(calcCarriedOver({ dueDate: utcDate(2026, 8, 5), totalDue: 1_015_500, paidAmount: 0 }))
      .toBe(1_015_500);
  });
});

describe("축 ④ 연체료 일할", () => {
  test("lateFeeRatePct 가 null 이면 0 (연체이율 없는 계약)", () => {
    expect(calcLateFee({ base: 300_000, lateFeeRatePct: null, overdueDays: 31 })).toBe(0);
    expect(calcLateFee({ base: 300_000, overdueDays: 31 })).toBe(0);
  });

  test("월 이율을 30일 기준으로 일할한다", () => {
    // 30일 = 월 이율 한 달치 그대로
    expect(calcLateFee({ base: 300_000, lateFeeRatePct: 5, overdueDays: 30 })).toBe(15_000);
    // 31일이면 하루치가 더 붙는다
    expect(calcLateFee({ base: 300_000, lateFeeRatePct: 5, overdueDays: 31 })).toBe(15_500);
    expect(calcLateFee({ base: 300_000, lateFeeRatePct: 5, overdueDays: 1 })).toBe(500);
  });

  test("1원 미만은 내림 — 세입자에게 불리하지 않게", () => {
    // 12,345 × 5% × 1/30 = 20.575
    expect(calcLateFee({ base: 12_345, lateFeeRatePct: 5, overdueDays: 1 })).toBe(20);
    // 1,000 × 1% × 1/30 = 0.333
    expect(calcLateFee({ base: 1_000, lateFeeRatePct: 1, overdueDays: 1 })).toBe(0);
  });

  test("소수 이율도 처리한다", () => {
    expect(calcLateFee({ base: 300_000, lateFeeRatePct: 2.5, overdueDays: 30 })).toBe(7_500);
  });

  test("연체일 0 · 음수, 기준 금액 0 · 음수, 이율 0 이면 전부 0", () => {
    expect(calcLateFee({ base: 300_000, lateFeeRatePct: 5, overdueDays: 0 })).toBe(0);
    expect(calcLateFee({ base: 300_000, lateFeeRatePct: 5, overdueDays: -3 })).toBe(0);
    expect(calcLateFee({ base: 0, lateFeeRatePct: 5, overdueDays: 31 })).toBe(0);
    expect(calcLateFee({ base: -300_000, lateFeeRatePct: 5, overdueDays: 31 })).toBe(0);
    expect(calcLateFee({ base: 300_000, lateFeeRatePct: 0, overdueDays: 31 })).toBe(0);
  });
});

describe("buildChargeDraft — 한 달치 청구 조립", () => {
  test("첫 달은 월세+관리비뿐", () => {
    const draft = buildChargeDraft({
      lease: SEED_LEASE,
      year: 2026,
      month: 6,
      previousCharge: null,
      asOf: utcDate(2026, 6, 1),
    });
    expect(draft).toMatchObject({
      year: 2026,
      month: 6,
      dueDate: utcDate(2026, 6, 5),
      rentAmount: 650_000,
      maintenanceAmount: 50_000,
      carriedOverAmount: 0,
      lateFeeAmount: 0,
      totalDue: 700_000,
      paidAmount: 0,
      status: "SCHEDULED",
    });
  });

  test("전월 부분납(잔액 30만) → 이월 + 7/5~8/5 31일치 연체료", () => {
    const draft = buildChargeDraft({
      lease: SEED_LEASE,
      year: 2026,
      month: 8,
      previousCharge: { dueDate: utcDate(2026, 7, 5), totalDue: 700_000, paidAmount: 400_000 },
      asOf: utcDate(2026, 8, 1),
    });
    expect(draft.carriedOverAmount).toBe(300_000);
    expect(draft.lateFeeAmount).toBe(15_500);
    expect(draft.totalDue).toBe(1_015_500);
    // 시드의 8월 청구는 손으로 넣은 1,015,000(연체료 15,000 = 30일치)이다.
    // 크론은 이미 만들어진 청구 금액을 건드리지 않으므로 시드 값은 그대로 남는다.
  });

  test("이월이 다시 이월된다 — 8월 전액 미납 → 9월", () => {
    const draft = buildChargeDraft({
      lease: SEED_LEASE,
      year: 2026,
      month: 9,
      previousCharge: { dueDate: utcDate(2026, 8, 5), totalDue: 1_015_500, paidAmount: 0 },
      asOf: utcDate(2026, 9, 1),
    });
    expect(draft.carriedOverAmount).toBe(1_015_500);
    // 1,015,500 × 5% × 31/30 = 52,467.5 → 내림 52,467
    expect(draft.lateFeeAmount).toBe(52_467);
    expect(draft.totalDue).toBe(1_767_967);
    expect(draft.status).toBe("SCHEDULED");
  });

  test("연체이율이 없으면 이월만 되고 연체료는 0", () => {
    const draft = buildChargeDraft({
      lease: { ...SEED_LEASE, lateFeeRatePct: null },
      year: 2026,
      month: 8,
      previousCharge: { dueDate: utcDate(2026, 7, 5), totalDue: 700_000, paidAmount: 400_000 },
      asOf: utcDate(2026, 8, 1),
    });
    expect(draft.carriedOverAmount).toBe(300_000);
    expect(draft.lateFeeAmount).toBe(0);
    expect(draft.totalDue).toBe(1_000_000);
  });

  test("납부일 31 + 2월이면 말일 기한 (축 ⑤ 연계)", () => {
    const draft = buildChargeDraft({
      lease: { ...SEED_LEASE, paymentDay: 31 },
      year: 2027,
      month: 2,
      previousCharge: null,
      asOf: utcDate(2027, 2, 1),
    });
    expect(draft.dueDate.toISOString()).toBe("2027-02-28T00:00:00.000Z");
  });

  test("이미 납부액이 있는 청구를 재계산하면 상태도 함께 맞춰진다", () => {
    const draft = buildChargeDraft({
      lease: SEED_LEASE,
      year: 2026,
      month: 7,
      previousCharge: null,
      asOf: utcDate(2026, 9, 1),
      paidAmount: 400_000,
    });
    expect(draft.status).toBe("PARTIALLY_PAID");
  });

  test("기한이 지났고 한 푼도 안 냈으면 생성 즉시 OVERDUE", () => {
    const draft = buildChargeDraft({
      lease: SEED_LEASE,
      year: 2026,
      month: 8,
      previousCharge: null,
      asOf: utcDate(2026, 9, 1),
    });
    expect(draft.status).toBe("OVERDUE");
  });
});

describe("납부 충당 — 이월 → 연체료 → 관리비 → 월세", () => {
  const amounts: ChargeAmounts = {
    rentAmount: 650_000,
    maintenanceAmount: 50_000,
    carriedOverAmount: 300_000,
    lateFeeAmount: 15_500,
  };

  test("적게 내면 이월분부터 지운다", () => {
    expect(allocateAmount(amounts, 0)).toEqual({
      carriedOver: 0,
      lateFee: 0,
      maintenance: 0,
      rent: 0,
      excess: 0,
    });
    expect(allocateAmount(amounts, 300_000)).toMatchObject({ carriedOver: 300_000, lateFee: 0 });
    expect(allocateAmount(amounts, 315_500)).toMatchObject({
      carriedOver: 300_000,
      lateFee: 15_500,
      maintenance: 0,
    });
    expect(allocateAmount(amounts, 365_500)).toMatchObject({
      maintenance: 50_000,
      rent: 0,
    });
  });

  test("완납이면 전 항목이 채워지고 excess 0", () => {
    expect(allocateAmount(amounts, 1_015_500)).toEqual({
      carriedOver: 300_000,
      lateFee: 15_500,
      maintenance: 50_000,
      rent: 650_000,
      excess: 0,
    });
  });

  test("초과 납부는 excess 로 빠진다", () => {
    expect(allocateAmount(amounts, 1_100_000).excess).toBe(84_500);
  });

  test("납부 행별 배분 — 장부 항목 집계용", () => {
    const rows = allocatePayments(amounts, [
      { amount: 300_000, paidAt: utcDate(2026, 8, 10) },
      { amount: 200_000, paidAt: utcDate(2026, 8, 20) },
    ]);
    expect(rows[0]?.allocation).toMatchObject({ carriedOver: 300_000, lateFee: 0, rent: 0 });
    expect(rows[1]?.allocation).toMatchObject({
      carriedOver: 0,
      lateFee: 15_500,
      maintenance: 50_000,
      rent: 134_500,
    });
    // 각 행의 배분 합은 그 납부액과 같다
    const second = rows[1]?.allocation;
    expect(
      (second?.carriedOver ?? 0) +
        (second?.lateFee ?? 0) +
        (second?.maintenance ?? 0) +
        (second?.rent ?? 0),
    ).toBe(200_000);
  });

  test("paidAt 순서가 뒤섞여 들어와도 시간순으로 충당한다", () => {
    const rows = allocatePayments(amounts, [
      { amount: 200_000, paidAt: utcDate(2026, 8, 20) },
      { amount: 300_000, paidAt: utcDate(2026, 8, 10) },
    ]);
    expect(rows[0]?.payment.amount).toBe(300_000);
    expect(rows[0]?.allocation.carriedOver).toBe(300_000);
  });
});

describe("describeCharge — 표시용 분해", () => {
  test("네 줄을 표시 순서(월세·관리비·이월·연체료)로 돌려준다", () => {
    const breakdown = describeCharge(
      {
        dueDate: utcDate(2026, 8, 5),
        rentAmount: 650_000,
        maintenanceAmount: 50_000,
        carriedOverAmount: 300_000,
        lateFeeAmount: 15_000,
        totalDue: 1_015_000,
        paidAmount: 0,
      },
      utcDate(2026, 9, 1),
    );
    expect(breakdown.lines.map((line) => [line.key, line.amount])).toEqual([
      ["RENT", 650_000],
      ["MAINTENANCE", 50_000],
      ["CARRY_OVER", 300_000],
      ["LATE_FEE", 15_000],
    ]);
    expect(breakdown.lines[0]?.label).toBe("월세");
    expect(breakdown.totalDue).toBe(1_015_000);
    expect(breakdown.outstanding).toBe(1_015_000);
    expect(breakdown.status).toBe("OVERDUE");
    expect(breakdown.overdueDays).toBe(27);
  });

  test("totalDue 를 안 주면 항목 합으로 계산한다", () => {
    const breakdown = describeCharge(
      {
        dueDate: utcDate(2026, 9, 5),
        rentAmount: 650_000,
        maintenanceAmount: 50_000,
        carriedOverAmount: 0,
        lateFeeAmount: 0,
      },
      utcDate(2026, 9, 1),
    );
    expect(breakdown.totalDue).toBe(700_000);
    expect(breakdown.status).toBe("SCHEDULED");
    expect(breakdown.overdueDays).toBe(0);
  });

  test("부분납은 줄마다 충당액이 보인다", () => {
    const breakdown = describeCharge(
      {
        dueDate: utcDate(2026, 7, 5),
        rentAmount: 650_000,
        maintenanceAmount: 50_000,
        carriedOverAmount: 0,
        lateFeeAmount: 0,
        totalDue: 700_000,
        paidAmount: 400_000,
      },
      utcDate(2026, 9, 1),
    );
    expect(breakdown.status).toBe("PARTIALLY_PAID");
    expect(breakdown.outstanding).toBe(300_000);
    expect(breakdown.lines.find((line) => line.key === "MAINTENANCE")?.paid).toBe(50_000);
    expect(breakdown.lines.find((line) => line.key === "RENT")?.paid).toBe(350_000);
  });
});

describe("계약 만기 창", () => {
  const asOf = utcDate(2026, 9, 1);

  test("90일 이내면 대상", () => {
    expect(isExpiringWithin(utcDate(2026, 11, 30), asOf)).toBe(true); // 정확히 90일
    expect(isExpiringWithin(utcDate(2026, 9, 1), asOf)).toBe(true); // 오늘 만기
    expect(isExpiringWithin(utcDate(2026, 12, 1), asOf)).toBe(false); // 91일
  });

  test("이미 지난 만기는 제외", () => {
    expect(isExpiringWithin(utcDate(2026, 8, 31), asOf)).toBe(false);
  });

  test("시드의 201호 계약(2027-02-28 만기)은 아직 대상이 아니다", () => {
    expect(isExpiringWithin(utcDate(2027, 2, 28), asOf)).toBe(false);
  });
});
