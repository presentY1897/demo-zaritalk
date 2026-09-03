/**
 * `CommuteCache` 읽기·쓰기와 **재계산 주기(TTL)** (T3.5) — 서버 전용.
 *
 * ## 왜 캐시가 필요한가
 *
 * (호실, 근무지) 쌍마다 외부 API 를 부른다. 매물 100개 × 근무지 5곳이면 500쌍이고, 목록을
 * 스크롤할 때마다 다시 부르면 쿼터가 순식간에 마른다. 그래서 **조회는 상세에서 한 번**,
 * 목록은 그 결과를 배지로 재사용한다(T3.2 가 정한 구조).
 *
 * ## TTL — 완전한 값 7일 · 부분 결과 1시간
 *
 * | 행 | TTL | 근거 |
 * |---|---|---|
 * | 두 값이 다 있다 | **7일** | 이 값을 좌우하는 것은 도로망·노선이지 실시간 교통이 아니다. 우리는 "이 집이 저 집보다 가까운가" 라는 **비교용 상대값**으로 쓴다. 반대로 영원히 두면 도로 개통·노선 변경을 놓친다. 매물 하나당 근무지 5곳이라도 주당 5회다 |
 * | 한쪽이 비었다(부분 결과) | **1시간** | 빈 칸은 대개 일시적 실패(쿼터·타임아웃)다. 7일을 기다리면 그동안 자동차 값이 영영 안 뜬다. 그렇다고 즉시 재시도하면 장애가 난 동안 매 요청이 외부로 나간다 |
 *
 * **강제 갱신 파라미터(`refresh: true`)를 두지 않았다.** 클라이언트가 TTL 을 우회할 수 있으면
 * 캐시가 쿼터를 지켜 주지 못한다(누르는 만큼 외부 호출이 나간다). 값을 다시 받아야 하면
 * 근무지를 지웠다 다시 등록하면 된다 — `Workplace` 삭제 시 `CommuteCache` 가 cascade 로 사라진다.
 *
 * ## 부분 결과는 **덮어쓴다**(이전 값을 살려 두지 않는다)
 *
 * 행에 `fetchedAt` 이 하나뿐이라, 실패한 칸에 예전 값을 남겨 두면 "언제 기준" 이 거짓이 된다.
 * 대신 부분 결과 TTL(1시간)이 짧아 곧 다시 채워진다.
 */
import { prisma } from "@zari/db";
import type { ListingCommuteDto } from "@/features/listing/types";
import type { CommuteDetail, CommuteLeg, CommuteProvider, CommuteProviderSet } from "./provider";
import type { CommuteComputation } from "./service";
import type { CommuteFailureDto, CommuteMode } from "./types";

/** 두 값이 다 있는 행의 재계산 주기 */
export const COMMUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 한쪽이 빈 행의 재계산 주기 */
export const COMMUTE_PARTIAL_TTL_MS = 60 * 60 * 1000;

/** TTL 판정에 필요한 만큼만 — 테스트가 DB 없이 부를 수 있게 구조적 타입으로 둔다 */
export type CommuteCacheShape = {
  transitMinutes: number | null;
  transitDetail: unknown;
  drivingMinutes: number | null;
  drivingDetail: unknown;
  fetchedAt: Date;
};

/** 이 행을 그대로 써도 되는가 — `false` 면 외부 제공자를 다시 부른다 */
export function isCommuteFresh(row: CommuteCacheShape, now: Date = new Date()): boolean {
  const complete = row.transitMinutes !== null && row.drivingMinutes !== null;
  const ttl = complete ? COMMUTE_TTL_MS : COMMUTE_PARTIAL_TTL_MS;
  return now.getTime() - row.fetchedAt.getTime() < ttl;
}

/** `*Detail` Json 이 모의 제공자에서 온 값이라고 말하는가 */
function isMockDetail(detail: unknown): boolean {
  return typeof detail === "object" && detail !== null && (detail as { mock?: unknown }).mock === true;
}

/**
 * 이 행에서 **모의 제공자로 채운 이동수단**. 화면의 「모의」 배지 근거다.
 * 값이 없는 칸(실패)은 세지 않는다 — 보여 줄 숫자가 없으니 모의라고 말할 것도 없다.
 */
export function readMockModes(row: CommuteCacheShape): CommuteMode[] {
  const modes: CommuteMode[] = [];
  if (row.transitMinutes !== null && isMockDetail(row.transitDetail)) modes.push("transit");
  if (row.drivingMinutes !== null && isMockDetail(row.drivingDetail)) modes.push("car");
  return modes;
}

/**
 * 캐시 행 → 화면 DTO. **T3.2·T3.3 의 배지·시트가 읽는 모양**(`ListingCommuteDto`)이고,
 * `POST /api/commute` 응답도 같은 모양이라 조회 직후 화면과 새로고침 후 화면이 어긋나지 않는다.
 */
export function toCommuteDto(
  row: CommuteCacheShape & { workplaceId: string },
  workplaceLabel: string,
): ListingCommuteDto {
  return {
    workplaceId: row.workplaceId,
    workplaceLabel,
    transitMinutes: row.transitMinutes,
    drivingMinutes: row.drivingMinutes,
    fetchedAt: row.fetchedAt.toISOString(),
    mockModes: readMockModes(row),
  };
}

/** (호실, 근무지) 한 쌍의 캐시 행. 없으면 null */
export function readCommuteRow(unitId: string, workplaceId: string) {
  return prisma.commuteCache.findUnique({
    where: { unitId_workplaceId: { unitId, workplaceId } },
  });
}

/**
 * 실패한 칸에도 **사유를 남긴다** — `*Detail` 을 비워 두는 것보다 "왜 비어 있는지" 가 행 안에
 * 있는 편이 낫다(운영에서 되짚을 수 있다). Json 컬럼에 SQL NULL 을 쓰지 않으므로
 * `Prisma.DbNull` 을 다룰 일도 없다.
 */
function detailFor(
  leg: CommuteLeg | null,
  provider: CommuteProvider,
  failure: CommuteFailureDto | undefined,
): CommuteDetail {
  if (leg) return leg.detail;
  return {
    provider: provider.name,
    mock: provider.mock,
    failed: true,
    reason: failure?.reason ?? "UPSTREAM",
    status: failure?.status ?? null,
  };
}

/** 계산 결과를 (호실, 근무지) 한 쌍에 upsert 한다. `fetchedAt` 을 **지금**으로 밀어 TTL 을 새로 연다 */
export async function upsertCommute(input: {
  unitId: string;
  workplaceId: string;
  computation: CommuteComputation;
  providers: CommuteProviderSet;
  now?: Date;
}) {
  const { computation, providers } = input;
  const failureOf = (mode: CommuteMode) => computation.failures.find((f) => f.mode === mode);

  const data = {
    transitMinutes: computation.transit?.minutes ?? null,
    transitDetail: detailFor(computation.transit, providers.transit, failureOf("transit")),
    drivingMinutes: computation.car?.minutes ?? null,
    drivingDetail: detailFor(computation.car, providers.car, failureOf("car")),
    fetchedAt: input.now ?? new Date(),
  };

  return prisma.commuteCache.upsert({
    where: { unitId_workplaceId: { unitId: input.unitId, workplaceId: input.workplaceId } },
    create: { unitId: input.unitId, workplaceId: input.workplaceId, ...data },
    update: data,
  });
}
