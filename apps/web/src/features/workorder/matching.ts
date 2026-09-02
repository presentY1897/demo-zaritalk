/**
 * push 추천 발송 — 의뢰 생성 시 조건에 맞는 **유료(PRO) 마스터**를 골라 추천을 보낸다
 * (T5.1 · [D4](../../../../../docs/DECISIONS.md#-d4-마스터-매칭-방식--pull--push-하이브리드)).
 *
 * **서버 전용**(`@zari/db` 를 쓴다). 거리 계산 자체는 DB 를 모르는 순수 모듈
 * `@/lib/geo/distance` 에 있고, T3.6(중개 반경 매칭)이 같은 함수를 재사용한다.
 *
 * ## 대상 선정 규칙 — 넷을 **모두** 만족해야 한다
 *
 * | 조건 | 판정 |
 * |---|---|
 * | ① 업종 일치 | `MasterDetail.categories` 에 의뢰의 `category` 가 들어 있다 |
 * | ② 활동반경 안 | `haversineKm(의뢰 건물, 마스터 사무소) ≤ MasterDetail.radiusKm` (경계 포함) |
 * | ③ 유료 | `plan = PRO` **이고** `planUntil` 이 null 이거나 지나지 않았다 |
 * | ④ 상한 | 위를 통과한 마스터를 **거리순으로 최대 10명** |
 *
 * 반경은 요청자가 아니라 **마스터가 자기 프로필에 적어 둔 값**이다 — "나는 여기서 N km 까지 간다".
 * 그래서 같은 거리라도 마스터마다 판정이 갈린다.
 *
 * ## 원점은 **건물** 좌표다
 *
 * `Unit` 에는 좌표가 없다(주소·좌표는 `Building` 이 가진다). 그래서 호실 작업이든 공용부
 * 작업이든 매칭 원점은 건물이고, **건물이 없는 의뢰는 추천을 보내지 않는다**(0명).
 *
 * ## 두 번 불러도 안전하다
 *
 * `WorkOrderTarget` 은 `@@unique([workOrderId, masterProfileId])` 다. 여기서도 이미 보낸
 * 마스터를 미리 걸러 내므로 같은 의뢰로 다시 불러도 **중복 타겟도, 중복 발송 로그도 생기지 않는다**
 * (재발송 = 새로 조건을 만족하게 된 마스터에게만 간다).
 *
 * ## 두 진입점
 *
 * | 함수 | 언제 |
 * |---|---|
 * | `dispatchWorkOrderTargets(workOrderId)` | **의뢰 1건 → 마스터 N명.** 의뢰 생성 직후(직접 생성·민원 전환 둘 다) |
 * | `backfillTargetsForMaster(detail)` | **마스터 1명 → 의뢰 N건.** 플랜을 PRO 로 켠 순간(T5.2 데모 시연) |
 */
import { MessageKind, prisma, ProfileType, type MasterCategory } from "@zari/db";
import { isProActive } from "@/features/master/plan";
import { rankByDistance, type GeoPoint } from "@/lib/geo/distance";
import { MASTER_CATEGORY_META } from "./status";
import type { MasterCategoryValue } from "./types";

/** 한 의뢰가 추천으로 닿을 수 있는 마스터 수 상한(거리순). 중개 요청(T3.6)은 20명이다 */
export const WORK_ORDER_TARGET_LIMIT = 10;

/** 추천 대상 후보 — 반경 판정에 필요한 좌표·반경 + 발송 로그에 필요한 이름·전화 */
type MasterCandidate = {
  profileId: string;
  companyName: string;
  lat: number;
  lng: number;
  radiusKm: number;
  profile: { user: { name: string; phone: string } };
};

/**
 * 조건 ①②③④ 를 모두 만족하는 마스터를 거리순으로 고른다.
 * DB 를 읽지만 **아무 것도 쓰지 않는다** — 발송 전 미리보기(T3.6 의 preview 와 같은 자리)에도 쓸 수 있다.
 */
export async function selectWorkOrderTargets(
  category: MasterCategoryValue,
  origin: GeoPoint,
  options: { limit?: number; now?: Date } = {},
): Promise<{ candidate: MasterCandidate; distanceKm: number }[]> {
  const now = options.now ?? new Date();

  // ① 업종 + ③ 유료 는 DB 에서 거른다(스칼라 리스트 `has`, plan/planUntil).
  //    만료 판정은 `isProActive` 한 곳에서만 하도록 아래에서 한 번 더 확인한다.
  const candidates = await prisma.masterDetail.findMany({
    where: {
      plan: "PRO",
      categories: { has: category as MasterCategory },
      profile: { type: ProfileType.MASTER },
    },
    include: { profile: { include: { user: { select: { name: true, phone: true } } } } },
  });

  const active = candidates.filter((candidate) => isProActive("PRO", candidate.planUntil, now));

  // ② 반경 + ④ 거리순 상한 — 규칙은 순수 모듈 한 곳에만 있다
  return rankByDistance(origin, active, { limit: options.limit ?? WORK_ORDER_TARGET_LIMIT }).map(
    (ranked) => ({ candidate: ranked.candidate as MasterCandidate, distanceKm: ranked.distanceKm }),
  );
}

/**
 * 의뢰에 대한 추천을 실제로 발송한다 — `WorkOrderTarget` + `MessageLog(WORK_ORDER_REQUEST)`.
 *
 * 반환값은 **이번에 새로 보낸 수**다(이미 보낸 마스터는 세지 않는다).
 * 건물이 없는 의뢰·조건에 맞는 PRO 마스터가 없는 경우 0 이다.
 */
export async function dispatchWorkOrderTargets(
  workOrderId: string,
  options: { now?: Date } = {},
): Promise<number> {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    include: { building: true, unit: true, targets: { select: { masterProfileId: true } } },
  });
  // 건물 좌표가 없으면 반경 매칭 자체가 성립하지 않는다
  if (!workOrder?.building) return 0;

  const selected = await selectWorkOrderTargets(
    workOrder.category as MasterCategoryValue,
    workOrder.building,
    options,
  );

  const already = new Set(workOrder.targets.map((target) => target.masterProfileId));
  const fresh = selected.filter((entry) => !already.has(entry.candidate.profileId));
  if (fresh.length === 0) return 0;

  const place = `${workOrder.building.name}${workOrder.unit ? ` ${workOrder.unit.label}` : ""}`;
  const categoryLabel = MASTER_CATEGORY_META[workOrder.category as MasterCategoryValue].label;

  await prisma.$transaction([
    prisma.workOrderTarget.createMany({
      data: fresh.map((entry) => ({
        workOrderId,
        masterProfileId: entry.candidate.profileId,
        distanceKm: entry.distanceKm,
      })),
      // unique 제약과 위 필터가 겹치지만, 동시에 두 번 불려도 한쪽이 죽지 않게 둔다
      skipDuplicates: true,
    }),
    // 알림톡 시뮬레이터(T1.7 과 같은 발송 로그). 마스터 계정의 번호로 남긴다
    prisma.messageLog.createMany({
      data: fresh.map((entry) => ({
        kind: MessageKind.WORK_ORDER_REQUEST,
        toPhone: entry.candidate.profile.user.phone,
        title: `새 작업 의뢰 추천 — ${categoryLabel}`,
        body: `${place} · ${workOrder.description}`,
      })),
    }),
  ]);

  return fresh.length;
}

/** 한 번의 플랜 전환이 훑는 열린 의뢰 수 상한 — 데모 규모에서 넉넉하다 */
const BACKFILL_SCAN_LIMIT = 50;

/**
 * **플랜을 PRO 로 켠 마스터의 추천함을 즉시 채운다** (T5.2 완료 기준의 "플랜 토글 후 추천 탭이 즉시 채워짐").
 *
 * 추천은 원래 "의뢰가 생기는 순간" 발송된다. 그래서 유료로 갈아탄 직후에는 추천함이 비어 있고,
 * 데모에서 유료의 값어치가 화면에 안 보인다. 그래서 전환 시점에 **지금 열려 있는(`REQUESTED`)
 * 의뢰 중 내 업종·반경에 맞는 것**을 한 번 훑어 추천을 채운다 — 실제 서비스에서도
 * "가입하자마자 지금 열린 일감을 받는다" 가 자연스럽다.
 *
 * 각 의뢰마다 `dispatchWorkOrderTargets` 를 그대로 부르므로 **의뢰당 거리순 10명 상한이 그대로 지켜지고**,
 * 이미 추천이 간 마스터에게 중복으로 가지도 않는다(내가 11번째로 먼 마스터면 채워지지 않는다).
 */
export async function backfillTargetsForMaster(
  detail: { profileId: string; lat: number; lng: number; radiusKm: number; categories: string[] },
  options: { now?: Date } = {},
): Promise<number> {
  if (detail.categories.length === 0) return 0;

  const orders = await prisma.workOrder.findMany({
    where: {
      status: "REQUESTED",
      category: { in: detail.categories as MasterCategory[] },
      buildingId: { not: null },
      // 이미 나에게 온 추천은 다시 볼 필요가 없다
      targets: { none: { masterProfileId: detail.profileId } },
    },
    include: { building: { select: { lat: true, lng: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: BACKFILL_SCAN_LIMIT,
  });

  // 내 활동반경 안의 의뢰만 남긴다(반경 판정은 순수 모듈 한 곳에서)
  const inRange = rankByDistance(
    detail,
    orders
      .filter((order) => order.building !== null)
      .map((order) => ({
        id: order.id,
        lat: order.building!.lat,
        lng: order.building!.lng,
        radiusKm: detail.radiusKm,
      })),
  );

  let dispatched = 0;
  for (const ranked of inRange) {
    dispatched += await dispatchWorkOrderTargets(ranked.candidate.id, options);
  }
  return dispatched;
}
