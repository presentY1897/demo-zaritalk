/**
 * 알림 구독 저장소 (T4.4) — `TransactionAlert` 를 읽고 쓰는 곳.
 *
 * ## ⚠️ `@@unique([profileId, lawdCd, aptName, dealType])` 는 **NULL 을 막지 못한다**
 *
 * `aptName`·`dealType` 은 nullable 이고, Postgres 의 기본 유니크 인덱스는 **NULL 을 서로 다른
 * 값으로 본다**(`NULLS DISTINCT`). 마이그레이션도 평범한 `CREATE UNIQUE INDEX` 라
 * `(프로필, 11200, NULL, NULL)` 같은 "지역 전체" 구독은 **몇 번이고 다시 만들어진다.**
 * 실제로 데모에서 가장 흔한 구독이 바로 그것이다.
 *
 * 스키마는 이 task 소유가 아니라(`packages/db/prisma/**`) 고칠 수 없으므로 **애플리케이션이
 * 유니크를 보장한다**:
 *
 * 1. 구독 키로 **advisory 락**을 잡는다(`pg_advisory_xact_lock`) — 같은 키의 동시 요청이 줄을 선다.
 * 2. 같은 조합이 이미 있으면 그것을 돌려준다(`duplicated: true`).
 * 3. 없을 때만 만든다.
 *
 * 락은 트랜잭션이 끝나면 자동으로 풀리고, 키가 다르면 서로 막지 않는다. 진짜 방어는
 * `NULLS NOT DISTINCT` 유니크 인덱스다 → task 문서의 "스키마가 필요했지만 안 만든 것".
 */
import { prisma, RealDealType, type TransactionAlert } from "@zari/db";
import { findRegion, regionLabel } from "@/features/community/regions";
import { alertSummary } from "./labels";
import type { RealDealTypeValue, TransactionAlertDto } from "./types";

/** 한 계정이 걸어 둘 수 있는 구독 수 상한 — 알림톡 시뮬이 무한정 불어나지 않게 */
export const MAX_ALERTS_PER_ACCOUNT = 20;

export function toAlertDto(alert: TransactionAlert): TransactionAlertDto {
  const region = findRegion(alert.lawdCd);
  const label = region ? regionLabel(region) : alert.lawdCd;
  const dealType = (alert.dealType as RealDealTypeValue | null) ?? null;
  return {
    id: alert.id,
    lawdCd: alert.lawdCd,
    regionLabel: label,
    aptName: alert.aptName,
    dealType,
    createdAt: alert.createdAt.toISOString(),
    summary: alertSummary({ regionLabel: label, aptName: alert.aptName, dealType }),
  };
}

/** 계정(= 모든 프로필)의 구독 — 최근 것이 위 */
export async function listAlerts(profileIds: readonly string[]): Promise<TransactionAlertDto[]> {
  if (profileIds.length === 0) return [];
  const rows = await prisma.transactionAlert.findMany({
    where: { profileId: { in: [...profileIds] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return rows.map(toAlertDto);
}

export type CreateAlertResult =
  | { ok: true; alert: TransactionAlertDto; duplicated: boolean }
  | { ok: false; reason: "LIMIT" };

/**
 * 구독 생성 — **같은 조합이면 만들지 않고 기존 것을 돌려준다**(멱등).
 * 중복 판정은 계정이 아니라 **그 프로필** 기준이다(유니크 제약이 프로필 단위라 그것에 맞춘다).
 */
export async function createAlert(input: {
  profileId: string;
  profileIds: readonly string[];
  lawdCd: string;
  aptName: string | null;
  dealType: RealDealTypeValue | null;
}): Promise<CreateAlertResult> {
  const key = `deals-alert|${input.profileId}|${input.lawdCd}|${input.aptName ?? ""}|${input.dealType ?? ""}`;

  const result = await prisma.$transaction(async (tx) => {
    // 같은 키의 동시 요청을 줄 세운다 — nullable 컬럼이 섞인 유니크는 DB 가 막아 주지 못한다
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", key);

    const existing = await tx.transactionAlert.findFirst({
      where: {
        profileId: input.profileId,
        lawdCd: input.lawdCd,
        aptName: input.aptName,
        dealType: input.dealType ? RealDealType[input.dealType] : null,
      },
    });
    if (existing) return { alert: existing, duplicated: true as const };

    const total = await tx.transactionAlert.count({
      where: { profileId: { in: [...input.profileIds] } },
    });
    if (total >= MAX_ALERTS_PER_ACCOUNT) return null;

    const created = await tx.transactionAlert.create({
      data: {
        profileId: input.profileId,
        lawdCd: input.lawdCd,
        aptName: input.aptName,
        dealType: input.dealType ? RealDealType[input.dealType] : null,
      },
    });
    return { alert: created, duplicated: false as const };
  });

  if (!result) return { ok: false, reason: "LIMIT" };
  return { ok: true, alert: toAlertDto(result.alert), duplicated: result.duplicated };
}

/** 구독 삭제 — 소유 확인은 `requireOwnAlert` 가 먼저 한다 */
export async function deleteAlert(id: string): Promise<void> {
  await prisma.transactionAlert.deleteMany({ where: { id } });
}
