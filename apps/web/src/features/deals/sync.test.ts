/**
 * 실거래가 수집 러너 (T4.3) — DB를 쓰는 테스트.
 *
 * 최소 테스트 축 ③ **upsert 멱등(재실행 중복 없음)** 과 ④ **API 오류 부분 실패 격리**,
 * 그리고 T4.4 의 **sync → 구독자 MessageLog** 통합이 여기 있다.
 * 국토부 호출은 전부 fixture 로 mock 한다 — 실호출은 `molit.test.ts` 의 태그드 테스트 하나뿐이다.
 */
import { MessageKind, prisma, ProfileType, RealDealType } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { normalizeDeals } from "./parse";
import { resolveCronRegions, runDealsSync } from "./sync";
import { createRealTransaction, mockMolitFetch, readDealFixture } from "./testing";
import { parseXmlItems } from "./xml";

const RENT = readDealFixture("rent-11200-202607");
const TRADE = readDealFixture("trade-11200-202607");
const EMPTY = readDealFixture("empty");
const FAULT = readDealFixture("fault-service-key");

/** fixture 한 장 = 한 페이지, 그다음은 빈 페이지(실제 응답의 totalCount 가 크기 때문) */
const rentPages = () => [{ xml: RENT }, { xml: EMPTY }];
const tradePages = () => [{ xml: TRADE }, { xml: EMPTY }];

/** fixture 를 우리 파서로 돌렸을 때 나오는 기대 건수 — 테스트가 스스로 계산한다 */
const RENT_EXPECTED = normalizeDeals(parseXmlItems(RENT), { lawdCd: "11200", endpoint: "RENT" });
const TRADE_EXPECTED = normalizeDeals(parseXmlItems(TRADE), { lawdCd: "11200", endpoint: "TRADE" });

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  vi.stubEnv("DATA_GO_KR_API_KEY", "test-decoded-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function createSubscriber(
  phone: string,
  name: string,
  alert: { lawdCd: string; aptName?: string | null; dealType?: RealDealType | null },
) {
  const user = await prisma.user.create({
    data: { phone, name, profiles: { create: { type: ProfileType.TENANT } } },
    include: { profiles: true },
  });
  const profile = user.profiles[0]!;
  await prisma.transactionAlert.create({
    data: {
      profileId: profile.id,
      lawdCd: alert.lawdCd,
      aptName: alert.aptName ?? null,
      dealType: alert.dealType ?? null,
    },
  });
  return { user, profile };
}

describe("축 ③ upsert 멱등 — 재실행 중복 없음", () => {
  test("같은 (지역·월)을 두 번 수집해도 행이 늘지 않는다", async () => {
    mockMolitFetch({ RENT: rentPages(), TRADE: tradePages() });
    const first = await runDealsSync({ lawdCds: ["11200"], months: ["202607"] });

    expect(first.created).toBe(RENT_EXPECTED.deals.length + TRADE_EXPECTED.deals.length);
    expect(first.skipped).toBe(0);
    expect(first.failures).toEqual([]);
    const afterFirst = await prisma.realTransaction.count();
    expect(afterFirst).toBe(first.created);

    // 두 번째 실행 — 같은 응답을 다시 받는다
    vi.unstubAllGlobals();
    mockMolitFetch({ RENT: rentPages(), TRADE: tradePages() });
    const second = await runDealsSync({ lawdCds: ["11200"], months: ["202607"] });

    expect(second.created).toBe(0);
    expect(second.skipped).toBe(first.created);
    expect(await prisma.realTransaction.count()).toBe(afterFirst);
  });

  test("세 번을 돌려도 마찬가지다", async () => {
    for (let round = 0; round < 3; round += 1) {
      vi.unstubAllGlobals();
      mockMolitFetch({ RENT: rentPages() });
      await runDealsSync({ lawdCds: ["11200"], months: ["202607"], dealTypes: ["JEONSE", "WOLSE"] });
    }
    expect(await prisma.realTransaction.count()).toBe(RENT_EXPECTED.deals.length);
  });

  test("**내용이 같은 두 행은 둘 다 저장된다** — 서명 dedupe 가 아니라 개수 맞추기다", async () => {
    mockMolitFetch({ RENT: rentPages() });
    await runDealsSync({ lawdCds: ["11200"], months: ["202607"], dealTypes: ["JEONSE", "WOLSE"] });

    // 실호출 응답에 두 번 들어 있던 행(강변현대 81.8㎡ 19층 보증금 6억)
    const rows = await prisma.realTransaction.findMany({
      where: { aptName: "강변현대", areaM2: 81.8, floor: 19, deposit: 60_000 },
    });
    expect(rows).toHaveLength(2);

    // 다시 돌려도 여전히 2건이다(3건이 되지도, 1건으로 줄지도 않는다)
    vi.unstubAllGlobals();
    mockMolitFetch({ RENT: rentPages() });
    await runDealsSync({ lawdCds: ["11200"], months: ["202607"], dealTypes: ["JEONSE", "WOLSE"] });
    expect(
      await prisma.realTransaction.count({
        where: { aptName: "강변현대", areaM2: 81.8, floor: 19, deposit: 60_000 },
      }),
    ).toBe(2);
  });

  test("이미 한 줄이 들어 있으면 나머지만 만든다", async () => {
    const seed = RENT_EXPECTED.deals[0]!;
    await createRealTransaction({
      lawdCd: seed.lawdCd,
      dealType: seed.dealType,
      aptName: seed.aptName,
      areaM2: seed.areaM2,
      floor: seed.floor,
      dealDate: [
        seed.dealDate.getUTCFullYear(),
        seed.dealDate.getUTCMonth() + 1,
        seed.dealDate.getUTCDate(),
      ],
      price: seed.price,
      deposit: seed.deposit,
      monthlyRent: seed.monthlyRent,
      builtYear: seed.builtYear,
    });

    mockMolitFetch({ RENT: rentPages() });
    const result = await runDealsSync({
      lawdCds: ["11200"],
      months: ["202607"],
      dealTypes: ["JEONSE", "WOLSE"],
    });

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(RENT_EXPECTED.deals.length - 1);
    expect(await prisma.realTransaction.count()).toBe(RENT_EXPECTED.deals.length);
  });

  test("요청한 달 밖의 행은 저장하지 않는다 — 그래야 달 사이에 멱등이 유지된다", async () => {
    // 8월을 요청했는데 7월 거래가 담긴 응답이 왔다고 치자(국토부는 이러지 않지만 방어한다)
    mockMolitFetch({ RENT: [{ xml: RENT }, { xml: EMPTY }, { xml: RENT }, { xml: EMPTY }] });
    const result = await runDealsSync({
      lawdCds: ["11200"],
      months: ["202607", "202608"],
      dealTypes: ["JEONSE", "WOLSE"],
    });
    expect(result.created).toBe(RENT_EXPECTED.deals.length);
    // 8월 조각이 받은 7월 행 30건은 전부 «범위 밖» 으로 버려진다
    expect(result.discarded).toBe(RENT_EXPECTED.discarded * 2 + RENT_EXPECTED.deals.length);
    expect(await prisma.realTransaction.count()).toBe(RENT_EXPECTED.deals.length);
  });
});

describe("축 ④ API 오류 — 부분 실패 격리", () => {
  test("매매가 죽어도 전월세는 저장된다", async () => {
    mockMolitFetch({ TRADE: { status: 403, xml: FAULT }, RENT: rentPages() });
    const result = await runDealsSync({ lawdCds: ["11200"], months: ["202607"] });

    expect(result.created).toBe(RENT_EXPECTED.deals.length);
    expect(result.failures).toEqual([
      { lawdCd: "11200", dealYm: "202607", endpoint: "TRADE", reason: "UNAUTHORIZED", status: 403 },
    ]);
    expect(await prisma.realTransaction.count({ where: { dealType: RealDealType.SALE } })).toBe(0);
    expect(
      await prisma.realTransaction.count({ where: { dealType: { not: RealDealType.SALE } } }),
    ).toBe(RENT_EXPECTED.deals.length);
  });

  test("한 지역이 죽어도 다른 지역은 저장된다", async () => {
    // 첫 호출(11200 전월세)은 500, 두 번째(11680 전월세)는 성공
    mockMolitFetch({ RENT: [{ status: 500, xml: "" }, { xml: RENT }, { xml: EMPTY }] });
    const result = await runDealsSync({
      lawdCds: ["11200", "11680"],
      months: ["202607"],
      dealTypes: ["JEONSE", "WOLSE"],
    });

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ lawdCd: "11200", reason: "UPSTREAM", status: 500 });
    expect(await prisma.realTransaction.count({ where: { lawdCd: "11680" } })).toBe(
      RENT_EXPECTED.deals.length,
    );
    expect(await prisma.realTransaction.count({ where: { lawdCd: "11200" } })).toBe(0);
  });

  test("전부 실패해도 던지지 않고 결과를 돌려준다", async () => {
    mockMolitFetch({ RENT: { status: 500, xml: "" }, TRADE: { status: 500, xml: "" } });
    const result = await runDealsSync({ lawdCds: ["11200"], months: ["202607"] });
    expect(result.ok).toBe(true);
    expect(result.created).toBe(0);
    expect(result.failures).toHaveLength(2);
  });

  test("키가 없으면 NO_KEY 로 실패하고 DB를 건드리지 않는다", async () => {
    vi.stubEnv("DATA_GO_KR_API_KEY", "");
    const calls = mockMolitFetch({ RENT: rentPages() });
    const result = await runDealsSync({ lawdCds: ["11200"], months: ["202607"] });
    expect(calls).toHaveLength(0);
    expect(result.failures.every((failure) => failure.reason === "NO_KEY")).toBe(true);
    expect(await prisma.realTransaction.count()).toBe(0);
  });
});

describe("정규화 결과가 그대로 저장된다", () => {
  test("만원 단위·면적·층·거래일", async () => {
    mockMolitFetch({ TRADE: tradePages() });
    await runDealsSync({ lawdCds: ["11200"], months: ["202607"], dealTypes: ["SALE"] });

    const row = await prisma.realTransaction.findFirst({ where: { aptName: "센트라스" } });
    expect(row).toMatchObject({
      lawdCd: "11200",
      dealType: RealDealType.SALE,
      areaM2: 84.96,
      floor: 9,
      price: 249_000,
      deposit: null,
      monthlyRent: null,
      builtYear: 2016,
    });
    expect(row!.dealDate.toISOString()).toBe("2026-07-29T00:00:00.000Z");
    // 원본 item 을 raw 에 남긴다
    expect((row!.raw as Record<string, string>).dealingGbn).toBe("중개거래");
  });

  test("버린 행 수가 결과에 실린다", async () => {
    mockMolitFetch({ RENT: [{ xml: readDealFixture("edge-cases") }, { xml: EMPTY }] });
    const result = await runDealsSync({
      lawdCds: ["11200"],
      months: ["202607"],
      dealTypes: ["JEONSE", "WOLSE"],
    });
    expect(result.discarded).toBe(3);
    expect(result.created).toBe(3);
  });
});

describe("구독자 알림 (T4.4) — 구독 1건 × 실행 1회 = MessageLog 1건", () => {
  test("지역 구독자에게 한 건, 본문에 거래가 실린다", async () => {
    await createSubscriber("01099990001", "구독자", { lawdCd: "11200" });

    mockMolitFetch({ TRADE: tradePages() });
    const result = await runDealsSync({ lawdCds: ["11200"], months: ["202607"], dealTypes: ["SALE"] });

    expect(result.alertsSent).toBe(1);
    const logs = await prisma.messageLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ kind: MessageKind.ETC, toPhone: "01099990001" });
    expect(logs[0]!.title).toContain("서울 성동구");
    expect(logs[0]!.title).toContain(`${TRADE_EXPECTED.deals.length}건`);
    expect(logs[0]!.body).toContain("외 ");
  });

  test("단지·유형까지 맞아야 간다", async () => {
    await createSubscriber("01099990002", "센트라스매매", {
      lawdCd: "11200",
      aptName: "센트라스",
      dealType: RealDealType.SALE,
    });
    await createSubscriber("01099990003", "센트라스전세", {
      lawdCd: "11200",
      aptName: "센트라스",
      dealType: RealDealType.JEONSE,
    });
    await createSubscriber("01099990004", "다른지역", { lawdCd: "11680" });

    mockMolitFetch({ TRADE: tradePages() });
    const result = await runDealsSync({ lawdCds: ["11200"], months: ["202607"], dealTypes: ["SALE"] });

    expect(result.alertsSent).toBe(1);
    const logs = await prisma.messageLog.findMany();
    expect(logs.map((log) => log.toPhone)).toEqual(["01099990002"]);
  });

  test("**새로 저장된 것이 없으면 알림도 없다**(재실행에 알림이 다시 가지 않는다)", async () => {
    await createSubscriber("01099990005", "구독자", { lawdCd: "11200" });

    mockMolitFetch({ TRADE: tradePages() });
    await runDealsSync({ lawdCds: ["11200"], months: ["202607"], dealTypes: ["SALE"] });
    expect(await prisma.messageLog.count()).toBe(1);

    vi.unstubAllGlobals();
    mockMolitFetch({ TRADE: tradePages() });
    const second = await runDealsSync({
      lawdCds: ["11200"],
      months: ["202607"],
      dealTypes: ["SALE"],
    });
    expect(second.created).toBe(0);
    expect(second.alertsSent).toBe(0);
    expect(await prisma.messageLog.count()).toBe(1);
  });

  test("notify: false 면 알림을 만들지 않는다", async () => {
    await createSubscriber("01099990006", "구독자", { lawdCd: "11200" });
    mockMolitFetch({ TRADE: tradePages() });
    const result = await runDealsSync({
      lawdCds: ["11200"],
      months: ["202607"],
      dealTypes: ["SALE"],
      notify: false,
    });
    expect(result.alertsSent).toBe(0);
    expect(await prisma.messageLog.count()).toBe(0);
  });
});

describe("크론 대상 지역", () => {
  test("구독 지역 + 최근 수집분이 있는 지역, 구독이 먼저", async () => {
    await createSubscriber("01099990007", "구독자", { lawdCd: "11680" });
    await createRealTransaction({ lawdCd: "11200" });

    expect(await resolveCronRegions()).toEqual(["11680", "11200"]);
  });

  test("오래된 수집분만 있는 지역은 빠진다", async () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await createRealTransaction({ lawdCd: "11200", fetchedAt: old });
    expect(await resolveCronRegions()).toEqual([]);
  });

  test("상수표에 없는 코드는 건너뛴다", async () => {
    await createRealTransaction({ lawdCd: "99999" });
    expect(await resolveCronRegions()).toEqual([]);
  });

  test("상한을 넘으면 자른다", async () => {
    await createSubscriber("01099990008", "가", { lawdCd: "11110" });
    await createSubscriber("01099990009", "나", { lawdCd: "11140" });
    expect(await resolveCronRegions({ regionLimit: 1 })).toHaveLength(1);
  });

  test("대상이 없으면 국토부를 부르지 않는다", async () => {
    const calls = mockMolitFetch({ RENT: rentPages(), TRADE: tradePages() });
    const result = await runDealsSync({ months: ["202607"] });
    expect(result.regionsScanned).toBe(0);
    expect(calls).toHaveLength(0);
    expect(result.created).toBe(0);
  });
});
