/**
 * 실거래가 커서 규약 (T4.4) — **DB 없음**. 인코딩/해독·거절 조건·keyset 조건만 본다.
 * 실제 페이지 경계에서 중복·누락이 없는지는 `app/api/deals/route.test.ts` 가 DB로 확인한다.
 */
import { describe, expect, test } from "vitest";
import {
  dealCursorWhere,
  dealOrderBy,
  decodeDealCursor,
  encodeDealCursor,
  type DealCursor,
} from "./cursor";

const SCOPE = { lawdCd: "11200", dealType: "JEONSE" as const };
const ROW = { id: "cmf0abc", dealDate: new Date("2026-07-14T00:00:00.000Z") };

describe("왕복", () => {
  test("인코딩 → 해독하면 같은 값", () => {
    const cursor = decodeDealCursor(encodeDealCursor(SCOPE, ROW), SCOPE);
    expect(cursor).toEqual<DealCursor>({
      lawdCd: "11200",
      dealType: "JEONSE",
      dealDate: ROW.dealDate,
      id: ROW.id,
    });
  });

  test("불투명 문자열이다 — URL 에 그대로 실리는 base64url", () => {
    const raw = encodeDealCursor(SCOPE, ROW);
    expect(raw).not.toContain("|");
    expect(raw).not.toContain("=");
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(raw)).toBe(raw);
  });
});

describe("거절 조건 — 조용히 넘어가지 않는다", () => {
  const raw = encodeDealCursor(SCOPE, ROW);

  test("다른 유형 탭의 커서는 null", () => {
    expect(decodeDealCursor(raw, { lawdCd: "11200", dealType: "SALE" })).toBeNull();
    expect(decodeDealCursor(raw, { lawdCd: "11200", dealType: "WOLSE" })).toBeNull();
  });

  test("다른 지역의 커서는 null", () => {
    expect(decodeDealCursor(raw, { lawdCd: "11680", dealType: "JEONSE" })).toBeNull();
  });

  test("깨진 커서 4종", () => {
    expect(decodeDealCursor("!!!not-base64!!!", SCOPE)).toBeNull();
    // 마디 수가 모자람
    expect(decodeDealCursor(btoa("11200|JEONSE|123"), SCOPE)).toBeNull();
    // id 가 빔
    expect(decodeDealCursor(btoa("11200|JEONSE|123|"), SCOPE)).toBeNull();
    // 날짜가 숫자가 아님
    expect(decodeDealCursor(btoa("11200|JEONSE|yesterday|cmf0"), SCOPE)).toBeNull();
  });
});

describe("정렬·keyset", () => {
  test("정렬은 dealDate DESC 로 시작해 **id 로 닫힌다**", () => {
    expect(dealOrderBy()).toEqual([{ dealDate: "desc" }, { id: "desc" }]);
  });

  test("keyset 은 정렬 키를 OR 사슬로 편 것", () => {
    const cursor = decodeDealCursor(encodeDealCursor(SCOPE, ROW), SCOPE)!;
    expect(dealCursorWhere(cursor)).toEqual({
      OR: [
        { dealDate: { lt: ROW.dealDate } },
        { dealDate: ROW.dealDate, id: { lt: ROW.id } },
      ],
    });
  });
});
