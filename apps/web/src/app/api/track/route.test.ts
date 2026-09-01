/**
 * `POST /api/track` API 테스트(D8) — Route Handler 를 `Request` 로 직접 호출한다.
 *
 * `next/headers` 의 `cookies()` 는 요청 컨텍스트 밖(vitest node 환경)에서 동작하지 않으므로
 * 테스트가 채워 넣는 쿠키 통으로 대체한다. 로그인 여부(`getCurrentUser`)만 이 통을 본다.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const { cookieJar } = vi.hoisted(() => ({ cookieJar: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
    has: (name: string) => cookieJar.has(name),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

import { assertTestDatabase, prisma, resetDb } from "@zari/db/testing";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { ANON_ID_COOKIE, createAnonId, isAnonId } from "@/lib/tracking/anon-id";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { POST } from "./route";

const ANON_ID = createAnonId();

/**
 * DB를 쓰는 suite 에 재시도를 건다.
 *
 * `pnpm test` 는 web·packages 프로젝트를 **병렬로** 돌리는데 두 프로젝트가 같은 테스트 DB를 본다.
 * packages 쪽 `testing.test.ts` 의 `resetDb()`(TRUNCATE)가 이 파일의 테스트와 겹치면 방금 넣은
 * 행이 지워져 엉뚱하게 실패한다. 근본 해결은 루트 `vitest.config.ts` 에 `fileParallelism: false`
 * (또는 프로젝트별 테스트 DB 분리)를 넣는 것인데 그 파일은 이 task 소유가 아니라 재시도로 막아둔다.
 */
const DB_SUITE = { retry: 3 } as const;

function trackRequest(body: unknown, options?: { cookie?: string; raw?: string }): Request {
  return new Request("http://localhost:3000/api/track", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options?.cookie ? { cookie: options.cookie } : {}),
    },
    body: options?.raw ?? JSON.stringify(body),
  });
}

beforeEach(async () => {
  assertTestDatabase();
  await resetDb();
  cookieJar.clear();
});

describe("배열 수집", DB_SUITE, () => {
  test("배열로 보낸 이벤트가 하나도 빠짐없이 저장된다", async () => {
    const response = await POST(
      trackRequest(
        [
          { name: TRACK_EVENTS.NOTICE_VIEW, path: "/notice/abc", sessionId: "sess-1" },
          {
            name: TRACK_EVENTS.NOTICE_CTA_CLICK,
            path: "/notice/abc",
            props: { variant: "B" },
            sessionId: "sess-1",
          },
          { name: TRACK_EVENTS.SIGNUP_START, path: "/signup", sessionId: "sess-1" },
        ],
        { cookie: `${ANON_ID_COOKIE}=${ANON_ID}` },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accepted: 3 });

    const rows = await prisma.trackingEvent.findMany({ orderBy: { name: "asc" } });
    expect(rows.map((row) => row.name)).toEqual([
      "notice_cta_click",
      "notice_view",
      "signup_start",
    ]);
    expect(rows.every((row) => row.anonId === ANON_ID)).toBe(true);
    expect(rows.every((row) => row.sessionId === "sess-1")).toBe(true);
    expect(rows.find((row) => row.name === "notice_cta_click")?.props).toEqual({ variant: "B" });
    expect(rows.find((row) => row.name === "notice_view")?.path).toBe("/notice/abc");
  });

  test("단건도 그대로 받는다", async () => {
    const response = await POST(
      trackRequest(
        { name: TRACK_EVENTS.PAGE_VIEW, path: "/" },
        { cookie: `${ANON_ID_COOKIE}=${ANON_ID}` },
      ),
    );

    expect(response.status).toBe(200);
    const rows = await prisma.trackingEvent.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("page_view");
    expect(rows[0]?.props).toBeNull();
  });
});

describe("스키마 불일치", DB_SUITE, () => {
  const cases: { label: string; body: unknown }[] = [
    { label: "name 이 없다", body: { path: "/" } },
    { label: "이름 규약을 어겼다(카멜케이스)", body: { name: "pageView" } },
    { label: "이름 규약을 어겼다(하이픈)", body: { name: "notice-cta-click" } },
    { label: "이름이 한 마디뿐이다", body: { name: "click" } },
    { label: "빈 배열이다", body: [] },
    { label: "배열 안 한 건이 깨졌다", body: [{ name: "page_view" }, { name: "Nope" }] },
    { label: "props 가 객체가 아니다", body: { name: "page_view", props: "hello" } },
    { label: "anonId 형식이 아니다", body: { name: "page_view", anonId: "짧음" } },
  ];

  test.for(cases)("400 으로 막고 아무것도 저장하지 않는다 — $label", async ({ body }) => {
    const response = await POST(trackRequest(body, { cookie: `${ANON_ID_COOKIE}=${ANON_ID}` }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(await prisma.trackingEvent.count()).toBe(0);
  });

  test("JSON 이 아니면 400", async () => {
    const response = await POST(trackRequest(null, { raw: "not json" }));
    expect(response.status).toBe(400);
    expect(await prisma.trackingEvent.count()).toBe(0);
  });
});

describe("anonId 해석", DB_SUITE, () => {
  test("요청에 anonId 가 하나도 없으면 서버가 발급해 저장하고 응답 쿠키로 내려준다", async () => {
    const response = await POST(trackRequest({ name: TRACK_EVENTS.PAGE_VIEW, path: "/" }));

    expect(response.status).toBe(200);

    const setCookie = response.headers.get("set-cookie") ?? "";
    const issued = /zari_anon=([0-9a-f]{32})/.exec(setCookie)?.[1];
    expect(isAnonId(issued)).toBe(true);
    expect(setCookie).toContain("Max-Age=31536000");

    const rows = await prisma.trackingEvent.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.anonId).toBe(issued);
  });

  test("쿠키에 anonId 가 있으면 새로 발급하지 않는다", async () => {
    const response = await POST(
      trackRequest({ name: TRACK_EVENTS.PAGE_VIEW }, { cookie: `${ANON_ID_COOKIE}=${ANON_ID}` }),
    );

    expect(response.headers.get("set-cookie")).toBeNull();
    const rows = await prisma.trackingEvent.findMany();
    expect(rows[0]?.anonId).toBe(ANON_ID);
  });

  test("본문 anonId 가 쿠키보다 우선한다(쿠키는 덮어쓰지 않는다)", async () => {
    const bodyAnonId = createAnonId();
    const response = await POST(
      trackRequest(
        { name: TRACK_EVENTS.PAGE_VIEW, anonId: bodyAnonId },
        { cookie: `${ANON_ID_COOKIE}=${ANON_ID}` },
      ),
    );

    expect(response.headers.get("set-cookie")).toBeNull();
    const rows = await prisma.trackingEvent.findMany();
    expect(rows[0]?.anonId).toBe(bodyAnonId);
  });
});

describe("로그인 연결", DB_SUITE, () => {
  test("로그인 상태면 userId 를 붙여 저장한다", async () => {
    const user = await prisma.user.create({ data: { phone: "01011112222", name: "트래킹" } });
    const token = "test-session-token";
    await prisma.session.create({
      data: { token, userId: user.id, expiresAt: new Date(Date.now() + 60_000) },
    });
    cookieJar.set(SESSION_COOKIE, token);

    await POST(
      trackRequest(
        [{ name: TRACK_EVENTS.SIGNUP_COMPLETE }, { name: TRACK_EVENTS.PAGE_VIEW }],
        { cookie: `${ANON_ID_COOKIE}=${ANON_ID}` },
      ),
    );

    const rows = await prisma.trackingEvent.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.userId === user.id)).toBe(true);
    expect(rows.every((row) => row.anonId === ANON_ID)).toBe(true);
  });

  test("로그인하지 않았으면 userId 는 비어 있다", async () => {
    await POST(
      trackRequest({ name: TRACK_EVENTS.PAGE_VIEW }, { cookie: `${ANON_ID_COOKIE}=${ANON_ID}` }),
    );

    const rows = await prisma.trackingEvent.findMany();
    expect(rows[0]?.userId).toBeNull();
  });
});
