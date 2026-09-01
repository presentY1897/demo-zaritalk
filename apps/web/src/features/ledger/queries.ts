/**
 * 임대장부 조회 (T1.6) — **서버 전용**(`@zari/db` 를 쓴다).
 *
 * 라우트 핸들러와 서버 컴포넌트가 **같은 함수**를 쓴다(T1.1 과 같은 규칙) —
 * 그래야 페이지 초기 데이터와 `GET /api/landlord/ledger` 응답 모양이 어긋나지 않고
 * Tanstack Query 의 `initialData` 로 그대로 넣을 수 있다.
 *
 * 계산은 한 줄도 여기 없다. 배분은 원장 엔진(`allocatePayments`), 버킷은 `aggregate.ts`.
 * 이 파일이 하는 일은 **소유권 조건이 걸린 조회 + DTO 조립**뿐이다.
 */
import { prisma } from "@zari/db";
import { kstYearMonth } from "@/lib/rent";
import { aggregateLedger, kstYearRange, type LedgerChargeInput } from "./aggregate";
import type { LedgerBuildingRowDto, LedgerYearDto } from "./types";

/** KST 기준 올해 — 연도 파라미터가 없을 때의 기본값 */
export function currentLedgerYear(now?: Date): number {
  return kstYearMonth(now).year;
}

/**
 * 청구를 통째로 읽는 이유 —
 * 충당(`allocatePayments`)은 그 청구의 **모든 납부**를 앞에서부터 누적해야 정확하다.
 * 납부를 연도로 잘라 넣으면 앞선 납부가 이미 지운 이월·연체료를 다시 지우게 된다.
 * 그래서 "그 해에 납부가 하나라도 있는 청구"를 고른 뒤 **납부는 전부** 딸려 온다.
 */
async function findChargesWithPaymentsIn(
  ownerProfileId: string,
  buildingId: string | null,
  range: { from: Date; to: Date },
): Promise<LedgerChargeInput[]> {
  const rows = await prisma.rentCharge.findMany({
    where: {
      lease: {
        unit: { building: { ownerProfileId, ...(buildingId ? { id: buildingId } : {}) } },
      },
      payments: { some: { paidAt: { gte: range.from, lt: range.to } } },
    },
    select: {
      rentAmount: true,
      maintenanceAmount: true,
      carriedOverAmount: true,
      lateFeeAmount: true,
      lease: { select: { unit: { select: { buildingId: true } } } },
      payments: { select: { amount: true, paidAt: true }, orderBy: { paidAt: "asc" } },
    },
  });

  return rows.map((row) => ({
    rentAmount: row.rentAmount,
    maintenanceAmount: row.maintenanceAmount,
    carriedOverAmount: row.carriedOverAmount,
    lateFeeAmount: row.lateFeeAmount,
    buildingId: row.lease.unit.buildingId,
    payments: row.payments,
  }));
}

/**
 * 납부 기록이 있는 연도 범위 + 올해 — 연도 이동 버튼이 헛돌지 않게 한다.
 * 최소·최대 `paidAt` 만 읽어 KST 연도로 바꾼 뒤 그 사이를 채운다(내림차순).
 */
async function findAvailableYears(ownerProfileId: string, year: number): Promise<number[]> {
  const bounds = await prisma.rentPayment.aggregate({
    where: { charge: { lease: { unit: { building: { ownerProfileId } } } } },
    _min: { paidAt: true },
    _max: { paidAt: true },
  });

  const years = new Set<number>([year, currentLedgerYear()]);
  if (bounds._min.paidAt && bounds._max.paidAt) {
    const first = kstYearMonth(bounds._min.paidAt).year;
    const last = kstYearMonth(bounds._max.paidAt).year;
    for (let y = first; y <= last; y += 1) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * 한 해 장부 — 월별·항목별·건물별 집계.
 *
 * `buildingId` 를 주면 그 건물만 집계한다(**소유권 확인은 호출부**가 `requireOwnedBuilding`
 * 으로 먼저 한다 — 여기서도 `ownerProfileId` 조건이 걸려 있어 남의 건물이면 빈 결과가 된다).
 */
export async function getLedgerYear(
  ownerProfileId: string,
  year: number,
  buildingId: string | null = null,
): Promise<LedgerYearDto> {
  const range = kstYearRange(year);

  const [allBuildings, charges, availableYears] = await Promise.all([
    prisma.building.findMany({
      where: { ownerProfileId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    findChargesWithPaymentsIn(ownerProfileId, buildingId, range),
    findAvailableYears(ownerProfileId, year),
  ]);

  // matrix 에 남길 건물 — 필터가 있으면 그 한 채, 없으면 내 건물 전부(수입 0 도 행으로 남긴다)
  const matrixBuildings = buildingId
    ? allBuildings.filter((building) => building.id === buildingId)
    : allBuildings;

  const aggregate = aggregateLedger({
    year,
    charges,
    buildingIds: matrixBuildings.map((building) => building.id),
  });

  const nameById = new Map(allBuildings.map((building) => [building.id, building.name]));
  const matrix: LedgerBuildingRowDto[] = aggregate.buildings.map((row) => ({
    buildingId: row.buildingId,
    buildingName: nameById.get(row.buildingId) ?? "알 수 없는 건물",
    months: row.months,
    totals: row.totals,
  }));

  return {
    year,
    buildingId,
    buildings: allBuildings,
    availableYears,
    months: aggregate.months,
    matrix,
    totals: aggregate.totals,
  };
}
