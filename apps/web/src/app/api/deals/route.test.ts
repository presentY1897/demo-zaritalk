/**
 * `GET /api/deals` API 테스트 (T4.4) — Route Handler 를 `Request` 로 직접 호출한다.
 *
 * 여기서 보는 것: **공개 조회**(비로그인 200) · 지역·유형 필터 · 단지 검색 · 추이 ·
 * **커서 경계에서 중복·누락 없음** · 다른 지역/탭 커서 400 · **미수집 지역 온디맨드 트리거**.
 */
import { prisma } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetOnDemandCooldown } from "@/features/deals/queries";
import {
  createRealTransaction,
  mockMolitFetch,
  readDealFixture,
} from "@/features/deals/testing";
import type { DealListResult } from "@/features/deals/types";
import { GET } from "./route";

const RENT = readDealFixture("rent-11200-202607");
const TRADE = readDealFixture("trade-11200-202607");
const EMPTY = readDealFixture("empty");

function request(query: string): Request {
  return new Request(`http://localhost:3000/api/deals${query}`);
}

async function read(query: string): Promise<{ status: number; body: DealListResult }> {
  const response = await GET(request(query));
  return { status: response.status, body: (await response.json()) as DealListResult };
}

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetOnDemandCooldown();
  // 테스트 환경에는 키가 없다 — 온디맨드 수집이 실호출로 새지 않게 못 박는다
  vi.stubEnv("DATA_GO_KR_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("공개 조회 — 로그인이 필요 없다", () => {
  test("비로그인도 200 이다", async () => {
    await createRealTransaction({ aptName: "센트라스" });
    const { status, body } = await read("?lawdCd=11200&type=SALE");
    expect(status).toBe(200);
    expect(body.deals).toHaveLength(1);
    expect(body.region).toEqual({ code: "11200", name: "성동구", label: "서울 성동구" });
  });

  test("파라미터를 생략하면 성동구 매매 탭", async () => {
    const { body } = await read("");
    expect(body.region.code).toBe("11200");
    expect(body.dealType).toBe("SALE");
  });
});

describe("필터", () => {
  beforeEach(async () => {
    await createRealTransaction({ dealType: "SALE", aptName: "센트라스", price: 249_000 });
    await createRealTransaction({ dealType: "JEONSE", aptName: "센트라스", deposit: 85_000 });
    await createRealTransaction({ dealType: "WOLSE", aptName: "강변현대", deposit: 3_000, monthlyRent: 55 });
    await createRealTransaction({ lawdCd: "11680", dealType: "SALE", aptName: "래미안" });
  });

  test("유형 탭이 목록을 가른다", async () => {
    expect((await read("?lawdCd=11200&type=SALE")).body.deals).toHaveLength(1);
    expect((await read("?lawdCd=11200&type=JEONSE")).body.deals).toHaveLength(1);
    expect((await read("?lawdCd=11200&type=WOLSE")).body.deals).toHaveLength(1);
  });

  test("지역이 다르면 섞이지 않는다", async () => {
    const { body } = await read("?lawdCd=11680&type=SALE");
    expect(body.deals.map((deal) => deal.aptName)).toEqual(["래미안"]);
  });

  test("단지 검색(q)은 부분일치", async () => {
    const { body } = await read("?lawdCd=11200&type=SALE&q=센트");
    expect(body.deals).toHaveLength(1);
    expect((await read("?lawdCd=11200&type=SALE&q=없는단지")).body.deals).toEqual([]);
  });

  test("단지 지정(apt)은 완전일치이고 추이 차트 대상이 된다", async () => {
    const { body } = await read("?lawdCd=11200&type=SALE&apt=센트라스");
    expect(body.deals).toHaveLength(1);
    expect(body.trend.apartmentName).toBe("센트라스");
    expect(body.trend.points).toHaveLength(1);
    expect(body.trend.points[0]).toMatchObject({ count: 1, avgAmount: 249_000 });
  });

  test("단지를 고르지 않으면 지역 전체 추이", async () => {
    const { body } = await read("?lawdCd=11200&type=SALE");
    expect(body.trend.apartmentName).toBeNull();
  });

  test("단지 목록은 거래 수 내림차순으로 실려 온다(구독 시트가 쓴다)", async () => {
    await createRealTransaction({ dealType: "SALE", aptName: "센트라스", price: 250_000 });
    const { body } = await read("?lawdCd=11200&type=SALE");
    expect(body.apartments[0]).toEqual({ name: "센트라스", count: 2 });
  });

  test("금액은 **만원 단위 그대로** 내려간다", async () => {
    const { body } = await read("?lawdCd=11200&type=WOLSE");
    expect(body.deals[0]).toMatchObject({ deposit: 3_000, monthlyRent: 55, price: null });
  });
});

describe("커서 페이지네이션", () => {
  /** 같은 날짜 5건 + 다른 날짜 5건 — 동점 경계에서 id 가 정렬을 닫는지 본다 */
  async function seedTen() {
    for (let index = 0; index < 5; index += 1) {
      await createRealTransaction({ dealType: "SALE", aptName: `동점${index}`, dealDate: [2026, 7, 14] });
    }
    for (let index = 0; index < 5; index += 1) {
      await createRealTransaction({
        dealType: "SALE",
        aptName: `다른날${index}`,
        dealDate: [2026, 7, 1 + index],
      });
    }
  }

  test("페이지를 이어 읽어도 중복·누락이 없다 (거래일이 전부 동점인 경계 포함)", async () => {
    await seedTen();

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const query: string = `?lawdCd=11200&type=SALE&limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const { body }: { body: DealListResult } = await read(query);
      seen.push(...body.deals.map((deal) => deal.id));
      cursor = body.nextCursor;
      if (!cursor) break;
    }

    expect(seen).toHaveLength(10);
    expect(new Set(seen).size).toBe(10);
    const all = await prisma.realTransaction.findMany({ select: { id: true } });
    expect(new Set(seen)).toEqual(new Set(all.map((row) => row.id)));
  });

  test("마지막 페이지의 nextCursor 는 null", async () => {
    await createRealTransaction({ dealType: "SALE" });
    const { body } = await read("?lawdCd=11200&type=SALE&limit=20");
    expect(body.nextCursor).toBeNull();
  });

  test("다른 탭의 커서는 400", async () => {
    await seedTen();
    const { body } = await read("?lawdCd=11200&type=SALE&limit=3");
    const response = await GET(
      request(`?lawdCd=11200&type=JEONSE&cursor=${encodeURIComponent(body.nextCursor!)}`),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  test("다른 지역의 커서도 400", async () => {
    await seedTen();
    const { body } = await read("?lawdCd=11200&type=SALE&limit=3");
    const response = await GET(
      request(`?lawdCd=11680&type=SALE&cursor=${encodeURIComponent(body.nextCursor!)}`),
    );
    expect(response.status).toBe(400);
  });

  test("깨진 커서는 400 — 조용히 첫 페이지로 되돌리지 않는다", async () => {
    const response = await GET(request("?lawdCd=11200&type=SALE&cursor=쓰레기"));
    expect(response.status).toBe(400);
  });
});

describe("검증", () => {
  test("모르는 지역은 400", async () => {
    const response = await GET(request("?lawdCd=99999"));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  test("모르는 유형은 400", async () => {
    expect((await GET(request("?type=RENT"))).status).toBe(400);
  });

  test("limit 범위 밖은 400", async () => {
    expect((await GET(request("?limit=0"))).status).toBe(400);
    expect((await GET(request("?limit=51"))).status).toBe(400);
  });
});

describe("온디맨드 트리거 — 미수집 지역 첫 조회", () => {
  test("수집분이 있으면 국토부를 부르지 않는다 (캐시 우선)", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", "test-key");
    await createRealTransaction({ dealType: "SALE" });
    const calls = mockMolitFetch({ TRADE: { xml: TRADE } });

    const { body } = await read("?lawdCd=11200&type=SALE");
    expect(calls).toHaveLength(0);
    expect(body.sync).toMatchObject({ triggered: false, reason: "CACHE_HIT" });
  });

  test("비어 있으면 최근 3개월을 긁어 와 목록에 담는다", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", "test-key");
    // fixture 는 2026-07 자료다 — 그 달에만 실어 주고 나머지 달은 빈 응답으로 둔다
    const forJuly = (fixture: string) => (url: URL) =>
      url.searchParams.get("DEAL_YMD") === "202607" && url.searchParams.get("pageNo") === "1"
        ? { xml: fixture }
        : { xml: EMPTY };
    const calls = mockMolitFetch({ TRADE: forJuly(TRADE), RENT: forJuly(RENT) });

    const { body } = await read("?lawdCd=11200&type=SALE&limit=50");
    expect(calls.length).toBeGreaterThan(0);
    expect(body.sync.triggered).toBe(true);
    expect(body.sync.months).toHaveLength(3);
    expect(body.sync.months).toContain("202607");
    // 매매 20건이 목록에 뜨고, 전월세 30건도 함께 저장돼 있다
    expect(body.deals).toHaveLength(20);
    expect(await prisma.realTransaction.count()).toBe(50);
  });

  test("키가 없으면 부르지 않고 NO_KEY 로 알려 준다", async () => {
    const calls = mockMolitFetch({ TRADE: { xml: TRADE } });
    const { body } = await read("?lawdCd=11200&type=SALE");
    expect(calls).toHaveLength(0);
    expect(body.sync).toMatchObject({ triggered: false, reason: "NO_KEY" });
    expect(body.deals).toEqual([]);
  });

  test("쿨다운 — 연달아 열어도 두 번 부르지 않는다", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", "test-key");
    const calls = mockMolitFetch({ TRADE: { xml: EMPTY }, RENT: { xml: EMPTY } });

    const first = await read("?lawdCd=11680&type=SALE");
    expect(first.body.sync.triggered).toBe(true);
    const callsAfterFirst = calls.length;

    const second = await read("?lawdCd=11680&type=SALE");
    expect(second.body.sync).toMatchObject({ triggered: false, reason: "COOLDOWN" });
    expect(calls.length).toBe(callsAfterFirst);
  });

  test("**커서를 들고 오는 요청에서는 트리거하지 않는다**", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", "test-key");
    await createRealTransaction({ dealType: "SALE", aptName: "가" });
    await createRealTransaction({ dealType: "SALE", aptName: "나", dealDate: [2026, 7, 1] });
    const { body } = await read("?lawdCd=11200&type=SALE&limit=1");

    const calls = mockMolitFetch({ TRADE: { xml: TRADE } });
    const next = await read(
      `?lawdCd=11200&type=SALE&limit=1&cursor=${encodeURIComponent(body.nextCursor!)}`,
    );
    expect(calls).toHaveLength(0);
    expect(next.body.sync.triggered).toBe(false);
  });

  test("국토부가 죽어 있어도 200 + 빈 목록으로 뜬다", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", "test-key");
    mockMolitFetch({ TRADE: { status: 500, xml: "" }, RENT: { status: 500, xml: "" } });
    const { status, body } = await read("?lawdCd=11200&type=SALE");
    expect(status).toBe(200);
    expect(body.sync).toMatchObject({ triggered: true, reason: "FAILED" });
    expect(body.deals).toEqual([]);
  });
});
