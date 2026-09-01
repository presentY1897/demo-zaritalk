/**
 * 테스트용 `next/headers` 대체 모듈 (T0.3).
 *
 * Route Handler 를 vitest(node 환경)에서 `Request` 로 직접 호출하면 Next 의 요청
 * 컨텍스트가 없어 `cookies()` 가 터진다. 그래서 모듈 자체를 통째로 바꿔 끼운다.
 *
 * ```ts
 * // 파일 맨 위 — vi.mock 은 호이스팅되므로 팩토리에서 이 모듈을 동적 import 한다.
 * vi.mock("next/headers", () => import("@/lib/auth/testing"));
 *
 * import { resetTestCookies, setTestCookie, getTestCookie } from "@/lib/auth/testing";
 *
 * beforeEach(() => resetTestCookies());
 * ```
 *
 * 쿠키 저장소는 모듈 스코프의 Map 한 개다 — 테스트 파일이 정상 import 하는 인스턴스와
 * `vi.mock` 팩토리가 돌려주는 인스턴스가 같으므로, 핸들러가 심은 쿠키를 그대로 검사할 수 있다.
 * 앱 코드에서는 절대 import 하지 않는다(`@zari/db/testing` 과 같은 규칙).
 */

/** Next 의 ResponseCookie 를 흉내낸 평평한 형태 — 옵션까지 그대로 검사할 수 있다. */
export type TestCookie = {
  name: string;
  value: string;
  httpOnly?: boolean;
  sameSite?: boolean | "lax" | "strict" | "none";
  path?: string;
  secure?: boolean;
  expires?: Date;
  maxAge?: number;
  domain?: string;
};

const jar = new Map<string, TestCookie>();

type SetOptions = Omit<TestCookie, "name" | "value">;

export const testCookieStore = {
  get(name: string): TestCookie | undefined {
    return jar.get(name);
  },
  getAll(name?: string): TestCookie[] {
    const all = [...jar.values()];
    return name ? all.filter((c) => c.name === name) : all;
  },
  has(name: string): boolean {
    return jar.has(name);
  },
  set(nameOrCookie: string | TestCookie, value?: string, options?: SetOptions): void {
    if (typeof nameOrCookie === "string") {
      jar.set(nameOrCookie, { name: nameOrCookie, value: value ?? "", ...options });
      return;
    }
    jar.set(nameOrCookie.name, { ...nameOrCookie });
  },
  delete(name: string): void {
    jar.delete(name);
  },
  toString(): string {
    return [...jar.values()].map((c) => `${c.name}=${c.value}`).join("; ");
  },
};

/** `next/headers` 의 cookies() 대체 — 실제와 똑같이 async 다. */
export async function cookies(): Promise<typeof testCookieStore> {
  return testCookieStore;
}

/** `next/headers` 의 headers() 대체 — 빈 헤더. */
export async function headers(): Promise<Headers> {
  return new Headers();
}

/** beforeEach 에서 호출 — 테스트 간 쿠키 격리. */
export function resetTestCookies(): void {
  jar.clear();
}

/** 요청에 이미 쿠키가 붙어 있는 상황(로그인 상태)을 만든다. */
export function setTestCookie(name: string, value: string): void {
  jar.set(name, { name, value });
}

/** 핸들러가 심은 쿠키를 옵션까지 확인한다. */
export function getTestCookie(name: string): TestCookie | undefined {
  return jar.get(name);
}
