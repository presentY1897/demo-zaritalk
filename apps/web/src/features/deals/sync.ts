/**
 * 실거래가 수집 러너 — **`features/deals` 에서 DB를 아는 유일한 쓰기 모듈** (T4.3).
 *
 * 파싱·정규화·매칭 규칙은 순수 모듈(`./parse.ts`·`./alerts.ts`)에 있고 여기는 **읽고 쓰는 순서**만
 * 담당한다(T1.4 `lib/rent/cron-runner.ts` 와 같은 층 나눔).
 *
 * ```
 * 크론(POST /api/cron/daily) ─┐
 * 어드민 수동(POST /api/deals/sync) ─┼─▶ runDealsSync()  ─▶ 국토부 API ─▶ upsert ─▶ 구독자 알림
 * 온디맨드(GET /api/deals 내부 호출) ─┘
 * ```
 *
 * ## 멱등 — 서명 개수를 맞춘다
 *
 * 국토부 응답에는 **행을 가리키는 고유 id 가 없다.** 그래서 "같은 거래" 는 내용 서명
 * (`./parse.ts` 의 `dealSignature`: 지역·유형·단지·면적·층·거래일·금액·건축년도)으로 정의한다.
 *
 * 그런데 **내용이 완전히 같은 행이 한 응답에 두 번 오는 일이 실제로 있다**(실호출 확인:
 * 성동구 2026-07 전월세에 `강변현대 81.8㎡ 19층 6억` 이 두 줄). 서명으로 dedupe 해 버리면
 * 거래 건수가 줄어 시세 통계가 틀어진다. 그래서:
 *
 * 1. 받은 행을 서명별로 세어 `{서명 → 개수}` 를 만든다.
 * 2. DB 의 **그 달·그 지역·그 유형** 행도 같은 방식으로 센다.
 * 3. 부족한 만큼만 `createMany` 한다 — `max(0, 받은 개수 − 저장된 개수)`.
 *
 * 두 번 돌리면 2단계 개수가 이미 같아져 **0건 생성**이다. 이것이 "재실행 중복 없음" 의 정의다.
 *
 * > **DB 유니크 제약이 없다.** `RealTransaction` 에는 `@@index([lawdCd, dealType, dealDate])` 만
 * > 있고 유니크가 없어(스키마는 이 task 소유가 아니다) 멱등을 애플리케이션이 보장한다.
 * > 같은 (지역·월)을 **동시에** 두 번 수집하면 둘 다 "부족함" 을 보고 이중 삽입할 수 있어
 * > 프로세스 안에서는 `withSyncLock` 으로 줄을 세운다. 인스턴스가 여러 개면 그 보호가
 * > 닿지 않으므로, 진짜 방어는 스키마 유니크다 → task 문서의 "스키마가 필요했지만 안 만든 것".
 *
 * ## 부분 실패 격리
 *
 * 수집 단위는 **(지역 × 월 × 엔드포인트)** 하나다. 매매가 실패해도 전월세는 저장되고,
 * 7월이 실패해도 8월은 저장된다. 실패는 던지지 않고 `failures[]` 에 쌓여 응답에 그대로 실린다.
 */
import { MessageKind, prisma, RealDealType } from "@zari/db";
import { kstYearMonth } from "@/lib/rent";
import { findRegion, regionLabel } from "@/features/community/regions";
import { buildAlertMessage, matchDeals, type AlertMessageDeal } from "./alerts";
import { fetchMolitMonth } from "./molit";
import { dealSignature, type MolitEndpointKey, type NormalizedDeal } from "./parse";
import { CRON_MONTH_SPAN, monthRange, parseDealYm, recentDealYms } from "./period";
import type { DealSyncFailureDto, DealSyncResultDto, RealDealTypeValue } from "./types";

/** 엔드포인트 하나가 만들어 내는 거래 유형 */
const ENDPOINT_TYPES: Record<MolitEndpointKey, RealDealTypeValue[]> = {
  TRADE: ["SALE"],
  RENT: ["JEONSE", "WOLSE"],
};

/** 크론 한 번이 훑는 지역 수 상한 — 국토부 개발계정 일일 호출 한도를 넘지 않게 */
export const CRON_REGION_LIMIT = 20;
/** 크론 대상에 넣을 "최근 수집분" 의 기준 — 이 기간 안에 수집된 적 있는 지역 */
export const RECENT_REGION_DAYS = 30;

export type DealSyncOptions = {
  /** 지정하면 그 지역만. 생략하면 크론 대상(구독 지역 + 최근 수집 지역) */
  lawdCds?: readonly string[];
  /** `YYYYMM` 목록. 생략하면 당월 + 전월 */
  months?: readonly string[];
  /** 지정한 유형만 저장한다. 생략하면 전부 */
  dealTypes?: readonly RealDealTypeValue[];
  /** 시계 고정용(테스트) */
  now?: Date;
  /** 크론 대상 지역 상한 */
  regionLimit?: number;
  /** 구독자 알림(MessageLog) 생성 여부. 기본 true */
  notify?: boolean;
};

// ── 동시 실행 방지 ────────────────────────────────────────────────────────────
// 같은 (지역·월·엔드포인트)를 동시에 두 번 수집하면 둘 다 "없다" 고 판단해 이중 삽입한다.
// 프로세스 안에서는 진행 중인 약속을 공유해 줄을 세운다(온디맨드 요청이 몰릴 때가 그 경우다).
const inFlight = new Map<string, Promise<SegmentOutcome>>();

async function withSyncLock(
  key: string,
  run: () => Promise<SegmentOutcome>,
): Promise<SegmentOutcome> {
  const running = inFlight.get(key);
  if (running) return running;
  const promise = run().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

type SegmentOutcome = {
  requests: number;
  fetched: number;
  created: NormalizedDeal[];
  skipped: number;
  discarded: number;
  failure: DealSyncFailureDto | null;
};

const EMPTY_SEGMENT: SegmentOutcome = {
  requests: 0,
  fetched: 0,
  created: [],
  skipped: 0,
  discarded: 0,
  failure: null,
};

/** 서명 → 개수 */
function countBySignature(deals: readonly { signature: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const deal of deals) counts.set(deal.signature, (counts.get(deal.signature) ?? 0) + 1);
  return counts;
}

/**
 * (지역 × 월 × 엔드포인트) 한 조각을 수집해 저장한다. 실패는 `failure` 로 접어 돌려준다.
 */
async function syncSegment(input: {
  lawdCd: string;
  dealYm: string;
  endpoint: MolitEndpointKey;
  dealTypes: readonly RealDealTypeValue[];
}): Promise<SegmentOutcome> {
  const ym = parseDealYm(input.dealYm);
  if (!ym) {
    return {
      ...EMPTY_SEGMENT,
      failure: {
        lawdCd: input.lawdCd,
        dealYm: input.dealYm,
        endpoint: input.endpoint,
        reason: "INVALID_MONTH",
        status: null,
      },
    };
  }

  const fetched = await fetchMolitMonth({
    endpoint: input.endpoint,
    lawdCd: input.lawdCd,
    dealYm: input.dealYm,
  });

  if (!fetched.ok) {
    return {
      ...EMPTY_SEGMENT,
      requests: 1,
      failure: {
        lawdCd: input.lawdCd,
        dealYm: input.dealYm,
        endpoint: input.endpoint,
        reason: fetched.failure.reason,
        status: fetched.failure.status,
      },
    };
  }

  const wanted = new Set(input.dealTypes);
  const { start, end } = monthRange(ym);

  // 요청한 달·유형 밖의 행은 버린다. 국토부는 `DEAL_YMD` 안의 거래만 주지만, 벗어난 행이
  // 섞여 들어오면 **다른 달 조각이 그것을 자기 것으로 세지 못해** 멱등이 깨진다
  // (저장된 행을 세는 조회가 그 달 범위로 묶여 있기 때문이다). 범위를 여기서 닫아 둔다.
  let outOfScope = 0;
  const incoming = fetched.data.deals
    .filter((deal) => {
      if (!wanted.has(deal.dealType)) return false;
      if (deal.dealDate < start || deal.dealDate >= end) {
        outOfScope += 1;
        return false;
      }
      return true;
    })
    .map((deal) => ({ deal, signature: dealSignature(deal) }));

  const stored = await prisma.realTransaction.findMany({
    where: {
      lawdCd: input.lawdCd,
      dealType: { in: [...wanted].map((type) => RealDealType[type]) },
      dealDate: { gte: start, lt: end },
    },
    select: {
      dealType: true,
      aptName: true,
      areaM2: true,
      floor: true,
      dealDate: true,
      price: true,
      deposit: true,
      monthlyRent: true,
      builtYear: true,
    },
  });

  const storedCounts = countBySignature(
    stored.map((row) => ({
      signature: dealSignature({
        lawdCd: input.lawdCd,
        dealType: row.dealType as RealDealTypeValue,
        aptName: row.aptName,
        areaM2: row.areaM2,
        floor: row.floor,
        dealDate: row.dealDate,
        price: row.price,
        deposit: row.deposit,
        monthlyRent: row.monthlyRent,
        builtYear: row.builtYear,
      }),
    })),
  );

  const remaining = new Map(storedCounts);
  const toCreate: NormalizedDeal[] = [];
  let skipped = 0;
  for (const { deal, signature } of incoming) {
    const left = remaining.get(signature) ?? 0;
    if (left > 0) {
      remaining.set(signature, left - 1);
      skipped += 1;
      continue;
    }
    toCreate.push(deal);
  }

  if (toCreate.length > 0) {
    await prisma.realTransaction.createMany({
      data: toCreate.map((deal) => ({
        lawdCd: deal.lawdCd,
        dealType: RealDealType[deal.dealType],
        aptName: deal.aptName,
        areaM2: deal.areaM2,
        floor: deal.floor,
        dealDate: deal.dealDate,
        price: deal.price,
        deposit: deal.deposit,
        monthlyRent: deal.monthlyRent,
        builtYear: deal.builtYear,
        raw: deal.raw,
      })),
    });
  }

  return {
    requests: fetched.data.requests,
    fetched: incoming.length,
    created: toCreate,
    skipped,
    discarded: fetched.data.discarded + outOfScope,
    failure: null,
  };
}

/**
 * 크론이 훑을 지역 — **구독 지역 + 최근 수집분이 있는 지역**.
 *
 * "최근 조회 지역" 을 따로 기록하는 테이블이 없어서, **수집분이 남아 있는 지역**을 그 대용으로
 * 쓴다. 누군가 `/deals` 에서 그 지역을 처음 열면 온디맨드 수집이 행을 만들고, 그 뒤로는
 * 크론이 매일 이어서 채운다. 구독 지역이 먼저이고, 상한을 넘으면 뒤쪽(수집분)부터 잘린다.
 */
export async function resolveCronRegions(options?: {
  now?: Date;
  regionLimit?: number;
}): Promise<string[]> {
  const limit = options?.regionLimit ?? CRON_REGION_LIMIT;
  const now = options?.now ?? new Date();
  const cutoff = new Date(now.getTime() - RECENT_REGION_DAYS * 24 * 60 * 60 * 1000);

  const [subscribed, collected] = await Promise.all([
    prisma.transactionAlert.findMany({ distinct: ["lawdCd"], select: { lawdCd: true } }),
    prisma.realTransaction.findMany({
      distinct: ["lawdCd"],
      where: { fetchedAt: { gte: cutoff } },
      select: { lawdCd: true },
    }),
  ]);

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const row of [...subscribed, ...collected]) {
    if (seen.has(row.lawdCd)) continue;
    // 상수표에 없는 코드는 건너뛴다 — 지역 목록이 줄어든 뒤에도 크론이 헛돌지 않게
    if (!findRegion(row.lawdCd)) continue;
    seen.add(row.lawdCd);
    ordered.push(row.lawdCd);
    if (ordered.length >= limit) break;
  }
  return ordered;
}

/** 구독자 알림톡 시뮬 — 구독 1건 × 실행 1회 = MessageLog 1건 */
async function notifySubscribers(created: readonly NormalizedDeal[]): Promise<number> {
  if (created.length === 0) return 0;

  const lawdCds = [...new Set(created.map((deal) => deal.lawdCd))];
  const alerts = await prisma.transactionAlert.findMany({
    where: { lawdCd: { in: lawdCds } },
    include: { profile: { include: { user: true } } },
  });
  if (alerts.length === 0) return 0;

  const candidates: AlertMessageDeal[] = created
    .map((deal) => ({
      lawdCd: deal.lawdCd,
      aptName: deal.aptName,
      dealType: deal.dealType,
      areaM2: deal.areaM2,
      floor: deal.floor,
      dealDate: deal.dealDate.toISOString().slice(0, 10),
      price: deal.price,
      deposit: deal.deposit,
      monthlyRent: deal.monthlyRent,
    }))
    // 최근 거래가 먼저 보이게 — 본문에는 상위 몇 건만 적는다
    .sort((a, b) => b.dealDate.localeCompare(a.dealDate));

  const rows: { kind: MessageKind; toPhone: string; title: string; body: string }[] = [];
  for (const alert of alerts) {
    const matched = matchDeals(
      { lawdCd: alert.lawdCd, aptName: alert.aptName, dealType: alert.dealType },
      candidates,
    );
    if (matched.length === 0) continue;

    const region = findRegion(alert.lawdCd);
    const message = buildAlertMessage({
      regionLabel: region ? regionLabel(region) : alert.lawdCd,
      alert: { lawdCd: alert.lawdCd, aptName: alert.aptName, dealType: alert.dealType },
      deals: matched,
    });
    rows.push({
      kind: MessageKind.ETC,
      toPhone: alert.profile.user.phone,
      title: message.title,
      body: message.body,
    });
  }

  if (rows.length === 0) return 0;
  await prisma.messageLog.createMany({ data: rows });
  return rows.length;
}

/** 요청한 유형에서 실제로 불러야 할 엔드포인트만 고른다 */
function endpointsFor(dealTypes: readonly RealDealTypeValue[]): MolitEndpointKey[] {
  const endpoints: MolitEndpointKey[] = [];
  if (dealTypes.includes("SALE")) endpoints.push("TRADE");
  if (dealTypes.includes("JEONSE") || dealTypes.includes("WOLSE")) endpoints.push("RENT");
  return endpoints;
}

/**
 * 수집 실행. 크론·어드민 수동·온디맨드가 **모두 이 함수 하나**를 부른다.
 * 어떤 실패도 던지지 않는다 — 결과 표에 담아 돌려준다.
 */
export async function runDealsSync(options: DealSyncOptions = {}): Promise<DealSyncResultDto> {
  const startedAt = Date.now();
  const now = options.now ?? new Date();

  const dealTypes: RealDealTypeValue[] = [...(options.dealTypes ?? ["SALE", "JEONSE", "WOLSE"])];
  const months = [...(options.months ?? recentDealYms(CRON_MONTH_SPAN, now))];
  const lawdCds = options.lawdCds
    ? [...options.lawdCds]
    : await resolveCronRegions({ now, regionLimit: options.regionLimit });

  const targets: DealSyncResultDto["targets"] = [];
  const failures: DealSyncFailureDto[] = [];
  const createdAll: NormalizedDeal[] = [];
  let requests = 0;
  let fetched = 0;
  let skipped = 0;
  let discarded = 0;

  for (const lawdCd of lawdCds) {
    const region = findRegion(lawdCd);
    for (const dealYm of months) {
      targets.push({
        lawdCd,
        regionLabel: region ? regionLabel(region) : lawdCd,
        dealYm,
      });
      for (const endpoint of endpointsFor(dealTypes)) {
        const wanted = dealTypes.filter((type) => ENDPOINT_TYPES[endpoint].includes(type));
        const outcome = await withSyncLock(`${lawdCd}|${dealYm}|${endpoint}|${wanted.join(",")}`, () =>
          syncSegment({ lawdCd, dealYm, endpoint, dealTypes: wanted }),
        );
        requests += outcome.requests;
        fetched += outcome.fetched;
        skipped += outcome.skipped;
        discarded += outcome.discarded;
        createdAll.push(...outcome.created);
        if (outcome.failure) failures.push(outcome.failure);
      }
    }
  }

  const alertsSent =
    options.notify === false ? 0 : await notifySubscribers(createdAll);

  return {
    ok: true,
    ranAt: new Date().toISOString(),
    targets,
    regionsScanned: lawdCds.length,
    monthsScanned: months.length,
    requests,
    fetched,
    created: createdAll.length,
    skipped,
    discarded,
    failures,
    alertsSent,
    durationMs: Date.now() - startedAt,
  };
}

/** 크론이 부르는 얼굴 — 당월+전월, 대상 지역은 스스로 고른다 */
export async function runDealsSyncCron(options?: { now?: Date }): Promise<DealSyncResultDto> {
  const now = options?.now ?? new Date();
  return runDealsSync({ now, months: recentDealYms(CRON_MONTH_SPAN, now) });
}

/** 이번 달(KST) — 어드민 화면 기본값에 쓴다 */
export function currentDealYm(now?: Date): string {
  const ym = kstYearMonth(now);
  return `${ym.year}${String(ym.month).padStart(2, "0")}`;
}
