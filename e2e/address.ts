import type { Page } from "@playwright/test";

/**
 * E2E 에서 카카오 주소 검색을 **우리 프록시 앞에서 가로챈다** (T3.1·T3.4).
 *
 * ## 왜 실호출을 하지 않나
 * 주소 검색은 화면 → `GET /api/address/search`(우리 서버) → 카카오 순으로 흐른다.
 * E2E 가 카카오까지 실제로 가면 ①네트워크·쿼터에 여정 전체가 매달리고 ②CI 에는
 * `KAKAO_REST_API_KEY` 가 없어 항상 깨지며 ③검색 결과가 바뀌면 단언이 깨진다.
 * 그래서 **브라우저가 우리 API 를 부르는 지점**을 `page.route` 로 가로채 고정 응답을 준다 —
 * 컴포넌트(검색·후보 목록·선택·좌표 반영)와 그 뒤 저장 여정은 그대로 지나간다.
 *
 * 프록시 라우트 자체(키가 헤더로만 나가는지·빈 결과·업스트림 오류)는 Vitest 에서
 * `fetch` 를 mock 해 검증한다(`app/api/address/{search,reverse}/route.test.ts`).
 * 카카오 실호출 형태는 구현 중 직접 확인해 `features/address/testing.ts` 픽스처로 옮겨 뒀다.
 */

type Candidate = {
  id: string;
  address: string;
  roadAddress: string | null;
  lat: number;
  lng: number;
  placeName: string | null;
  category: string | null;
  source: "ADDRESS" | "PLACE";
};

const FIXTURES: { match: string[]; candidate: Candidate }[] = [
  {
    match: ["성수", "아차산"],
    candidate: {
      id: "address:성수",
      address: "서울 성동구 성수동2가 315",
      roadAddress: "서울 성동구 아차산로 100",
      lat: 37.54453,
      lng: 127.05599,
      placeName: null,
      category: null,
      source: "ADDRESS",
    },
  },
  {
    match: ["왕십리"],
    candidate: {
      id: "place:왕십리역",
      address: "서울 성동구 행당동 192",
      roadAddress: "서울 성동구 왕십리로 300",
      lat: 37.56133,
      lng: 127.03782,
      placeName: "왕십리역",
      category: "지하철역",
      source: "PLACE",
    },
  },
  {
    match: ["강남"],
    candidate: {
      id: "place:강남역",
      address: "서울 강남구 역삼동 858",
      roadAddress: "서울 강남구 강남대로 396",
      lat: 37.49794,
      lng: 127.02762,
      placeName: "강남역",
      category: "지하철역",
      source: "PLACE",
    },
  },
];

const FALLBACK: Candidate = {
  id: "address:행당로79",
  address: "서울 성동구 행당동 347",
  roadAddress: "서울 성동구 행당로 79",
  lat: 37.5582,
  lng: 127.0275,
  placeName: null,
  category: null,
  source: "ADDRESS",
};

/** 결과 0건을 확인하고 싶을 때 쓰는 검색어 */
export const EMPTY_QUERY = "결과없음";

function candidatesFor(query: string): Candidate[] {
  if (query.includes(EMPTY_QUERY)) return [];
  const hit = FIXTURES.find((fixture) => fixture.match.some((word) => query.includes(word)));
  return [hit?.candidate ?? FALLBACK];
}

/** 반드시 화면 이동 **전에** 부른다. */
export async function mockAddressSearch(page: Page): Promise<void> {
  await page.route("**/api/address/search*", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("query") ?? "";
    const candidates = candidatesFor(query);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        candidates,
        meta: { total: candidates.length, isEnd: true },
      }),
    });
  });
}

/** 주소 검색 필드 한 칸을 채운다 — `testId` 는 `AddressSearchField` 의 접두사 */
export async function pickAddress(page: Page, testId: string, query: string): Promise<void> {
  await page.getByTestId(`${testId}-input`).fill(query);
  await page.getByTestId(`${testId}-submit`).click();
  await page.getByTestId(`${testId}-option-0`).click();
}
