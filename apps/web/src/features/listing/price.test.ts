/**
 * 금액·조건 표기 단위 테스트 (T3.2·T3.3) — **DB 없이 돈다**.
 *
 * 핀·카드·상세·메타·JSON-LD 가 전부 이 함수들의 결과를 그대로 쓰므로, 문자열이 흔들리면
 * "핀에서 본 그 집" 인지 알 수 없게 된다.
 */
import { describe, expect, test } from "vitest";
import {
  DEAL_TYPE_LABEL,
  formatArea,
  formatAvailableFrom,
  formatFloor,
  formatMoneyKo,
  formatRooms,
  formatWon,
  pinLabel,
  priceLabel,
} from "./price";

describe("formatMoneyKo", () => {
  test("만원 단위로 줄인다", () => {
    expect(formatMoneyKo(500_000)).toBe("50만");
    expect(formatMoneyKo(10_000_000)).toBe("1,000만");
  });

  test("억을 넘으면 억부터 적는다", () => {
    expect(formatMoneyKo(100_000_000)).toBe("1억");
    expect(formatMoneyKo(250_000_000)).toBe("2억 5,000만");
    expect(formatMoneyKo(1_200_000_000)).toBe("12억");
  });

  test("만원으로 떨어지지 않으면 원 단위까지 보여 준다(임의 반올림 금지)", () => {
    expect(formatMoneyKo(12_345)).toBe("1만 2,345원");
    expect(formatMoneyKo(999)).toBe("999원");
  });

  test("0 은 0원", () => {
    expect(formatMoneyKo(0)).toBe("0원");
  });

  test("숫자가 아니면 -", () => {
    expect(formatMoneyKo(Number.NaN)).toBe("-");
  });

  test("formatWon 은 원 단위 전체를 적는다", () => {
    expect(formatWon(1_000_000)).toBe("1,000,000원");
  });
});

describe("priceLabel / pinLabel", () => {
  const wolse = { dealType: "WOLSE" as const, deposit: 10_000_000, monthlyRent: 500_000 };
  const jeonse = { dealType: "JEONSE" as const, deposit: 250_000_000, monthlyRent: 0 };

  test("월세는 보증금/월세를 함께 적는다", () => {
    expect(priceLabel(wolse)).toBe("월세 1,000만/50만");
  });

  test("전세는 보증금만 적는다", () => {
    expect(priceLabel(jeonse)).toBe("전세 2억 5,000만");
  });

  test("핀은 한 값만 — 월세는 월세, 전세는 보증금", () => {
    expect(pinLabel(wolse)).toBe("월 50만");
    expect(pinLabel(jeonse)).toBe("전세 2억 5,000만");
  });

  test("거래유형 라벨", () => {
    expect(DEAL_TYPE_LABEL.JEONSE).toBe("전세");
    expect(DEAL_TYPE_LABEL.WOLSE).toBe("월세");
  });
});

describe("호실 조건 표기", () => {
  test("면적은 평을 함께 준다", () => {
    expect(formatArea(23.1)).toBe("23.1㎡ (약 7.0평)");
  });

  test("면적이 없거나 0 이면 null", () => {
    expect(formatArea(null)).toBeNull();
    expect(formatArea(0)).toBeNull();
  });

  test("지하 층은 음수로 온다", () => {
    expect(formatFloor(1)).toBe("1층");
    expect(formatFloor(-1)).toBe("지하 1층");
    expect(formatFloor(null)).toBeNull();
  });

  test("방 수는 원룸·투룸으로 읽는다", () => {
    expect(formatRooms(1)).toBe("원룸");
    expect(formatRooms(2)).toBe("투룸");
    expect(formatRooms(3)).toBe("3룸");
    expect(formatRooms(0)).toBeNull();
    expect(formatRooms(null)).toBeNull();
  });

  test("입주가능일이 없으면 즉시 입주", () => {
    expect(formatAvailableFrom(null)).toBe("즉시 입주");
    expect(formatAvailableFrom("2026-11-01")).toBe("2026.11.01 입주 가능");
  });
});
