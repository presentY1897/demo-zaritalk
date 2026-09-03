/**
 * 개인정보 마스킹 단위 테스트 (T6.3). DB 없이 돈다.
 * 결정과 근거는 `mask.ts` 주석에 있다.
 */
import { describe, expect, test } from "vitest";
import { maskAnonId, maskOtpBody, maskPhone } from "./mask";

describe("전화번호", () => {
  test("11자리는 가운데 4자리를 가린다", () => {
    expect(maskPhone("01011111111")).toBe("010-****-1111");
  });

  test("하이픈이 섞여 들어와도 같은 결과다", () => {
    expect(maskPhone("010-1111-1111")).toBe("010-****-1111");
  });

  test("10자리(구형 번호)도 가운데를 가린다", () => {
    expect(maskPhone("0111234567")).toBe("011-***-4567");
  });

  test("뒷자리는 남긴다 — 운영자가 사람을 특정할 수는 있어야 한다", () => {
    expect(maskPhone("01099998888").endsWith("8888")).toBe(true);
  });

  test("빈 값·null 은 빈 문자열", () => {
    expect(maskPhone(null)).toBe("");
    expect(maskPhone(undefined)).toBe("");
    expect(maskPhone("")).toBe("");
  });

  test("형식이 다른 값도 원문을 흘리지 않는다", () => {
    expect(maskPhone("0212345")).toBe("021-****");
    expect(maskPhone("12")).toBe("**");
  });
});

describe("anonId", () => {
  test("앞 8자리만 남긴다", () => {
    expect(maskAnonId("0123456789abcdef")).toBe("01234567…");
  });

  test("짧으면 그대로", () => {
    expect(maskAnonId("abc")).toBe("abc");
  });
});

describe("OTP 본문", () => {
  test("인증번호를 지운다 — 로그만 보고 남의 계정에 들어가지 못하게", () => {
    expect(maskOtpBody("[자리톡] 인증번호 482913 을 입력해 주세요.")).toBe(
      "[자리톡] 인증번호 •••••• 을 입력해 주세요.",
    );
  });

  test("네 자리 이상 숫자는 여러 번 나와도 전부 가린다", () => {
    expect(maskOtpBody("코드 482913, 만료 1757000000")).toBe("코드 ••••••, 만료 ••••••");
  });

  test("세 자리 이하 숫자는 남긴다 — 문장이 뭉개지지 않게(코드는 6자리다)", () => {
    expect(maskOtpBody("5분(300초) 안에 입력")).toBe("5분(300초) 안에 입력");
  });
});
