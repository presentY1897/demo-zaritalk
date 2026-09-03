/**
 * 통근시간 DTO (T3.5).
 *
 * **`@zari/db` 를 import 하지 않는다** — 매물 상세의 「내 근무지까지」 시트가 클라이언트
 * 컴포넌트다(T1.1 부터의 미러 DTO 패턴).
 *
 * 결과 자체는 T3.2·T3.3 이 이미 정해 둔 `ListingCommuteDto` 를 **그대로** 쓴다 —
 * 목록 배지·상세 시트가 캐시에서 읽는 모양과 온디맨드 조회 응답이 같아야
 * "조회한 값이 목록에 그대로 뜬다" 가 성립한다.
 */
import type { ListingCommuteDto } from "@/features/listing/types";

/**
 * 이동수단. **`car` 는 `CommuteCache.driving*` 컬럼**에 저장된다
 * (스키마 컬럼 이름이 `drivingMinutes`·`drivingDetail` 이라 DTO 도 그쪽을 따른다).
 */
export type CommuteMode = "transit" | "car";

type Assert<T extends true> = T;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * `ListingCommuteDto.mockModes`(T3.2·T3.3 소유 파일)와 `CommuteMode` 가 어긋나면
 * **여기서 컴파일이 깨진다.** 두 파일이 서로 import 하지 않고도 같은 유니온을 유지하는 장치다
 * (타입 순환을 만들지 않으려고 `listing/types.ts` 쪽에는 리터럴을 그대로 적어 뒀다).
 */
export type CommuteModeCheck = Assert<Same<CommuteMode, ListingCommuteDto["mockModes"][number]>>;

/**
 * 외부 제공자가 값을 주지 못한 이유.
 *
 * 화면은 사유별로 문구를 갈아 끼우지 않는다(사용자가 할 수 있는 일이 없다) —
 * 트래킹·로그와 "왜 한쪽만 나왔나" 를 설명하는 데 쓴다.
 */
export type CommuteFailureReason =
  /** 서버에 API 키가 없다(`KAKAO_REST_API_KEY` 누락) */
  | "NO_KEY"
  /** 키가 거절됐다(401·403) */
  | "UNAUTHORIZED"
  /** 쿼터 초과(429) */
  | "RATE_LIMITED"
  /** 그 밖의 4xx·5xx, 또는 응답을 알아볼 수 없음 */
  | "UPSTREAM"
  /** 네트워크 실패·타임아웃 */
  | "NETWORK"
  /** 호출은 됐지만 경로가 없다(출발·도착이 5m 안 등 — 카카오 `result_code != 0`) */
  | "NO_ROUTE";

/** 한 이동수단이 실패했을 때 응답에 실리는 한 줄 */
export type CommuteFailureDto = {
  mode: CommuteMode;
  reason: CommuteFailureReason;
  /** 업스트림 HTTP status(있을 때만) */
  status?: number | null;
};

/** `POST /api/commute` 요청 본문 */
export type CommuteLookupInput = {
  unitId: string;
  workplaceId: string;
};

/** `POST /api/commute` 200 응답 */
export type CommuteLookupResponse = {
  unitId: string;
  /** 배지·시트가 그대로 쓰는 결과(캐시에서 읽은 것과 같은 모양) */
  commute: ListingCommuteDto;
  /** 캐시를 그대로 돌려줬는가 — `true` 면 **외부 호출이 0건**이었다 */
  cached: boolean;
  /** 값을 얻지 못한 이동수단(부분 결과). 둘 다 성공했으면 빈 배열 */
  failures: CommuteFailureDto[];
};
