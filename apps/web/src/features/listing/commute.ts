/**
 * 통근 배지 자리 (T3.2·T3.3) — **서버 전용**. [T3.5](../../../../docs/tasks/t3.5-commute.md) 가 채운다.
 *
 * ## 여기가 하는 일과 하지 않는 일
 *
 * | 한다 | 하지 않는다 |
 * |---|---|
 * | `CommuteCache` 에 **이미 있는 행**을 읽는다 | 카카오모빌리티·ODsay 호출 |
 * | 그 근무지가 **내 것인지** 판정한다 | `CommuteCache` upsert |
 * | 캐시가 없으면 `null` 을 준다 | 없다고 계산을 시작하는 것 |
 *
 * 지금은 캐시를 만드는 곳이 없어(`POST /api/commute` 가 T3.5 소유) 언제나 `null` 이다.
 * 그래도 **배선과 화면은 완성**돼 있다 — T3.5 가 캐시 행을 쓰기 시작하면 목록 배지와
 * 상세 버튼이 코드 변경 없이 켜진다. 테스트는 캐시 행을 직접 넣어 그 경로를 검증한다.
 *
 * ## 왜 "조용히 무시" 인가
 *
 * `/search`·`/listings/[id]` 는 **비로그인 공개** 화면이다. `workplaceId` 가 내 것이 아닐 때
 * 403 을 주면 "그 id 의 근무지가 있다" 는 사실이 새어 나간다. 그래서 실패는 전부 `null` 이고,
 * 응답의 `commuteWorkplaceId` 로 "반영됐는지" 만 알려 준다.
 */
import { prisma } from "@zari/db";
import { findTenantProfile } from "@/features/tenant/ownership";
import { getCurrentUser } from "@/lib/auth/session";
import type { ListingCommuteDto } from "./types";

/** 배지 기준이 될 근무지 — 로그인 세입자의 자기 근무지일 때만. 그 밖에는 전부 null */
export type CommuteWorkplace = { id: string; label: string };

export async function resolveCommuteWorkplace(
  workplaceId: string | undefined | null,
): Promise<CommuteWorkplace | null> {
  if (!workplaceId) return null;

  const user = await getCurrentUser();
  if (!user) return null;
  // 활성 프로필 쿠키가 아니라 **유형으로** 고른다(T1.3·T3.4 와 같은 규칙)
  const profile = findTenantProfile(user);
  if (!profile) return null;

  const workplace = await prisma.workplace.findUnique({
    where: { id: workplaceId },
    select: { id: true, label: true, tenantProfileId: true },
  });
  if (!workplace || workplace.tenantProfileId !== profile.id) return null;
  return { id: workplace.id, label: workplace.label };
}

/** `(호실, 근무지)` 캐시를 **읽기만** 한다 — 호실 id 로 찾는 Map */
export async function readCommuteCache(
  unitIds: readonly string[],
  workplace: CommuteWorkplace | null,
): Promise<Map<string, ListingCommuteDto>> {
  const result = new Map<string, ListingCommuteDto>();
  if (!workplace || unitIds.length === 0) return result;

  const rows = await prisma.commuteCache.findMany({
    where: { workplaceId: workplace.id, unitId: { in: [...unitIds] } },
  });
  for (const row of rows) {
    result.set(row.unitId, {
      workplaceId: workplace.id,
      workplaceLabel: workplace.label,
      transitMinutes: row.transitMinutes,
      drivingMinutes: row.drivingMinutes,
      fetchedAt: row.fetchedAt.toISOString(),
    });
  }
  return result;
}

/**
 * 매물 상세용 — 호실 하나에 대해 **여러 근무지**의 캐시를 한 번에 읽는다.
 * 상세 화면의 「내 근무지까지」 시트가 근무지 목록을 통째로 보여 주기 때문이다(T3.5 자리).
 */
export async function readUnitCommutes(
  unitId: string,
  workplaces: readonly CommuteWorkplace[],
): Promise<ListingCommuteDto[]> {
  if (workplaces.length === 0) return [];

  const labels = new Map(workplaces.map((workplace) => [workplace.id, workplace.label]));
  const rows = await prisma.commuteCache.findMany({
    where: { unitId, workplaceId: { in: [...labels.keys()] } },
  });

  return rows.map((row) => ({
    workplaceId: row.workplaceId,
    workplaceLabel: labels.get(row.workplaceId) ?? "",
    transitMinutes: row.transitMinutes,
    drivingMinutes: row.drivingMinutes,
    fetchedAt: row.fetchedAt.toISOString(),
  }));
}

/** 매물 상세용 — 호실 하나치 */
export async function readCommuteForUnit(
  unitId: string,
  workplace: CommuteWorkplace | null,
): Promise<ListingCommuteDto | null> {
  const map = await readCommuteCache([unitId], workplace);
  return map.get(unitId) ?? null;
}
