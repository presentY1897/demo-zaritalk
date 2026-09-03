import { expect, test, vi } from "vitest";
import type { CommuteLeg, CommuteProvider, CommuteProviderSet, CommuteResult } from "./provider";
import { computeCommute } from "./service";
import type { CommuteFailureReason, CommuteMode } from "./types";

/**
 * 계산 오케스트레이션 (T3.5) — **제공자를 주입해** 부분 결과·전체 실패를 네트워크 없이 본다.
 * 이 경로가 라우트의 "한쪽 실패해도 저장 / 둘 다 실패하면 저장 안 함" 을 떠받친다.
 */

const A = { lat: 37.56152, lng: 127.03648 };
const B = { lat: 37.49794, lng: 127.02762 };

function leg(minutes: number, mock: boolean): CommuteLeg {
  return { minutes, distanceM: minutes * 500, mock, detail: { mock, provider: "test" } };
}

function stub(
  mode: CommuteMode,
  result: CommuteResult | (() => Promise<CommuteResult>),
  options: { mock?: boolean } = {},
): CommuteProvider {
  return {
    mode,
    mock: options.mock ?? false,
    name: `test-${mode}`,
    route: typeof result === "function" ? result : vi.fn(async () => result),
  };
}

function providers(transit: CommuteProvider, car: CommuteProvider): CommuteProviderSet {
  return { transit, car };
}

function failing(mode: CommuteMode, reason: CommuteFailureReason, status: number | null = null) {
  return stub(mode, { ok: false, failure: { reason, status } });
}

test("둘 다 성공하면 두 값이 다 담기고 실패 목록은 비어 있다", async () => {
  const result = await computeCommute(
    A,
    B,
    providers(stub("transit", { ok: true, data: leg(34, true) }, { mock: true }), stub("car", { ok: true, data: leg(28, false) })),
  );

  expect(result.transit?.minutes).toBe(34);
  expect(result.car?.minutes).toBe(28);
  expect(result.failures).toEqual([]);
  expect(result.anySuccess).toBe(true);
});

test("자동차가 실패해도 대중교통 값은 살아남는다 — 부분 결과", async () => {
  const result = await computeCommute(
    A,
    B,
    providers(stub("transit", { ok: true, data: leg(34, true) }, { mock: true }), failing("car", "RATE_LIMITED", 429)),
  );

  expect(result.transit?.minutes).toBe(34);
  expect(result.car).toBeNull();
  expect(result.anySuccess).toBe(true);
  expect(result.failures).toEqual([{ mode: "car", reason: "RATE_LIMITED", status: 429 }]);
});

test("대중교통이 실패해도 자동차 값은 살아남는다 — 반대 방향도 같다", async () => {
  const result = await computeCommute(
    A,
    B,
    providers(failing("transit", "UPSTREAM", 500), stub("car", { ok: true, data: leg(28, false) })),
  );

  expect(result.transit).toBeNull();
  expect(result.car?.minutes).toBe(28);
  expect(result.anySuccess).toBe(true);
  expect(result.failures.map((failure) => failure.mode)).toEqual(["transit"]);
});

test("둘 다 실패하면 anySuccess 가 false 다 — 라우트가 캐시를 만들지 않는 근거", async () => {
  const result = await computeCommute(
    A,
    B,
    providers(failing("transit", "NETWORK"), failing("car", "NO_KEY")),
  );

  expect(result.anySuccess).toBe(false);
  expect(result.transit).toBeNull();
  expect(result.car).toBeNull();
  expect(result.failures).toHaveLength(2);
  expect(result.failures.map((failure) => failure.reason).sort()).toEqual(["NETWORK", "NO_KEY"]);
});

test("제공자가 규약을 어기고 throw 해도 화면이 죽지 않는다 — UPSTREAM 실패로 접는다", async () => {
  const exploding = stub("car", async () => {
    throw new Error("ODsay 구현이 터졌다고 치자");
  });

  const result = await computeCommute(
    A,
    B,
    providers(stub("transit", { ok: true, data: leg(34, true) }, { mock: true }), exploding),
  );

  expect(result.anySuccess).toBe(true);
  expect(result.transit?.minutes).toBe(34);
  expect(result.failures).toEqual([{ mode: "car", reason: "UPSTREAM", status: null }]);
});

test("두 제공자를 나란히 부른다 — 느린 쪽이 빠른 쪽을 막지 않는다", async () => {
  const order: string[] = [];
  const slow = stub("car", async () => {
    order.push("car:start");
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push("car:end");
    return { ok: true, data: leg(28, false) };
  });
  const fast = stub("transit", async () => {
    order.push("transit:start");
    return { ok: true, data: leg(34, true) };
  });

  await computeCommute(A, B, providers(fast, slow));

  // 자동차가 끝나기 전에 대중교통이 이미 시작했다 = 직렬이 아니다
  expect(order.indexOf("transit:start")).toBeLessThan(order.indexOf("car:end"));
});
