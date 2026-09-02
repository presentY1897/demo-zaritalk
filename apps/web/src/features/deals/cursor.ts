/**
 * 실거래가 목록의 **커서 페이지네이션 규약** — 정의는 여기 한 곳뿐이다 (T4.4).
 *
 * 규약 자체는 T4.1 커뮤니티(`features/community/cursor.ts`)와 같은 모양이다. 정렬 키를 커서에
 * 함께 싣고, **마지막 보조 키는 언제나 유니크한 `id`** 로 닫아 경계에서 중복·누락이 없게 한다.
 *
 * | 정렬 | 커서에 담기는 값 |
 * |---|---|
 * | `dealDate DESC, id DESC` (최신 거래순, 하나뿐) | `lawdCd` · `dealType` · `dealDate` · `id` |
 *
 * ## 왜 커서에 **지역·유형까지** 싣는가
 *
 * 커뮤니티는 정렬 이름만 실었지만 여기는 정렬이 하나뿐이고 대신 **필터가 화면의 탭**이다.
 * 성동구 전세 목록의 커서를 강남구 매매 탭에 그대로 쓰면 조건이 어긋나 조용히 엉뚱한 페이지가
 * 나온다. 그래서 커서 안의 `lawdCd`·`dealType` 이 요청과 다르면 **400 으로 거절**한다 —
 * 탭·지역을 바꾸면 커서를 버리고 처음부터 읽는 것이 맞다(화면도 쿼리 키가 바뀌며 그렇게 한다).
 *
 * `dealDate` 는 `@db.Date`(UTC 자정)라 밀리초에 시각이 섞이지 않는다. 같은 날 거래가 수십 건씩
 * 겹치므로 `id` 로 닫는 것이 특히 중요하다.
 *
 * `@zari/db` 를 import 하지 않는다 — 순수 인코딩이라 DB 없이 테스트하고, `schema.ts` 를 통해
 * 클라이언트 번들에도 실린다(그래서 `Buffer` 대신 `btoa`/`atob`).
 */
import type { RealDealTypeValue } from "./types";

/** 목록 한 페이지 크기 — 화면·API 기본값. `limit` 로 1~50 까지 조절한다 */
export const DEFAULT_DEAL_PAGE_SIZE = 20;
export const MAX_DEAL_PAGE_SIZE = 50;

/** 커서가 가리키는 행 — "이 행 **다음**부터" 라는 뜻이다 */
export type DealCursor = {
  lawdCd: string;
  dealType: RealDealTypeValue;
  dealDate: Date;
  id: string;
};

export type DealCursorSource = { id: string; dealDate: Date };

/** `lawdCd|dealType|dealDate(ms)|id` 를 base64url 로 — 불투명 문자열 */
export function encodeDealCursor(
  scope: { lawdCd: string; dealType: RealDealTypeValue },
  row: DealCursorSource,
): string {
  const raw = `${scope.lawdCd}|${scope.dealType}|${row.dealDate.getTime()}|${row.id}`;
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/**
 * 커서 해독. **요청의 지역·유형과 다르면 `null`** — 라우트가 400 으로 돌려준다.
 * 형식이 깨졌을 때도 `null` 이다(조용히 첫 페이지로 되돌리지 않는다 — 무한 스크롤이 맴돈다).
 */
export function decodeDealCursor(
  raw: string,
  scope: { lawdCd: string; dealType: RealDealTypeValue },
): DealCursor | null {
  let decoded: string;
  try {
    const base64 = raw.replaceAll("-", "+").replaceAll("_", "/");
    decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  } catch {
    return null;
  }

  const parts = decoded.split("|");
  if (parts.length !== 4) return null;
  const [lawdCd, dealType, dealDateRaw, id] = parts as [string, string, string, string];

  if (lawdCd !== scope.lawdCd) return null;
  if (dealType !== scope.dealType) return null;
  if (!id) return null;

  const dealDateMs = Number(dealDateRaw);
  if (!Number.isInteger(dealDateMs)) return null;

  return { lawdCd, dealType: scope.dealType, dealDate: new Date(dealDateMs), id };
}

/** 정렬 절 — Prisma `orderBy` 에 그대로 넘긴다. 마지막은 언제나 `id` 다 */
export function dealOrderBy() {
  return [{ dealDate: "desc" }, { id: "desc" }] as const;
}

/** keyset 조건 — "커서 행보다 **뒤**" 를 `OR` 사슬로 편 것 */
export function dealCursorWhere(cursor: DealCursor) {
  return {
    OR: [
      { dealDate: { lt: cursor.dealDate } },
      { dealDate: cursor.dealDate, id: { lt: cursor.id } },
    ],
  };
}
