/**
 * `POST·GET /api/cron/daily` API 테스트 (T1.4) — Route Handler 를 `Request` 로 직접 호출한다.
 *
 * 최소 테스트 축 ⑥ **크론 무인증 401** 이 여기 있다.
 * 크론 로직 자체의 검증은 `@/lib/rent/cron-runner.test.ts`(실행 시각 고정) 담당이고,
 * 이 파일은 **인증과 응답 포장**, 그리고 라우트를 통한 한 번의 실제 실행만 본다.
 */
import { LeaseStatus, prisma, ProfileType } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createRealTransaction,
  mockMolitFetch,
  readDealFixture,
} from "@/features/deals/testing";
import { addDays, kstToday, kstYearMonth } from "@/lib/rent";
import { CRON_SECRET_HEADER } from "./auth";
import { GET, POST } from "./route";

const SECRET = "test-cron-secret";
const ORIGINAL_SECRET = process.env.CRON_SECRET;

const url = "http://localhost:3000/api/cron/daily";

function request(headers: Record<string, string> = {}, method = "POST"): Request {
  return new Request(url, { method, headers });
}

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
});

describe("축 ⑥ 무인증 401", () => {
  test("헤더가 아예 없으면 401", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("시크릿이 틀리면 401", async () => {
    const response = await POST(request({ [CRON_SECRET_HEADER]: "wrong" }));
    expect(response.status).toBe(401);
  });

  test("길이만 같고 값이 다른 시크릿도 401", async () => {
    const response = await POST(request({ [CRON_SECRET_HEADER]: "x".repeat(SECRET.length) }));
    expect(response.status).toBe(401);
  });

  test("Bearer 토큰이 틀리면 401", async () => {
    const response = await POST(request({ authorization: "Bearer nope" }));
    expect(response.status).toBe(401);
  });

  test("CRON_SECRET 이 설정돼 있지 않으면 무조건 401 (열린 엔드포인트 방지)", async () => {
    delete process.env.CRON_SECRET;
    const response = await POST(request({ [CRON_SECRET_HEADER]: "anything" }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.message).toContain("CRON_SECRET");
  });

  test("401 이면 DB를 건드리지 않는다", async () => {
    await createActiveLease();
    await POST(request());
    expect(await prisma.rentCharge.count()).toBe(0);
  });
});

describe("인증 통과 경로", () => {
  test("x-cron-secret 헤더 (어드민 수동 트리거·curl)", async () => {
    const response = await POST(request({ [CRON_SECRET_HEADER]: SECRET }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("Authorization: Bearer (Vercel Cron)", async () => {
    const response = await POST(request({ authorization: `Bearer ${SECRET}` }));
    expect(response.status).toBe(200);
  });

  test("Bearer 는 대소문자를 가리지 않는다", async () => {
    const response = await POST(request({ authorization: `bearer ${SECRET}` }));
    expect(response.status).toBe(200);
  });

  test("GET 도 같은 일을 한다 — Vercel Cron 이 GET 으로 호출한다", async () => {
    const lease = await createActiveLease();
    const response = await GET(request({ authorization: `Bearer ${SECRET}` }, "GET"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.chargesCreated).toBe(1);

    const { year, month } = kstYearMonth();
    const charge = await prisma.rentCharge.findUnique({
      where: { leaseId_year_month: { leaseId: lease.id, year, month } },
    });
    expect(charge).toBeTruthy();
  });
});

describe("응답 본문", () => {
  test("무엇을 몇 건 처리했는지 담는다 (어드민 버튼이 그대로 보여 준다)", async () => {
    await createActiveLease();

    const first = await (await POST(request({ [CRON_SECRET_HEADER]: SECRET }))).json();
    expect(first).toMatchObject({ ok: true, chargesCreated: 1, chargesSkipped: 0 });
    expect(first.targetMonth).toEqual(kstYearMonth());
    expect(first.statusBreakdown).toEqual({
      SCHEDULED: expect.any(Number),
      PARTIALLY_PAID: expect.any(Number),
      PAID: expect.any(Number),
      OVERDUE: expect.any(Number),
    });

    // 라우트로 두 번 눌러도 멱등 (축 ①)
    const second = await (await POST(request({ [CRON_SECRET_HEADER]: SECRET }))).json();
    expect(second).toMatchObject({ chargesCreated: 0, chargesSkipped: 1 });
    expect(await prisma.rentCharge.count()).toBe(1);
  });
});

/**
 * 실거래가 수집(T4.3)이 같은 크론에 얹혀 있다 — **기존 원장 결과는 그대로**이고 `deals` 만 붙는다.
 * 국토부 호출은 fixture 로 mock 한다(크론 테스트가 네트워크를 타지 않게).
 */
describe("실거래가 수집 블록 (T4.3)", () => {
  test("키가 없으면 국토부를 부르지 않고 skipped 로 지나간다", async () => {
    delete process.env.DATA_GO_KR_API_KEY;
    const calls = mockMolitFetch({ TRADE: { xml: readDealFixture("empty") } });

    const body = await (await POST(request({ [CRON_SECRET_HEADER]: SECRET }))).json();
    expect(body.ok).toBe(true);
    expect(body.deals).toEqual({ skipped: "NO_KEY" });
    expect(calls).toHaveLength(0);
  });

  test("대상 지역이 없으면 호출 0회 — 원장 결과는 그대로다", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", "test-key");
    const calls = mockMolitFetch({ TRADE: { xml: readDealFixture("empty") } });
    await createActiveLease();

    const body = await (await POST(request({ [CRON_SECRET_HEADER]: SECRET }))).json();
    expect(body).toMatchObject({ ok: true, chargesCreated: 1 });
    expect(body.deals).toMatchObject({ skipped: null, regionsScanned: 0, requests: 0, created: 0 });
    expect(calls).toHaveLength(0);
  });

  test("수집분이 있는 지역을 스스로 골라 당월·전월을 훑는다", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", "test-key");
    await createRealTransaction({ lawdCd: "11200" });
    const calls = mockMolitFetch({
      TRADE: { xml: readDealFixture("empty") },
      RENT: { xml: readDealFixture("empty") },
    });

    const body = await (await POST(request({ [CRON_SECRET_HEADER]: SECRET }))).json();
    expect(body.deals).toMatchObject({ skipped: null, regionsScanned: 1, monthsScanned: 2 });
    // 지역 1 × 월 2 × 엔드포인트 2 = 4회
    expect(calls).toHaveLength(4);
    expect(new Set(calls.map((call) => call.url.searchParams.get("LAWD_CD")))).toEqual(
      new Set(["11200"]),
    );
  });

  test("국토부가 죽어도 원장 크론 결과는 그대로 나간다", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", "test-key");
    await createRealTransaction({ lawdCd: "11200" });
    await createActiveLease();
    mockMolitFetch({ TRADE: { status: 500, xml: "" }, RENT: { status: 500, xml: "" } });

    const response = await POST(request({ [CRON_SECRET_HEADER]: SECRET }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, chargesCreated: 1 });
    expect(body.deals.failed).toBe(4);
  });
});

/** 오늘이 계약기간 한가운데인 ACTIVE 계약 하나 — 실행 시각(실제 시계)에 좌우되지 않게 넉넉히 잡는다. */
async function createActiveLease() {
  const today = kstToday();
  const landlord = await prisma.user.create({
    data: {
      phone: "01011111111",
      name: "김임대",
      profiles: { create: { type: ProfileType.LANDLORD } },
    },
    include: { profiles: true },
  });
  const building = await prisma.building.create({
    data: {
      ownerProfileId: landlord.profiles[0]!.id,
      name: "행당해피빌",
      address: "서울 성동구 행당로 79",
      lat: 37.56152,
      lng: 127.03648,
      units: { create: [{ label: "201호" }] },
    },
    include: { units: true },
  });
  return prisma.lease.create({
    data: {
      unitId: building.units[0]!.id,
      tenantName: "박세입",
      tenantPhone: "01022222222",
      deposit: 20_000_000,
      monthlyRent: 650_000,
      maintenanceFee: 50_000,
      paymentDay: 5,
      // 만기 알림 창(90일) 밖으로 두어 이 테스트가 알림에 영향받지 않게 한다
      startDate: addDays(today, -365),
      endDate: addDays(today, 365),
      lateFeeRatePct: 5,
      status: LeaseStatus.ACTIVE,
    },
  });
}
