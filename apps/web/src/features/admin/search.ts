/**
 * 어드민 검색어 처리 (T6.3) — **LIKE 와일드카드를 이스케이프한다.**
 *
 * Prisma 의 `contains` 는 값을 파라미터로 넘기므로 SQL 인젝션은 애초에 없다. 그런데
 * `%`·`_` 는 **파라미터 안에서도 LIKE 패턴 문자로 살아 있다** — `%` 한 글자를 검색하면
 * 회원 전체가 나오고, `_수` 는 "한 글자 + 수" 로 엉뚱하게 매칭된다. 사용자가 친 문자열은
 * 패턴이 아니라 **글자 그대로** 찾아야 하므로 여기서 막는다.
 *
 * Postgres 의 LIKE 기본 escape 문자는 백슬래시다. 그래서 `\` 자신도 함께 이스케이프한다
 * (순서가 중요하다 — `\` 를 먼저 바꾸지 않으면 방금 넣은 백슬래시를 다시 이스케이프한다).
 *
 * 순수 함수라 DB 없이 테스트한다.
 */
import { normalizePhone } from "@/lib/phone";

/** `%`·`_`·`\` 를 글자 그대로 찾도록 이스케이프한다 */
export function escapeLike(input: string): string {
  return input.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export type AdminSearchTerm = {
  /** 원본(트리밍만) — 응답에 그대로 되돌려 준다 */
  raw: string;
  /** 이름 검색에 쓸 값(이스케이프됨). 비어 있으면 이름으로는 찾지 않는다 */
  name: string;
  /** 전화 검색에 쓸 숫자열(이스케이프됨). 숫자가 없으면 빈 문자열 */
  digits: string;
};

/**
 * 검색어 한 줄을 이름·전화 두 갈래로 나눈다.
 *
 * 전화번호는 저장이 숫자만인데(`normalizePhone`, T0.3) 운영자는 `010-1111` 처럼 하이픈을 넣어
 * 친다. 그래서 **숫자만 뽑아 따로** 한 번 더 찾는다. 이름으로도, 번호로도 찾히는 것이 자연스럽다
 * (`OR`). 숫자만 친 경우에도 이름 검색을 지우지 않는다 — 호실·연도가 이름에 섞인 데모 데이터가 있다.
 */
export function parseSearchTerm(input: string | undefined | null): AdminSearchTerm | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const digits = normalizePhone(raw);
  return { raw, name: escapeLike(raw), digits: digits ? escapeLike(digits) : "" };
}
