import type { Metadata } from "next";
import { COMMUNITY_REGIONS, DEFAULT_REGION_CODE, regionLabel, resolveRegion } from "@/features/community/regions";
import { DealsView } from "@/features/deals/DealsView";
import { DEFAULT_DEAL_PAGE_SIZE } from "@/features/deals/cursor";
import { loadDealsPage } from "@/features/deals/queries";
import { REAL_DEAL_TYPES, type DealRegionDto, type RealDealTypeValue } from "@/features/deals/types";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * `/deals` — 실거래가 조회 (T4.4).
 *
 * 라우트 핸들러(`GET /api/deals`)와 **같은 조회 함수**(`loadDealsPage`)로 첫 페이지를 그린다 —
 * 진입에 왕복이 없고, 이어지는 페이지만 커서로 읽는다.
 * 지역·유형·검색은 `?lawdCd=&type=&q=&apt=` 라 새로고침·공유가 된다.
 *
 * ## 왜 **공개**(`(app)` 바로 아래, `(protected)` 가 아니다)인가
 *
 * 1. **개인정보가 한 줄도 없다.** 국토부 실거래가는 공개 데이터이고, 이 화면이 그리는 값은
 *    누가 보든 똑같다. 로그인으로 가릴 것이 없다.
 * 2. **유입 화면이다.** T3.2 `/search`(비로그인 매물 탐색)·T2.3 `/refund/calculator` 와 같은
 *    자리다 — 먼저 값을 보여 주고, **개인화가 필요한 순간(알림 구독)에만 로그인**을 요구한다.
 *    T2.3 계산기(공개) → T2.4 신청(로그인)과 같은 층 나눔이다.
 * 3. 반대로 로그인을 세우면 A/B·SEO(T6.4)로 이 화면을 쓸 수 없고, 되돌리기가 더 비싸다.
 *
 * 구독 API(`/api/transaction-alerts`)는 비로그인이면 **401** 이고, 시트는 로그인 링크만 보여 준다.
 *
 * > **탭바에 넣지 않았다** — 탭 구성표(`features/shell/tabs.ts`)는 T0.5 소유라 이 task 가
 * > 건드리지 않는다. 지금은 URL(`/deals`)로 들어온다. 탭·링크를 붙이는 것은 T0.5·T6.4 몫이다.
 *
 * `searchParams` 는 Next 16 규약대로 Promise 다.
 */
export const metadata: Metadata = {
  title: "실거래가 — 자리 데모",
  description: "국토교통부 아파트 실거래가를 시군구·거래 유형별로 보고, 단지별 추이를 확인합니다.",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const REGION_OPTIONS: DealRegionDto[] = COMMUNITY_REGIONS.map((region) => ({
  code: region.code,
  name: region.name,
  label: regionLabel(region),
}));

export default async function DealsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const region = resolveRegion(first(params.lawdCd) ?? DEFAULT_REGION_CODE);
  const typeParam = first(params.type);
  const dealType: RealDealTypeValue = (REAL_DEAL_TYPES as readonly string[]).includes(
    typeParam ?? "",
  )
    ? (typeParam as RealDealTypeValue)
    : "SALE";
  const q = (first(params.q) ?? "").trim().slice(0, 60);
  const apt = (first(params.apt) ?? "").trim().slice(0, 60) || null;

  const [page, user] = await Promise.all([
    loadDealsPage({
      lawdCd: region.code,
      dealType,
      q: q || null,
      apt,
      limit: DEFAULT_DEAL_PAGE_SIZE,
      allowOnDemand: true,
    }),
    getCurrentUser(),
  ]);

  return (
    <DealsView
      regions={REGION_OPTIONS}
      initialRegionCode={region.code}
      initialDealType={dealType}
      initialQuery={q}
      initialApt={apt}
      initialPage={page}
      loggedIn={Boolean(user)}
    />
  );
}
