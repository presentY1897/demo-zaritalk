import type { Metadata } from "next";
import { ProfileType } from "@zari/db";
import { MapSearchView } from "@/features/search/MapSearchView";
import { searchCacheKey } from "@/features/search/api";
import { searchListings } from "@/features/search/queries";
import { searchRequestFromParams } from "@/features/search/request";
import { currentUser } from "@/features/shell/session";
import { listWorkplaces } from "@/features/workplace/queries";

/**
 * `/search` — **비로그인 공개** 지도 매물 탐색 (T3.2).
 *
 * ## 왜 `(app)` 바로 아래인가 (route group)
 *
 * 로그인 강제는 `(app)/(protected)/layout.tsx` **한 곳**이 한다(T0.5). 그 그룹 **밖**,
 * 즉 `(app)` 바로 아래에 두면 480px 셸(D5)은 그대로 쓰면서 로그인은 걸리지 않는다 —
 * 공개 고지서 `(app)/notice/[token]`(T1.8)·환급 계산기 `(app)/refund/calculator`(T2.3)가
 * 같은 자리에 있고, T0.5 가 `/search` 도 그렇게 두기로 이미 정해 뒀다.
 * 비로그인 방문자에게는 탭바가 그려지지 않는다(`AppShell` 은 프로필이 없으면 탭바를 뺀다).
 *
 * ## 서버가 하는 일
 *
 * 1. **첫 목록을 읽는다** — 지도가 뜨기 전에 리스트가 이미 채워져 있어야 한다(지도 SDK 는
 *    외부 스크립트라 늦게 온다. 키가 없거나 도메인이 미등록이면 아예 안 온다).
 * 2. **쿼리를 해석한다** — `?bounds=`·`?dealType=` 등으로 들어온 링크를 그대로 그린다.
 *    잘못된 값은 조용히 버린다(`searchRequestFromParams` 주석 참고 — API 는 같은 값에 400 이다).
 * 3. **근무지 목록** — 로그인 세입자면 통근 배지 기준점 후보를 넘긴다(T3.5 자리).
 *
 * 이후 지도 이동·필터는 클라이언트가 `GET /api/listings` 로 이어 읽는다. 서버와 클라이언트가
 * **같은 함수**(`searchListings` ↔ 같은 라우트)를 쓰므로 첫 화면과 이후 결과 모양이 어긋나지 않는다.
 *
 * ## SEO — 색인을 연다
 *
 * 개인정보가 한 줄도 없고(등록자 이름조차 담지 않는다) 매물 탐색은 검색 유입 자체가 목적인
 * 그로스 경로다. 공개 고지서(T1.8)가 `noindex` 인 것과 정반대다.
 * 필터·영역이 붙은 주소는 사실상 무한히 만들어질 수 있으므로 **canonical 을 `/search` 로 고정**해
 * 색인이 한 곳으로 모이게 한다(화면도 필터를 `history.replaceState` 로만 반영해 새 URL 을
 * 히스토리에 쌓지 않는다).
 *
 * 값이 요청에 의존하지 않으므로 `generateMetadata` 함수가 아니라 **정적 `metadata` 객체**다
 * (Next 문서가 그 경우 정적 객체를 쓰라고 못박는다 — T2.3 과 같은 판단).
 */

const SITE_NAME = "자리 데모";
const metadataBase = new URL(process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000");

const TITLE = "매물 찾기 — 지도로 보는 전월세";
const DESCRIPTION =
  "지도를 움직이면 그 지역의 전세·월세 매물이 바로 바뀝니다. 보증금·월세 범위로 좁히고, 근무지를 등록하면 통근시간까지 함께 봅니다.";

export const metadata: Metadata = {
  metadataBase,
  title: `${TITLE} · ${SITE_NAME}`,
  description: DESCRIPTION,
  keywords: ["전세", "월세", "원룸", "지도 매물", "부동산 매물 검색"],
  // 필터·영역이 붙은 주소는 전부 이 한 곳으로 모은다
  alternates: { canonical: "/search" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "ko_KR",
    url: "/search",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

type PageProps = {
  // Next 16 — `searchParams` 는 Promise 다
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function SearchPage({ searchParams }: PageProps) {
  const request = searchRequestFromParams(await searchParams);

  const user = await currentUser();
  const tenantProfile = user?.profiles.find((profile) => profile.type === ProfileType.TENANT);
  const [result, workplaces] = await Promise.all([
    searchListings({
      bounds: request.bounds,
      filters: request.filters,
      limit: request.limit,
      // 첫 렌더에서는 통근 배지를 붙이지 않는다 — 화면에서 기준 근무지를 고르면 다시 읽는다
      commuteWorkplace: null,
    }),
    tenantProfile ? listWorkplaces(tenantProfile.id) : Promise.resolve([]),
  ]);

  return (
    <MapSearchView
      initialResult={result}
      initialKey={searchCacheKey({
        bounds: request.bounds,
        filters: request.filters,
        workplaceId: null,
      })}
      initialFilters={request.filters}
      initialBounds={request.bounds}
      workplaces={workplaces}
      loggedIn={Boolean(user)}
    />
  );
}
