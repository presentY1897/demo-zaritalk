import { expect, test } from "vitest";
import { formatPhone, isValidPhone, normalizePhone, phoneSchema } from "./phone";

test("normalizePhone 은 하이픈·공백을 지운다", () => {
  expect(normalizePhone("010-1111-1111")).toBe("01011111111");
  expect(normalizePhone(" 010 1111 1111 ")).toBe("01011111111");
  expect(normalizePhone("01011111111")).toBe("01011111111");
});

test("isValidPhone 은 휴대폰 형식만 통과시킨다", () => {
  expect(isValidPhone("010-1111-1111")).toBe(true);
  expect(isValidPhone("01712345678")).toBe(true);
  expect(isValidPhone("0212345678")).toBe(false); // 지역번호
  expect(isValidPhone("0101111")).toBe(false); // 자릿수 부족
});

test("phoneSchema 는 정규화된 번호를 돌려준다", () => {
  expect(phoneSchema.parse("010-2222-2222")).toBe("01022222222");
  expect(phoneSchema.safeParse("hello").success).toBe(false);
});

test("formatPhone 은 표시용 하이픈을 붙인다", () => {
  expect(formatPhone("01011111111")).toBe("010-1111-1111");
  expect(formatPhone("0111234567")).toBe("011-123-4567");
});
