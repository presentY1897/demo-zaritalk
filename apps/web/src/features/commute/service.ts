/**
 * 통근시간 계산 — **제공자를 나란히 부르고 부분 결과를 허용하는 곳** (T3.5).
 *
 * DB 도 HTTP 도 모르는 순수 오케스트레이션이다(제공자는 인자로 받는다). 그래서
 * "한쪽 실패 → 나머지만 저장", "양쪽 실패 → 저장하지 않음" 두 갈래를 네트워크 없이 테스트한다.
 *
 * ## 규칙
 *
 * - **병렬**이다(`Promise.all`). 순서대로 부르면 자동차 타임아웃 6초가 대중교통 앞을 막는다.
 * - **던지지 않는다.** 제공자가 규약을 어기고 throw 해도 `UPSTREAM` 실패로 접는다 —
 *   ODsay 구현이 들어올 때 화면이 500 으로 죽는 것을 막는 마지막 그물이다.
 * - 성공이 하나도 없으면 `anySuccess: false` 다. **호출부가 캐시를 건드리지 않는 근거**가 된다.
 */
import type {
  CommuteLeg,
  CommutePoint,
  CommuteProvider,
  CommuteProviderSet,
} from "./provider";
import type { CommuteFailureDto, CommuteMode } from "./types";

export type CommuteComputation = {
  transit: CommuteLeg | null;
  car: CommuteLeg | null;
  /** 값을 얻지 못한 이동수단(응답·트래킹에 그대로 실린다) */
  failures: CommuteFailureDto[];
  /** 한쪽이라도 값이 나왔는가 — false 면 저장하지 않는다 */
  anySuccess: boolean;
};

async function runProvider(
  provider: CommuteProvider,
  origin: CommutePoint,
  destination: CommutePoint,
): Promise<{ mode: CommuteMode; leg: CommuteLeg | null; failure: CommuteFailureDto | null }> {
  try {
    const result = await provider.route(origin, destination);
    if (result.ok) return { mode: provider.mode, leg: result.data, failure: null };
    return {
      mode: provider.mode,
      leg: null,
      failure: {
        mode: provider.mode,
        reason: result.failure.reason,
        status: result.failure.status ?? null,
      },
    };
  } catch {
    // 제공자는 던지지 않기로 돼 있지만(provider.ts 규약) 믿고 맡기지 않는다
    return {
      mode: provider.mode,
      leg: null,
      failure: { mode: provider.mode, reason: "UPSTREAM", status: null },
    };
  }
}

/** 두 이동수단을 나란히 계산한다. 실패는 `failures` 로 모으고 성공한 쪽은 그대로 살린다 */
export async function computeCommute(
  origin: CommutePoint,
  destination: CommutePoint,
  providers: CommuteProviderSet,
): Promise<CommuteComputation> {
  const [transit, car] = await Promise.all([
    runProvider(providers.transit, origin, destination),
    runProvider(providers.car, origin, destination),
  ]);

  const failures = [transit.failure, car.failure].filter(
    (failure): failure is CommuteFailureDto => failure !== null,
  );

  return {
    transit: transit.leg,
    car: car.leg,
    failures,
    anySuccess: transit.leg !== null || car.leg !== null,
  };
}
