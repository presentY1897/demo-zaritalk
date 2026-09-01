import { expect, test } from "vitest";
import { renderNoticeTemplate, isOverdueLike, type NoticeTemplateInput } from "./template";

/**
 * kind별 템플릿 스냅샷 (T1.7 최소 테스트).
 *
 * 금액·연체일수·상태는 원장 엔진(`describeCharge`)이 계산한 값이다 — 스냅샷이 깨지면
 * 문구가 바뀌었거나 **엔진 계산이 바뀐 것**이다. 둘 다 눈으로 확인해야 한다.
 */

/** 시드 201호 8월분과 같은 청구 — 이월 300,000 · 연체료 15,500 · 총액 1,015,500 */
const augustCharge = {
  year: 2026,
  month: 8,
  dueDate: new Date("2026-08-05T00:00:00Z"),
  rentAmount: 650_000,
  maintenanceAmount: 50_000,
  carriedOverAmount: 300_000,
  lateFeeAmount: 15_500,
  totalDue: 1_015_500,
  paidAmount: 0,
};

/** 9월분 — 이월·연체료 없음(0원 줄은 문구에서 빠져야 한다) */
const septemberCharge = {
  year: 2026,
  month: 9,
  dueDate: new Date("2026-09-05T00:00:00Z"),
  rentAmount: 650_000,
  maintenanceAmount: 50_000,
  carriedOverAmount: 0,
  lateFeeAmount: 0,
  totalDue: 700_000,
  paidAmount: 0,
};

const base: NoticeTemplateInput = {
  kind: "RENT_NOTICE",
  landlordName: "김임대",
  tenantName: "박세입",
  buildingName: "행당해피빌",
  unitLabel: "201호",
  lease: {
    monthlyRent: 650_000,
    maintenanceFee: 50_000,
    paymentDay: 5,
    startDate: new Date("2026-03-01T00:00:00Z"),
    endDate: new Date("2027-02-28T00:00:00Z"),
  },
  charge: septemberCharge,
  // 시계에 기대지 않게 기준일을 못 박는다
  asOf: new Date("2026-09-01T00:00:00Z"),
  bankAccount: { bankName: "자리은행", number: "1002-0917-2026", holder: "김임대" },
};

test("RENT_NOTICE — 월세 고지서", () => {
  const result = renderNoticeTemplate(base);
  expect(result.title).toBe("2026년 9월 월세 고지서");
  expect(result.body).toMatchInlineSnapshot(`
    "[자리톡] 2026년 9월 월세 고지서

    박세입님, 행당해피빌 201호 9월분 월세를 안내드립니다.

    · 월세 650,000원
    · 관리비 50,000원
    ─────────────
    납부하실 금액 700,000원
    납부기한 2026년 9월 5일 (D-4)

    입금 계좌
    자리은행 1002-0917-2026 (예금주 김임대)"
  `);
});

test("OVERDUE_NOTICE — 연체 안내(이월·연체료 포함)", () => {
  const result = renderNoticeTemplate({
    ...base,
    kind: "OVERDUE_NOTICE",
    charge: augustCharge,
  });
  expect(result.title).toBe("2026년 8월 월세 연체 안내");
  expect(result.body).toMatchInlineSnapshot(`
    "[자리톡] 2026년 8월 월세 연체 안내

    박세입님, 행당해피빌 201호 2026년 8월분 월세가 27일째 미납 상태입니다.

    · 월세 650,000원
    · 관리비 50,000원
    · 전월 이월 300,000원
    · 연체료 15,500원
    ─────────────
    미납 금액 1,015,500원
    납부기한 2026년 8월 5일 (27일 경과)

    입금 계좌
    자리은행 1002-0917-2026 (예금주 김임대)

    이미 납부하셨다면 이 안내는 무시하셔도 됩니다."
  `);
});

test("CONTRACT_EXPIRY — 만기 안내(청구 없이 렌더된다)", () => {
  const result = renderNoticeTemplate({ ...base, kind: "CONTRACT_EXPIRY", charge: null });
  expect(result.title).toBe("임대차 계약 만기 안내 (2027년 2월 28일)");
  expect(result.body).toMatchInlineSnapshot(`
    "[자리톡] 임대차 계약 만기 안내

    박세입님, 행당해피빌 201호 임대차 계약 만기가 다가옵니다.

    계약 기간 2026년 3월 1일 ~ 2027년 2월 28일
    만기까지 180일 남았습니다.

    · 월세 650,000원
    · 관리비 50,000원
    · 납부일 매월 5일

    재계약 또는 이사 계획을 임대인에게 알려 주세요."
  `);
});

test("부분납이면 이미 납부·남은 금액이 함께 적힌다", () => {
  const result = renderNoticeTemplate({
    ...base,
    charge: { ...septemberCharge, paidAmount: 400_000 },
  });
  expect(result.body).toContain("이미 납부 400,000원");
  expect(result.body).toContain("남은 금액 300,000원");
});

test("0원 항목은 문구에 넣지 않는다", () => {
  const body = renderNoticeTemplate(base).body;
  expect(body).toContain("· 월세 650,000원");
  expect(body).not.toContain("전월 이월");
  expect(body).not.toContain("연체료");
});

test("임대인 메모는 본문 끝에 붙는다", () => {
  const body = renderNoticeTemplate({ ...base, memo: "  이번 달부터 관리비가 조정됩니다.  " }).body;
  expect(body).toContain("임대인 메시지\n이번 달부터 관리비가 조정됩니다.");
});

test("월세·연체 고지서에 청구가 없으면 렌더에 실패한다(빈 고지서 방지)", () => {
  expect(() => renderNoticeTemplate({ ...base, charge: null })).toThrow(/청구/);
});

test("isOverdueLike — 기한 경과 + 미납 잔액이 있을 때만 참", () => {
  const asOf = new Date("2026-09-01T00:00:00Z");
  expect(isOverdueLike(augustCharge, asOf)).toBe(true);
  expect(isOverdueLike(septemberCharge, asOf)).toBe(false); // 기한(9/5) 전
  expect(isOverdueLike({ ...augustCharge, paidAmount: 1_015_500 }, asOf)).toBe(false); // 완납
});
