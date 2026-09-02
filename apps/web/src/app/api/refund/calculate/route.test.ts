import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { afterAll, beforeEach, expect, test, vi } from "vitest";
import type { RefundCalcResult } from "@/features/refund/calc";
import { POST } from "./route";

/**
 * 환급 계산 API (T2.3).
 *
 * **로그인 상태를 만들지 않는다** — 비로그인으로 계산되는 것이 이 엔드포인트의 전부다.
 *
 * "오늘"은 `Date` 만 가짜로 세워 고정한다(`toFake: ["Date"]`). 타이머는 진짜로 두므로
 * prisma·pg 가 정상 동작한다. 계산 규칙 자체의 경계값은 DB 없이 도는
 * `features/refund/calc.test.ts` 가 맡고, 여기서는 **검증·응답 규약**만 본다.
 */

/** 기준일 고정: KST 2026-09-02 (UTC 2026-09-01T15:00Z 이후면 KST 로는 9월 2일) */
const NOW = new Date("2026-09-02T05:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/refund/calculate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const VALID = {
  grossSalary: 48_000_000,
  monthlyRent: 500_000,
  startDate: "2025-01-01",
  endDate: "2025-12-31",
};

async function resultOf(body: unknown): Promise<RefundCalcResult> {
  const res = await post(body);
  expect(res.status).toBe(200);
  const json = (await res.json()) as { result: RefundCalcResult };
  return json.result;
}

test("비로그인으로 연도별 내역과 합계가 계산된다", async () => {
  const result = await resultOf(VALID);

  expect(result.asOf).toBe("2026-09-02");
  expect(result.retroRange).toEqual({ fromYear: 2022, toYear: 2026 });
  expect(result.creditRatePercent).toBe(17);
  expect(result.years).toHaveLength(1);
  expect(result.years[0]).toMatchObject({
    year: 2025,
    months: 12,
    paidRent: 6_000_000,
    eligibleRent: 6_000_000,
    cappedOutRent: 0,
    annualRentCap: 10_000_000,
    creditRatePercent: 17,
    creditAmount: 1_020_000,
  });
  expect(result.totals.creditAmount).toBe(1_020_000);
  expect(result.ineligibleReason).toBeNull();
  // 입력을 그대로 되돌려 준다 — T2.4 가 이 값을 신청서에 담는다
  expect(result.input).toEqual(VALID);
});

test("여러 해에 걸친 기간은 연도별로 쪼개져 나온다", async () => {
  const result = await resultOf({ ...VALID, startDate: "2024-07-01", endDate: "2025-06-30" });
  expect(result.years.map((row) => [row.year, row.months])).toEqual([
    [2024, 6],
    [2025, 6],
  ]);
  expect(result.totals.months).toBe(12);
});

test("0원·음수 금액은 400 VALIDATION_ERROR", async () => {
  for (const body of [
    { ...VALID, monthlyRent: 0 },
    { ...VALID, monthlyRent: -1 },
    { ...VALID, grossSalary: 0 },
    { ...VALID, grossSalary: -48_000_000 },
  ]) {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  }
});

test("zod 검증 — 타입·형식·필수값이 어긋나면 400", async () => {
  for (const body of [
    {}, // 전부 없음
    { ...VALID, monthlyRent: "550000" }, // 문자열 금액
    { ...VALID, grossSalary: 48_000_000.5 }, // 소수
    { ...VALID, startDate: "2025/01/01" }, // 형식 아님
    { ...VALID, endDate: "" },
    { ...VALID, monthlyRent: 3_000_000_000 }, // 상한 초과
    "not-json",
  ]) {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  }
});

test("기간 역전은 400", async () => {
  const res = await post({ ...VALID, startDate: "2025-12-31", endDate: "2025-01-01" });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error.code).toBe("VALIDATION_ERROR");
  expect(JSON.stringify(body.error.details)).toContain("임차 종료일은 시작일보다 빠를 수 없습니다.");
});

test("달력에 없는 날짜는 400", async () => {
  const res = await post({ ...VALID, startDate: "2025-02-31" });
  expect(res.status).toBe(400);
  expect((await res.json()).error.message).toContain("존재하지 않는 날짜");
});

test("미래 시작일은 400 — 아직 낸 월세가 없다", async () => {
  const res = await post({ ...VALID, startDate: "2026-09-03", endDate: "2027-09-02" });
  expect(res.status).toBe(400);
  expect((await res.json()).error.message).toContain("미래");

  // 기준일 당일은 통과한다(경계)
  const sameDay = await post({ ...VALID, startDate: "2026-09-02", endDate: "2027-09-01" });
  expect(sameDay.status).toBe(200);
});

test("소급 5년보다 오래된 기간은 400 이 아니라 0원 + 사유", async () => {
  const result = await resultOf({ ...VALID, startDate: "2019-01-01", endDate: "2019-12-31" });
  expect(result.years).toEqual([]);
  expect(result.totals.creditAmount).toBe(0);
  expect(result.ineligibleReason).toBe("NO_ELIGIBLE_MONTHS");
});

test("총급여 8,000만원 초과는 400 이 아니라 대상 외 결과", async () => {
  const result = await resultOf({ ...VALID, grossSalary: 80_000_001 });
  expect(result.creditRatePercent).toBe(0);
  expect(result.totals.creditAmount).toBe(0);
  expect(result.totals.paidRent).toBe(6_000_000);
  expect(result.ineligibleReason).toBe("GROSS_SALARY_OVER");
});

test("계산은 아무것도 저장하지 않는다", async () => {
  assertTestDatabase();
  await resetDb();

  expect((await post(VALID)).status).toBe(200);

  expect(await prisma.refundApplication.count()).toBe(0);
  expect(await prisma.trackingEvent.count()).toBe(0);
  expect(await prisma.messageLog.count()).toBe(0);
});
