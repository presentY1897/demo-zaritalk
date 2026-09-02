/**
 * 실거래가 조회 — 라우트 핸들러와 서버 컴포넌트가 **같은 함수**를 쓴다 (T4.4).
 *
 * ## 캐시 우선 · 미수집 지역만 온디맨드
 *
 * 우리 DB(`RealTransaction`)가 곧 캐시다. 조회는 항상 DB 를 먼저 보고, **그 지역에 수집분이
 * 한 줄도 없을 때만** 국토부 API 를 부른다(최근 3개월). 이유:
 *
 * - 국토부 개발계정은 일일 호출 한도가 있다. 스크롤·탭 전환마다 부르면 금세 바닥난다.
 * - 실거래가는 **하루에 몇 건 늘어나는 값**이라 분 단위 신선도가 의미 없다. 매일 도는
 *   크론이 당월·전월을 계속 채우므로, 화면은 캐시를 읽는 것으로 충분하다.
 * - 온디맨드는 "처음 열어 본 지역이 텅 비어 있는" 것만 막으면 된다.
 *
 * 같은 지역에 연달아 들어와도 **쿨다운**(10분) 안에서는 다시 부르지 않는다. 수집이 실패해도
 * 쿨다운을 찍는다 — 국토부가 죽어 있을 때 요청마다 8초씩 붙잡히지 않게.
 *
 * > 쿨다운·진행 중 표시는 **프로세스 메모리**다. 인스턴스가 여러 개면 인스턴스마다 한 번씩
 * > 부를 수 있다. 수집 자체가 멱등이라 데이터는 어긋나지 않고, 낭비되는 호출은 인스턴스 수만큼이다.
 */
import { prisma, RealDealType } from "@zari/db";
import { kstYearMonth } from "@/lib/rent";
import { regionLabel, resolveRegion } from "@/features/community/regions";
import {
  DEFAULT_DEAL_PAGE_SIZE,
  dealCursorWhere,
  dealOrderBy,
  encodeDealCursor,
  type DealCursor,
} from "./cursor";
import { getMolitServiceKey } from "./molit";
import { ON_DEMAND_MONTH_SPAN, TREND_MONTH_SPAN, monthRange, recentDealYms } from "./period";
import { runDealsSync } from "./sync";
import { buildTrend } from "./trend";
import type {
  DealApartmentDto,
  DealSyncHintDto,
  DealTrendDto,
  RealDealDto,
  RealDealTypeValue,
} from "./types";

/** 온디맨드 수집을 다시 시도하기까지의 최소 간격(ms) */
export const ON_DEMAND_COOLDOWN_MS = 10 * 60 * 1000;
/** 단지 셀렉트·구독 시트에 실어 보낼 단지 수 상한 */
export const APARTMENT_LIST_LIMIT = 100;
/** 추이 집계가 훑는 행 수 상한 — 한 시군구 12개월이면 넉넉하다 */
export const TREND_SCAN_LIMIT = 3_000;

const lastAttemptAt = new Map<string, number>();

/** 테스트가 쿨다운 상태를 비울 때 쓴다 */
export function resetOnDemandCooldown(): void {
  lastAttemptAt.clear();
}

/**
 * 그 지역에 수집분이 없으면 최근 3개월을 긁어 온다. 결과는 화면 안내 문구로 쓰인다.
 * **실패해도 던지지 않는다** — 목록은 비어 있을 뿐 화면은 그대로 뜬다.
 */
export async function ensureDealsCollected(
  lawdCd: string,
  options?: { now?: Date },
): Promise<DealSyncHintDto> {
  const existing = await prisma.realTransaction.count({ where: { lawdCd } });
  if (existing > 0) return { triggered: false, reason: "CACHE_HIT", created: 0, months: [] };

  if (!getMolitServiceKey()) {
    return { triggered: false, reason: "NO_KEY", created: 0, months: [] };
  }

  const now = options?.now ?? new Date();
  const last = lastAttemptAt.get(lawdCd);
  if (last !== undefined && now.getTime() - last < ON_DEMAND_COOLDOWN_MS) {
    return { triggered: false, reason: "COOLDOWN", created: 0, months: [] };
  }
  lastAttemptAt.set(lawdCd, now.getTime());

  const months = recentDealYms(ON_DEMAND_MONTH_SPAN, now);
  const result = await runDealsSync({ lawdCds: [lawdCd], months, now });

  return {
    triggered: true,
    reason: result.failures.length > 0 && result.created === 0 ? "FAILED" : "SYNCED",
    created: result.created,
    months,
  };
}

function toDto(row: {
  id: string;
  lawdCd: string;
  dealType: RealDealType;
  aptName: string;
  areaM2: number;
  floor: number | null;
  dealDate: Date;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  builtYear: number | null;
}): RealDealDto {
  return {
    id: row.id,
    lawdCd: row.lawdCd,
    dealType: row.dealType as RealDealTypeValue,
    aptName: row.aptName,
    areaM2: row.areaM2,
    floor: row.floor,
    dealDate: row.dealDate.toISOString().slice(0, 10),
    price: row.price,
    deposit: row.deposit,
    monthlyRent: row.monthlyRent,
    builtYear: row.builtYear,
  };
}

export type ListDealsInput = {
  lawdCd: string;
  dealType: RealDealTypeValue;
  /** 단지 검색어 — 부분일치 */
  q?: string | null;
  /** 정확한 단지명 — 목록도 좁히고 추이 차트 대상이 된다 */
  apt?: string | null;
  cursor?: DealCursor | null;
  limit?: number;
};

/** 목록 한 페이지 + 다음 커서. 정렬·keyset 규약은 `./cursor.ts` 한 곳에 있다 */
export async function listDeals(input: ListDealsInput): Promise<{
  deals: RealDealDto[];
  nextCursor: string | null;
}> {
  const limit = input.limit ?? DEFAULT_DEAL_PAGE_SIZE;
  // 단지를 콕 집었으면(`apt`) 그것이 이긴다 — 검색어(`q`)는 목록을 좁히는 보조 수단이다
  const nameWhere = input.apt
    ? { aptName: input.apt }
    : input.q
      ? { aptName: { contains: input.q, mode: "insensitive" as const } }
      : {};
  const where = {
    lawdCd: input.lawdCd,
    dealType: RealDealType[input.dealType],
    ...nameWhere,
    ...(input.cursor ? dealCursorWhere(input.cursor) : {}),
  };

  const rows = await prisma.realTransaction.findMany({
    where,
    orderBy: [...dealOrderBy()],
    take: limit + 1,
  });

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > limit && last
      ? encodeDealCursor({ lawdCd: input.lawdCd, dealType: input.dealType }, last)
      : null;

  return { deals: page.map(toDto), nextCursor };
}

/** 그 지역·유형에서 수집된 단지 목록(거래 수 내림차순) — 검색 셀렉트·구독 시트가 쓴다 */
export async function listApartments(input: {
  lawdCd: string;
  dealType: RealDealTypeValue;
}): Promise<DealApartmentDto[]> {
  const grouped = await prisma.realTransaction.groupBy({
    by: ["aptName"],
    where: { lawdCd: input.lawdCd, dealType: RealDealType[input.dealType] },
    _count: { _all: true },
    orderBy: [{ _count: { aptName: "desc" } }, { aptName: "asc" }],
    take: APARTMENT_LIST_LIMIT,
  });
  return grouped.map((row) => ({ name: row.aptName, count: row._count._all }));
}

/** 최근 12개월 추이. 단지를 고르면 그 단지, 아니면 지역 전체 */
export async function loadTrend(input: {
  lawdCd: string;
  dealType: RealDealTypeValue;
  apt?: string | null;
  now?: Date;
}): Promise<DealTrendDto> {
  const now = input.now ?? new Date();
  const { year, month } = kstYearMonth(now);
  // 이번 달을 포함해 최근 TREND_MONTH_SPAN 개월의 시작점
  const oldest = recentDealYms(TREND_MONTH_SPAN, now).at(-1)!;
  const start = monthRange({ year: Number(oldest.slice(0, 4)), month: Number(oldest.slice(4, 6)) })
    .start;
  const end = monthRange({ year, month }).end;

  const rows = await prisma.realTransaction.findMany({
    where: {
      lawdCd: input.lawdCd,
      dealType: RealDealType[input.dealType],
      dealDate: { gte: start, lt: end },
      ...(input.apt ? { aptName: input.apt } : {}),
    },
    select: {
      dealType: true,
      dealDate: true,
      price: true,
      deposit: true,
      monthlyRent: true,
    },
    orderBy: { dealDate: "desc" },
    take: TREND_SCAN_LIMIT,
  });

  return buildTrend(
    rows.map((row) => ({
      dealType: row.dealType as RealDealTypeValue,
      dealDate: row.dealDate,
      price: row.price,
      deposit: row.deposit,
      monthlyRent: row.monthlyRent,
    })),
    { apartmentName: input.apt ?? null, currentYear: year },
  );
}

/** 화면 한 판을 채우는 데 필요한 것 전부 — 서버 컴포넌트와 `GET /api/deals` 가 같이 쓴다 */
export async function loadDealsPage(input: {
  lawdCd: string;
  dealType: RealDealTypeValue;
  q?: string | null;
  apt?: string | null;
  cursor?: DealCursor | null;
  limit?: number;
  now?: Date;
  /** 미수집 지역이면 국토부를 부를지 — 첫 페이지에서만 true */
  allowOnDemand?: boolean;
}) {
  const sync = input.allowOnDemand
    ? await ensureDealsCollected(input.lawdCd, { now: input.now })
    : ({ triggered: false, reason: "CACHE_HIT", created: 0, months: [] } as DealSyncHintDto);

  const [{ deals, nextCursor }, apartments, trend] = await Promise.all([
    listDeals(input),
    listApartments(input),
    loadTrend(input),
  ]);

  const region = resolveRegion(input.lawdCd);
  return {
    region: { code: region.code, name: region.name, label: regionLabel(region) },
    dealType: input.dealType,
    deals,
    nextCursor,
    apartments,
    trend,
    sync,
  };
}
