/**
 * 커뮤니티 목록의 **커서 페이지네이션 규약** — 정의는 여기 한 곳뿐이다 (T4.1).
 *
 * ## 왜 offset 이 아니라 커서인가
 *
 * 무한 스크롤 도중에도 글은 계속 올라온다. `skip/take` 는 앞 페이지에 글이 하나 끼어들면
 * 다음 페이지의 첫 줄이 **이미 본 글**이 되고(중복), 글이 하나 지워지면 한 줄이 **건너뛰어진다**(누락).
 * 커서(keyset)는 "마지막으로 본 행보다 뒤" 를 조건으로 다시 물으므로 그 사이 삽입·삭제에
 * 영향받지 않는다.
 *
 * ## 정렬 키는 **언제나 유니크한 조합**이어야 한다
 *
 * | 탭 | 정렬 | 커서에 담기는 값 |
 * |---|---|---|
 * | 최신 `latest` | `createdAt DESC, id DESC` | `createdAt`·`id` |
 * | 인기 `popular` | `likeCount DESC, createdAt DESC, id DESC` | `likeCount`·`createdAt`·`id` |
 *
 * `likeCount` 는 동점이 흔하고(0점 글이 수두룩하다) `createdAt` 도 같은 밀리초에 둘이 들어올 수
 * 있다. 그래서 **마지막 보조 키는 항상 `id`**(유니크)다 — 이 조합이면 두 행의 순서가 절대 뒤집히지
 * 않으므로 경계에서 중복·누락이 없다. 인기 탭에 `createdAt` 을 한 겹 더 끼운 것은 같은 좋아요 수라면
 * 최신 글이 위로 오게 하려는 것이고, 정렬 안정성 자체는 `id` 가 보장한다.
 *
 * ## 커서에 정렬 키를 함께 싣는 이유
 *
 * 최신 탭에서 받은 커서를 인기 탭에 그대로 쓰면 조건과 정렬이 어긋나 **조용히 중복·누락**이 난다.
 * 그래서 커서 안에 `sort` 를 박아 두고 요청의 `sort` 와 다르면 **400 으로 거절**한다
 * (탭을 바꾸면 커서를 버리고 처음부터 읽는 것이 맞다).
 *
 * 인코딩은 base64url 이다 — URL 에 그대로 실리고, 클라이언트가 내부 값을 파싱해 쓰지 못하게
 * (즉 규약이 새어 나가지 않게) 불투명한 문자열로 둔다.
 *
 * > **한계**: 커서는 "그 시점의 좋아요 수" 를 기억한다. 읽는 도중 어떤 글의 좋아요가 늘어
 * > 커서 위치를 뛰어넘으면 그 글은 다음 페이지에 한 번 더 나올 수 있다. 정렬 키 자체가 변하는
 * > 값이라 keyset 으로도 없앨 수 없고, offset 방식은 여기에 더 취약하다. 페이지 **경계에서
 * > 값이 변하지 않는 한** 중복·누락이 없다는 것이 이 규약의 보장이며, 테스트가 그것을 못 박는다.
 *
 * `@zari/db` 를 import 하지 않는다 — 순수 인코딩이라 DB 없이 테스트한다.
 */

export const POST_SORTS = ["latest", "popular"] as const;
export type PostSort = (typeof POST_SORTS)[number];

/** 목록 한 페이지 크기 — 화면·API 기본값. `limit` 로 1~50 까지 조절한다 */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

/** 커서가 가리키는 행 — "이 행 **다음**부터" 라는 뜻이다 */
export type PostCursor = {
  sort: PostSort;
  likeCount: number;
  createdAt: Date;
  id: string;
};

/** 커서를 만들 수 있는 최소한의 행 모양 */
export type CursorSource = { id: string; likeCount: number; createdAt: Date };

/**
 * `sort|likeCount|createdAt(ms)|id` 를 base64url 로 — 불투명 문자열.
 *
 * `Buffer` 대신 `btoa`/`atob` 를 쓴다 — 이 모듈은 `schema.ts`(정렬 목록·페이지 상한)를 통해
 * 글쓰기 폼 같은 **클라이언트 번들에도 실리므로** Node 전용 API 를 두지 않는다.
 * 커서 내용은 전부 ASCII(정렬 이름·숫자·cuid)라 그대로 안전하다.
 */
export function encodeCursor(sort: PostSort, row: CursorSource): string {
  const raw = `${sort}|${row.likeCount}|${row.createdAt.getTime()}|${row.id}`;
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/**
 * 커서 해독. **요청의 `sort` 와 다르면 `null`** — 라우트가 400 으로 돌려준다.
 * 형식이 깨졌을 때도 `null` 이다(조용히 첫 페이지로 되돌리지 않는다 — 그러면 무한 스크롤이 맴돈다).
 */
export function decodeCursor(raw: string, sort: PostSort): PostCursor | null {
  let decoded: string;
  try {
    const base64 = raw.replaceAll("-", "+").replaceAll("_", "/");
    decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  } catch {
    return null;
  }

  const parts = decoded.split("|");
  if (parts.length !== 4) return null;
  const [cursorSort, likeCountRaw, createdAtRaw, id] = parts as [string, string, string, string];

  if (cursorSort !== sort) return null;
  if (!id) return null;

  const likeCount = Number(likeCountRaw);
  const createdAtMs = Number(createdAtRaw);
  if (!Number.isInteger(likeCount) || !Number.isInteger(createdAtMs)) return null;

  return { sort, likeCount, createdAt: new Date(createdAtMs), id };
}

/** 정렬 절 — Prisma `orderBy` 에 그대로 넘긴다. 마지막은 언제나 `id` 다 */
export function orderByFor(sort: PostSort) {
  return sort === "popular"
    ? ([{ likeCount: "desc" }, { createdAt: "desc" }, { id: "desc" }] as const)
    : ([{ createdAt: "desc" }, { id: "desc" }] as const);
}

/**
 * keyset 조건 — "커서 행보다 **뒤**" 를 `OR` 사슬로 편 것.
 * 정렬 키가 `(a, b, c)` 면 `a < a0 OR (a = a0 AND b < b0) OR (a = a0 AND b = b0 AND c < c0)` 이다.
 */
export function cursorWhere(cursor: PostCursor) {
  if (cursor.sort === "popular") {
    return {
      OR: [
        { likeCount: { lt: cursor.likeCount } },
        { likeCount: cursor.likeCount, createdAt: { lt: cursor.createdAt } },
        { likeCount: cursor.likeCount, createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ],
    };
  }
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}
