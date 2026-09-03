/**
 * 통근시간 **제공자 인터페이스** (T3.5 · [D9](../../../../../docs/DECISIONS.md)).
 *
 * ## 왜 인터페이스인가
 *
 * 두 이동수단의 **사정이 다르다**.
 *
 * | 이동수단 | 지금 구현 | 왜 |
 * |---|---|---|
 * | `car` | `kakao.ts` — 카카오모빌리티 REST **실연동** | 키가 있고 자동차 길찾기가 열려 있다 |
 * | `transit` | `transit.ts` — **모의**(좌표 기반 결정적 함수) | 카카오모빌리티 REST 에는 대중교통 경로 API 가 없다. 실연동하려면 ODsay 키가 필요하다 |
 *
 * ODsay 키가 생기면 **이 인터페이스를 만족하는 파일 하나**(`odsay.ts`)를 쓰고
 * `providers.ts` 의 `transit` 자리만 바꾼다. 서비스·캐시·라우트·화면은 그대로다.
 *
 * ## 규약 세 가지
 *
 * 1. **던지지 않는다.** 실패는 `CommuteResult` 로 접어 돌려준다 — 한쪽이 실패해도 나머지를
 *    저장해야 하기 때문이다(부분 결과). 카카오 클라이언트(T3.1 `features/address/kakao.ts`)·
 *    국토부 클라이언트(T4.3 `features/deals/molit.ts`)와 같은 방식이다.
 * 2. **`mock` 을 스스로 밝힌다.** 그 값이 화면의 「모의」 표시와 `CommuteCache.*Detail.mock` 이 된다.
 *    모의임을 숨기면 데모를 보는 사람이 대중교통 값을 실측으로 오해한다.
 * 3. **`detail` 은 그대로 `CommuteCache.transitDetail`·`drivingDetail`(Json)에 들어간다.**
 *    나중에 "이 값이 어디서 왔나" 를 되짚을 수 있어야 한다.
 */
import type { CommuteFailureReason, CommuteMode } from "./types";

/** 위경도 한 점 — `lib/geo/distance.ts` 의 `GeoPoint` 와 같은 모양이다 */
export type CommutePoint = { lat: number; lng: number };

/**
 * `CommuteCache.*Detail`(Json 컬럼)에 그대로 들어가는 값.
 *
 * `Record<string, unknown>` 으로 두면 Prisma 의 `InputJsonValue` 에 넣을 수 없다
 * (`unknown` 은 `undefined` 를 포함한다). **직렬화 가능한 값만** 담긴다는 뜻을 타입으로 못 박는다.
 */
export type CommuteDetailValue =
  | string
  | number
  | boolean
  | null
  | CommuteDetailValue[]
  | { [key: string]: CommuteDetailValue };
export type CommuteDetail = { [key: string]: CommuteDetailValue };

/** 한 이동수단의 계산 결과 한 건 */
export type CommuteLeg = {
  /** 소요 시간(분, 1 이상 정수) */
  minutes: number;
  /** 경로 거리(m). 제공자가 주지 않으면 null */
  distanceM: number | null;
  /** 이 값이 모의 제공자에서 나왔는가 */
  mock: boolean;
  /** `CommuteCache.*Detail` 에 그대로 저장할 요약(직렬화 가능한 값만) */
  detail: CommuteDetail;
};

export type CommuteFailure = {
  reason: CommuteFailureReason;
  status?: number | null;
  /** 업스트림이 준 원문 사유(있을 때만) — 로그·트래킹에만 쓴다 */
  detail?: string;
};

export type CommuteResult =
  | { ok: true; data: CommuteLeg }
  | { ok: false; failure: CommuteFailure };

/** 이동수단 하나를 책임지는 제공자 */
export type CommuteProvider = {
  readonly mode: CommuteMode;
  /** 모의 제공자인가 — `providers.ts` 와 문서·화면이 이 값을 읽는다 */
  readonly mock: boolean;
  /** 사람이 읽는 이름(`kakao-mobility`·`mock-transit`) — `detail.provider` 에 실린다 */
  readonly name: string;
  route(origin: CommutePoint, destination: CommutePoint): Promise<CommuteResult>;
};

/** 두 이동수단 한 벌 — 서비스가 통째로 주입받는다(테스트에서 갈아 끼운다) */
export type CommuteProviderSet = Record<CommuteMode, CommuteProvider>;
