/**
 * `POST /api/deals/sync` API 테스트 (T4.3) — 인증과 응답 포장.
 *
 * 수집 로직 자체(멱등·부분 실패·알림)는 `features/deals/sync.test.ts` 담당이고,
 * 여기서는 **세 트리거 경로의 인증**과 검증·응답 모양만 본다.
 */
import { prisma, ProfileType } from "@zari/db";
import { assertTestDatabase, resetDb } from "@zari/db/testing";
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/headers", () => import("@/lib/auth/testing"));

import { CRON_SECRET_HEADER } from "@/app/api/cron/daily/auth";
import { ADMIN_SECRET_HEADER } from "@/features/deals/ownership";
import { mockMolitFetch, readDealFixture } from "@/features/deals/testing";
import { loginAs } from "@/features/landlord/testing";
import { resetTestCookies, setTestCookie } from "@/lib/auth/testing";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { POST } from "./route";

const TRADE = readDealFixture("trade-11200-202607");
const EMPTY = readDealFixture("empty");

const SECRET = "test-cron-secret";
const ORIGINAL_CRON = process.env.CRON_SECRET;
const ORIGINAL_ADMIN = process.env.ADMIN_API_SECRET;

const url = "http://localhost:3000/api/deals/sync";

function request(headers: Record<string, string> = {}, body?: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function createUser(phone: string, name: string, isAdmin: boolean) {
  return prisma.user.create({
    data: { phone, name, isAdmin, profiles: { create: { type: ProfileType.LANDLORD } } },
    include: { profiles: true },
  });
}

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  resetTestCookies();
  process.env.CRON_SECRET = SECRET;
  delete process.env.ADMIN_API_SECRET;
  vi.stubEnv("DATA_GO_KR_API_KEY", "test-decoded-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

afterAll(() => {
  if (ORIGINAL_CRON === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_CRON;
  if (ORIGINAL_ADMIN === undefined) delete process.env.ADMIN_API_SECRET;
  else process.env.ADMIN_API_SECRET = ORIGINAL_ADMIN;
});

describe("무인증 401 · 비어드민 403", () => {
  test("헤더가 아예 없으면 401", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
  });

  test("크론 시크릿이 틀리면 401", async () => {
    expect((await POST(request({ [CRON_SECRET_HEADER]: "wrong" }))).status).toBe(401);
  });

  test("길이만 같고 값이 다른 시크릿도 401", async () => {
    expect(
      (await POST(request({ [CRON_SECRET_HEADER]: "x".repeat(SECRET.length) }))).status,
    ).toBe(401);
  });

  test("어드민 시크릿이 틀리면 403 (관리자 계정을 찾지 못한다)", async () => {
    await createUser("01000000000", "관리자", true);
    const response = await POST(request({ [ADMIN_SECRET_HEADER]: "wrong" }));
    expect(response.status).toBe(403);
  });

  test("**로그인했지만 어드민이 아니면 403**", async () => {
    const user = await createUser("01011111111", "김임대", false);
    setTestCookie(SESSION_COOKIE, await loginAs(user.id));
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
  });

  test("401·403 이면 국토부를 부르지 않는다", async () => {
    const calls = mockMolitFetch({ TRADE: { xml: EMPTY }, RENT: { xml: EMPTY } });
    await POST(request());
    expect(calls).toHaveLength(0);
    expect(await prisma.realTransaction.count()).toBe(0);
  });
});

describe("트리거 3경로 중 둘(HTTP) — 인증 통과", () => {
  test("① 크론: x-cron-secret", async () => {
    mockMolitFetch({ TRADE: [{ xml: TRADE }, { xml: EMPTY }], RENT: { xml: EMPTY } });
    const response = await POST(
      request({ [CRON_SECRET_HEADER]: SECRET }, { lawdCd: "11200", months: ["202607"] }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, triggeredBy: "CRON", regionsScanned: 1, monthsScanned: 1 });
    expect(body.created).toBeGreaterThan(0);
  });

  test("① 크론: Authorization: Bearer (Vercel Cron)", async () => {
    mockMolitFetch({ TRADE: { xml: EMPTY }, RENT: { xml: EMPTY } });
    const response = await POST(
      request({ authorization: `Bearer ${SECRET}` }, { lawdCd: "11200", months: ["202607"] }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).triggeredBy).toBe("CRON");
  });

  test("② 어드민 세션(isAdmin)", async () => {
    const admin = await createUser("01000000000", "관리자", true);
    setTestCookie(SESSION_COOKIE, await loginAs(admin.id));
    mockMolitFetch({ TRADE: { xml: EMPTY }, RENT: { xml: EMPTY } });

    const response = await POST(request({}, { lawdCd: "11200", months: ["202607"] }));
    expect(response.status).toBe(200);
    expect((await response.json()).triggeredBy).toBe("ADMIN");
  });

  test("② 어드민 서비스 시크릿(x-admin-secret) — 실재하는 isAdmin 계정이 있어야 한다", async () => {
    await createUser("01000000000", "관리자", true);
    mockMolitFetch({ TRADE: { xml: EMPTY }, RENT: { xml: EMPTY } });

    const response = await POST(
      request({ [ADMIN_SECRET_HEADER]: SECRET }, { lawdCd: "11200", months: ["202607"] }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).triggeredBy).toBe("ADMIN");
  });

  test("본문 없이 불러도 된다 — 크론이 그렇게 부른다", async () => {
    const calls = mockMolitFetch({ TRADE: { xml: EMPTY }, RENT: { xml: EMPTY } });
    const response = await POST(new Request(url, { method: "POST", headers: { [CRON_SECRET_HEADER]: SECRET } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    // 대상 지역이 없으므로(구독·수집분 없음) 아무것도 부르지 않는다
    expect(body.regionsScanned).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe("검증", () => {
  const auth = { [CRON_SECRET_HEADER]: SECRET };

  test("모르는 지역은 400", async () => {
    const response = await POST(request(auth, { lawdCd: "99999" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  test("YYYYMM 이 아닌 월은 400", async () => {
    expect((await POST(request(auth, { months: ["2026"] }))).status).toBe(400);
    expect((await POST(request(auth, { months: ["202613"] }))).status).toBe(400);
    expect((await POST(request(auth, { months: ["200512"] }))).status).toBe(400);
  });

  test("모르는 유형은 400", async () => {
    expect((await POST(request(auth, { dealTypes: ["RENT"] }))).status).toBe(400);
  });

  test("깨진 JSON 은 400", async () => {
    const response = await POST(
      new Request(url, { method: "POST", headers: auth, body: "{oops" }),
    );
    expect(response.status).toBe(400);
  });

  test("검증 실패면 국토부를 부르지 않는다", async () => {
    const calls = mockMolitFetch({ TRADE: { xml: EMPTY } });
    await POST(request(auth, { lawdCd: "99999" }));
    expect(calls).toHaveLength(0);
  });
});

describe("부분 실패는 200 이다", () => {
  test("failures 를 응답에 그대로 싣는다", async () => {
    mockMolitFetch({ TRADE: { status: 500, xml: "" }, RENT: { status: 500, xml: "" } });
    const response = await POST(
      request({ [CRON_SECRET_HEADER]: SECRET }, { lawdCd: "11200", months: ["202607"] }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.failures).toHaveLength(2);
    expect(body.failures[0]).toMatchObject({ lawdCd: "11200", dealYm: "202607" });
  });
});
