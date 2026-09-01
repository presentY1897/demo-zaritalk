import { assertTestDatabase, prisma, resetDb } from "@zari/db/testing";
import { beforeEach, expect, test, vi } from "vitest";
import { consumeSignupTicket, verifySignupTicket } from "@/lib/auth/otp";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { getTestCookie, resetTestCookies } from "@/lib/auth/testing";
import { POST as requestOtp } from "../request/route";
import { POST } from "./route";

// Route Handler 안의 cookies() 를 인메모리 쿠키 저장소로 바꿔 끼운다(@/lib/auth/testing 참고)
vi.mock("next/headers", () => import("@/lib/auth/testing"));

const PHONE = "01077776666";

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** 실제 흐름대로 발급 라우트를 거쳐 코드를 얻는다. */
async function issueCode(phone = PHONE): Promise<string> {
  const res = await requestOtp(jsonRequest("http://localhost/api/auth/otp/request", { phone }));
  return (await res.json()).code as string;
}

function verify(body: unknown): Promise<Response> {
  return POST(jsonRequest("http://localhost/api/auth/auth/otp/verify", body));
}

async function createTenantUser() {
  return prisma.user.create({
    data: { phone: PHONE, name: "박세입", profiles: { create: { type: "TENANT" } } },
    include: { profiles: true },
  });
}

// ---- ① 정상 ----

test("정상 코드 + 기존 회원이면 세션을 발급한다", async () => {
  const user = await createTenantUser();
  const code = await issueCode();

  const res = await verify({ phone: PHONE, code });
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body.status).toBe("SESSION");
  expect(body.user.id).toBe(user.id);
  expect(body.activeProfile.type).toBe("TENANT");

  // 세션 쿠키 = DB Session 레코드
  const cookie = getTestCookie(SESSION_COOKIE);
  expect(cookie?.httpOnly).toBe(true);
  const session = await prisma.session.findUniqueOrThrow({ where: { token: cookie!.value } });
  expect(session.userId).toBe(user.id);

  // 코드는 소비되어 verifiedAt 이 찍힌다
  const otp = await prisma.otpCode.findFirstOrThrow({ where: { phone: PHONE } });
  expect(otp.verifiedAt).not.toBeNull();
});

test("정상 코드 + 신규 번호면 세션 대신 가입 티켓을 준다", async () => {
  const code = await issueCode();

  const res = await verify({ phone: PHONE, code });
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body.status).toBe("SIGNUP_REQUIRED");
  expect(body.phone).toBe(PHONE);
  expect(body.signupTicket).toBeTruthy();
  expect(new Date(body.ticketExpiresAt).getTime()).toBeGreaterThan(Date.now());

  // 세션은 발급되지 않는다
  expect(getTestCookie(SESSION_COOKIE)).toBeUndefined();
  expect(await prisma.session.count()).toBe(0);

  // 티켓 = 검증 완료된 OtpCode 레코드 id — T0.4 가 이 헬퍼로 소진한다
  const checked = await verifySignupTicket(body.signupTicket);
  expect(checked).toEqual({ ok: true, phone: PHONE, expiresAt: expect.any(Date) });

  const consumed = await consumeSignupTicket(body.signupTicket);
  expect(consumed.ok).toBe(true);
  expect(await prisma.otpCode.count()).toBe(0); // 1회용
  expect((await verifySignupTicket(body.signupTicket)).ok).toBe(false); // 재사용 불가
});

// ---- ② 만료 ----

test("만료된 코드는 OTP_EXPIRED 로 거부한다", async () => {
  await createTenantUser();
  await prisma.otpCode.create({
    data: { phone: PHONE, code: "123456", expiresAt: new Date(Date.now() - 1000) },
  });

  const res = await verify({ phone: PHONE, code: "123456" });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("OTP_EXPIRED");
  expect(await prisma.session.count()).toBe(0);
});

// ---- ③ 오코드 ----

test("발급되지 않은 코드는 OTP_INVALID 로 거부한다", async () => {
  await createTenantUser();
  const code = await issueCode();
  const wrong = code === "000000" ? "111111" : "000000";

  const res = await verify({ phone: PHONE, code: wrong });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("OTP_INVALID");
  expect(await prisma.session.count()).toBe(0);
});

test("다른 번호로 발급된 코드는 통하지 않는다", async () => {
  await createTenantUser();
  const code = await issueCode("01055554444");

  const res = await verify({ phone: PHONE, code });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("OTP_INVALID");
});

// ---- ④ 재사용 ----

test("이미 사용한 코드는 OTP_ALREADY_USED 로 거부한다", async () => {
  await createTenantUser();
  const code = await issueCode();

  expect((await verify({ phone: PHONE, code })).status).toBe(200);

  const res = await verify({ phone: PHONE, code });
  expect(res.status).toBe(409);
  expect((await res.json()).error.code).toBe("OTP_ALREADY_USED");
  expect(await prisma.session.count()).toBe(1); // 세션이 늘지 않는다
});

test("코드 형식이 6자리 숫자가 아니면 400", async () => {
  const res = await verify({ phone: PHONE, code: "12ab" });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
});
