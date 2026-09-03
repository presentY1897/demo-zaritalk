/**
 * 어드민 인증 게이트 단위 테스트 (T6.3) — **이 task 의 핵심**.
 *
 * 확인하는 것 세 가지:
 * ① 세션 쿠키가 없으면 게이트가 막고 **web 을 부르지도 않는다**
 * ② web 이 401/403 을 주면 막는다 (쿠키 값이 아무 문자열이어도 통과하지 못한다)
 * ③ 통과할 때 **세션 쿠키만** 실려 나간다 — 서비스 시크릿을 함께 붙이지 않는다
 *    (붙이면 세션이 끊긴 요청이 시크릿으로 슬쩍 통과한다)
 *
 * `next/headers` 는 요청 컨텍스트 밖에서 못 쓰므로 모듈을 통째로 바꿔 끼운다(T0.3 패턴).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const jar = new Map<string, { name: string; value: string }>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => jar.get(name),
    set: (name: string, value: string) => jar.set(name, { name, value }),
    delete: (name: string) => jar.delete(name),
  }),
}));

const { ADMIN_SESSION_COOKIE, callWebAsAdmin, currentAdmin, requireAdminGate } = await import(
  "./auth"
);

const fetchMock = vi.fn();

beforeEach(() => {
  jar.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.NEXT_PUBLIC_WEB_URL = "http://web.test";
  process.env.ADMIN_API_SECRET = "service-secret";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ADMIN_API_SECRET;
});

function respondWith(status: number, body: unknown) {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("① 세션 쿠키가 없을 때", () => {
  test("게이트가 막고 web 을 부르지 않는다", async () => {
    const denied = await requireAdminGate();
    expect(denied).toMatchObject({ ok: false, status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("조회 호출도 401 로 끊긴다", async () => {
    const result = await callWebAsAdmin("/api/admin/users");
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("② 쿠키가 있어도 web 이 거절하면", () => {
  test("아무 문자열이나 넣은 쿠키는 통과하지 못한다", async () => {
    jar.set(ADMIN_SESSION_COOKIE, { name: ADMIN_SESSION_COOKIE, value: "made-up" });
    respondWith(401, { error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." } });

    expect(await requireAdminGate()).toMatchObject({ ok: false, status: 401 });
    expect(await currentAdmin()).toBeNull();
  });

  test("비어드민 세션(403)도 막힌다", async () => {
    jar.set(ADMIN_SESSION_COOKIE, { name: ADMIN_SESSION_COOKIE, value: "tenant-token" });
    respondWith(403, { error: { code: "FORBIDDEN", message: "관리자만 접근할 수 있습니다." } });

    expect(await currentAdmin()).toBeNull();
    expect(await requireAdminGate()).not.toBeNull();
  });
});

describe("③ 통과할 때", () => {
  test("관리자 신원을 돌려주고 게이트는 null 이다", async () => {
    jar.set(ADMIN_SESSION_COOKIE, { name: ADMIN_SESSION_COOKIE, value: "good-token" });
    respondWith(200, { admin: { id: "u1", name: "관리자", phone: "010-****-0000" } });

    expect(await currentAdmin()).toEqual({ id: "u1", name: "관리자", phone: "010-****-0000" });
    expect(await requireAdminGate()).toBeNull();
  });

  test("세션 쿠키만 실려 나간다 — 서비스 시크릿은 붙지 않는다", async () => {
    jar.set(ADMIN_SESSION_COOKIE, { name: ADMIN_SESSION_COOKIE, value: "good-token" });
    respondWith(200, { users: [] });

    await callWebAsAdmin("/api/admin/users?page=1");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://web.test/api/admin/users?page=1");
    const headers = init.headers as Record<string, string>;
    expect(headers.cookie).toBe("zari_session=good-token");
    expect(headers["x-admin-secret"]).toBeUndefined();
    expect(init.cache).toBe("no-store");
  });

  test("web 이 죽어 있으면 화면이 읽을 수 있는 실패를 준다", async () => {
    jar.set(ADMIN_SESSION_COOKIE, { name: ADMIN_SESSION_COOKIE, value: "good-token" });
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await callWebAsAdmin("/api/admin/users");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("NEXT_PUBLIC_WEB_URL");
  });
});
