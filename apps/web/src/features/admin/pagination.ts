/**
 * 어드민 조회 화면의 **페이지네이션 규약** (T6.3) — 정의는 여기 한 곳뿐이다.
 *
 * ## 왜 커서가 아니라 오프셋인가
 *
 * 앞선 목록들(T4.1 커뮤니티·T4.4 실거래가)은 **커서**를 골랐다. 무한 스크롤이고, 읽는 도중에도
 * 새 글이 올라오기 때문이다. 어드민 조회는 반대 성질이다:
 *
 * | 필요한 것 | 커서 | 오프셋 |
 * |---|---|---|
 * | **전체 건수**("연체 계약 37건") | 못 준다 | 준다 |
 * | **"3 / 12 페이지"·마지막 페이지로 점프** | 못 한다 | 한다 |
 * | 화면을 URL 로 공유·북마크(`?page=3`) | 불투명 커서가 URL 에 박힌다 | 사람이 읽는다 |
 * | 스크롤 중 삽입에 강함 | 강하다 | 약하다 |
 *
 * 운영자는 "몇 건인지" 와 "몇 페이지인지" 를 먼저 본다. 그리고 이 화면들은 무한 스크롤이 아니라
 * **번호 페이지**다. 마지막 줄이 흔들리는 문제는 조회 대상이 대부분 과거 데이터(청구·발송·이벤트)라
 * 실제로 드물다. 그래서 오프셋을 고른다.
 *
 * ## 대신 정렬을 **유니크한 키로 닫는다**
 *
 * 오프셋의 진짜 위험은 삽입이 아니라 **정렬이 흔들리는 것**이다. `createdAt DESC` 만으로 정렬하면
 * 같은 밀리초의 두 행 순서를 DB 가 매번 다르게 정할 수 있고, 그러면 페이지 경계에서 한 행이
 * 두 번 나오거나(중복) 아예 빠진다(누락). 그래서 **모든 목록의 마지막 정렬 키는 언제나 `id`** 다
 * (커서 규약이 `id` 로 닫는 것과 같은 이유). 데이터가 그대로인 동안 페이지들을 이어 붙이면
 * 전체 집합과 정확히 같다 — 단위 테스트가 그것을 못 박는다.
 *
 * ## 규약
 *
 * - 요청: `?page=`(1부터) · `?pageSize=`(기본 20, 최대 100). 정수가 아니거나 범위를 벗어나면 **400**.
 * - 응답: 목록 + `page` 메타(`{ page, pageSize, total, totalPages, hasPrev, hasNext }`).
 * - **범위를 넘는 페이지는 404 가 아니다** — 빈 목록 + 정확한 `total` 을 준다. 필터를 좁히는 도중
 *   `page=5` 가 남아 있는 상황이 흔한데, 그때 에러를 띄우면 화면이 막힌다. 화면은 `total` 을 보고
 *   "결과 없음" 과 함께 1페이지로 돌아가는 링크를 준다.
 * - `total` 은 **필터를 적용한 뒤의 전체 건수**다(페이지 크기와 무관).
 *
 * `@zari/db` 를 import 하지 않는다 — 순수 계산이라 DB 없이 테스트한다.
 */
import { z } from "zod";

export const DEFAULT_ADMIN_PAGE_SIZE = 20;
export const MAX_ADMIN_PAGE_SIZE = 100;

/** 응답에 실리는 페이지 메타 — 다섯 화면이 같은 모양을 쓴다 */
export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
};

/**
 * 쿼리 문자열용 스키마 조각. 각 화면의 스키마가 `.extend()` 하지 않고 spread 로 섞는다
 * (zod 4 에서 스키마 상속보다 조합이 읽기 쉽다).
 */
export const pageQueryShape = {
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_ADMIN_PAGE_SIZE)
    .default(DEFAULT_ADMIN_PAGE_SIZE),
};

/** Prisma `skip`/`take` 로 그대로 넘긴다 */
export function toSkipTake(input: { page: number; pageSize: number }): {
  skip: number;
  take: number;
} {
  return { skip: (input.page - 1) * input.pageSize, take: input.pageSize };
}

/** 전체 건수를 알고 난 뒤 메타를 만든다. `total = 0` 이면 `totalPages` 는 0 이다 */
export function buildPageMeta(
  input: { page: number; pageSize: number },
  total: number,
): PageMeta {
  const totalPages = Math.ceil(total / input.pageSize);
  return {
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages,
    hasPrev: input.page > 1,
    hasNext: input.page < totalPages,
  };
}
