import { assertTestDatabase, prisma, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { resetTestCookies } from "@/lib/auth/testing";
import { POST } from "./route";

// Route Handler 안의 cookies() 를 인메모리 쿠키 저장소로 바꿔 끼운다(@/lib/auth/testing 참고)
vi.mock("next/headers", () => import("@/lib/auth/testing"));

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

function requestOtp(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/auth/otp/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

test("인증번호를 발급하고 데모용으로 응답에 코드를 노출한다", async () => {
  const res = await requestOtp({ phone: "010-9999-8888" });
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body.phone).toBe("01099998888"); // 하이픈 제거 후 저장·응답
  expect(body.code).toMatch(/^\d{6}$/);
  expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());

  const otp = await prisma.otpCode.findFirstOrThrow({ where: { phone: "01099998888" } });
  expect(otp.code).toBe(body.code);
  expect(otp.verifiedAt).toBeNull();
});

test("발송 로그(MessageLog kind=OTP)에도 코드가 남는다", async () => {
  const res = await requestOtp({ phone: "01099998888" });
  const { code } = await res.json();

  const log = await prisma.messageLog.findFirstOrThrow({ where: { toPhone: "01099998888" } });
  expect(log.kind).toBe("OTP");
  expect(log.body).toContain(code);
});

test("휴대폰 형식이 아니면 400", async () => {
  const res = await requestOtp({ phone: "02-123-4567" });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
});
