/**
 * 국토부 XML 파서 (T4.3) — **DB 없음**. 실호출로 받아 둔 fixture 로 검증한다.
 * 최소 테스트 축 ① "응답 파싱" 의 앞단이다(면적·층·금액 변환은 `parse.test.ts`).
 */
import { describe, expect, test } from "vitest";
import { readDealFixture } from "./testing";
import { decodeXmlEntities, parseMolitBody, parseMolitFault, parseXmlItems, readTag } from "./xml";

const RENT = readDealFixture("rent-11200-202607");
const TRADE = readDealFixture("trade-11200-202607");
const EMPTY = readDealFixture("empty");
const FAULT = readDealFixture("fault-service-key");
const EDGE = readDealFixture("edge-cases");

describe("정상 봉투", () => {
  test("전월세 응답의 header·body 를 읽는다", () => {
    const body = parseMolitBody(RENT);
    expect(body).not.toBeNull();
    expect(body!.resultCode).toBe("000");
    expect(body!.resultMsg).toBe("OK");
    expect(body!.totalCount).toBeGreaterThan(0);
    expect(body!.items.length).toBeGreaterThan(0);
  });

  test("전월세 첫 행의 필드가 문서대로 온다", () => {
    const [first] = parseXmlItems(RENT);
    expect(first).toMatchObject({
      aptNm: "신금호파크자이",
      aptSeq: "11200-3086",
      buildYear: "2016",
      dealYear: "2026",
      dealMonth: "7",
      dealDay: "14",
      deposit: "85,000",
      monthlyRent: "0",
      excluUseAr: "59.98",
      floor: "11",
      umdNm: "금호동2가",
    });
  });

  test("매매 응답에는 dealAmount·cdealType 이 있고 aptSeq 는 없다", () => {
    const [first] = parseXmlItems(TRADE);
    expect(first!.dealAmount).toBe("249,000");
    expect(first!.aptNm).toBe("센트라스");
    expect(first).toHaveProperty("cdealType");
    expect(first).not.toHaveProperty("aptSeq");
  });

  test("빈 값은 `\"\"` 로 정규화된다 — 원문은 공백 한 칸이다", () => {
    // 실제 응답: <contractTerm> </contractTerm>
    expect(RENT).toContain("<contractTerm> </contractTerm>");
    const [first] = parseXmlItems(RENT);
    expect(first!.contractTerm).toBe("");
    expect(first!.preDeposit).toBe("");
  });

  test("결과가 없으면 `<items/>` 자기닫음 + totalCount 0", () => {
    expect(EMPTY).toContain("<items/>");
    const body = parseMolitBody(EMPTY);
    expect(body!.resultCode).toBe("000");
    expect(body!.totalCount).toBe(0);
    expect(body!.items).toEqual([]);
  });

  test("실제 응답에 **내용이 완전히 같은 행이 두 번** 들어 있다 (멱등 설계의 근거)", () => {
    const items = parseXmlItems(RENT);
    const signatures = items.map((item) =>
      [item.aptNm, item.excluUseAr, item.floor, item.dealDay, item.deposit, item.monthlyRent].join("|"),
    );
    const duplicated = signatures.filter(
      (value, index) => signatures.indexOf(value) !== index,
    );
    expect(duplicated.length).toBeGreaterThan(0);
  });
});

describe("키 오류 봉투", () => {
  test("errMsg·returnAuthMsg·returnReasonCode 를 읽는다", () => {
    expect(parseMolitFault(FAULT)).toEqual({
      errMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR",
      returnAuthMsg: "등록되지 않은 서비스키",
      returnReasonCode: "30",
    });
  });

  test("정상 응답에는 fault 가 없고, 오류 봉투에는 header 가 없다", () => {
    expect(parseMolitFault(RENT)).toBeNull();
    expect(parseMolitBody(FAULT)).toBeNull();
  });

  test("XML 이 아니면 둘 다 null", () => {
    expect(parseMolitFault("<html>502 Bad Gateway</html>")).toBeNull();
    expect(parseMolitBody("<html>502 Bad Gateway</html>")).toBeNull();
  });
});

describe("엔티티·태그 읽기", () => {
  test("&amp; · &#39; · &#x27; 을 되돌린다", () => {
    expect(decodeXmlEntities("래미안 &amp; 자이")).toBe("래미안 & 자이");
    expect(decodeXmlEntities("&lt;b&gt;")).toBe("<b>");
    expect(decodeXmlEntities("&#39;a&#x27;")).toBe("'a'");
    // 모르는 엔티티는 건드리지 않는다
    expect(decodeXmlEntities("&nbsp;")).toBe("&nbsp;");
  });

  test("단지명에 이스케이프된 & 가 있으면 풀어 준다", () => {
    const items = parseXmlItems(EDGE);
    expect(items.map((item) => item.aptNm)).toContain("엔티티 & 아파트");
  });

  test("readTag 는 첫 매치만 본다(header 가 body 보다 앞이다)", () => {
    expect(readTag(RENT, "resultCode")).toBe("000");
    expect(readTag(RENT, "없는태그")).toBeNull();
  });
});
