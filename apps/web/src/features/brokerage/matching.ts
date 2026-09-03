/**
 * 공실 중개 요청 **반경 매칭·발송** (T3.6).
 *
 * **서버 전용**(`@zari/db` 를 쓴다). 거리 계산은 DB 를 모르는 순수 모듈
 * `@/lib/geo/distance` 에 이미 있고 — T5.1 이 만들고 T5.2 가 재사용한 그 파일이다 —
 * 여기서는 **그대로 import 해서 쓴다.** 매칭 규칙을 두 벌 두지 않기 위해서다.
 *
 * ## 대상 선정 규칙 — 둘을 **모두** 만족해야 한다
 *
 * | 조건 | 판정 |
 * |---|---|
 * | ① 활동반경 안 | `haversineKm(공실 건물, 중개인 사무소) ≤ RealtorDetail.radiusKm` (경계 포함) |
 * | ② 상한 | 위를 통과한 중개인을 **거리순으로 최대 20명** |
 *
 * 반경은 요청하는 임대인이 아니라 **중개인이 자기 프로필에 적어 둔 값**이다 —
 * "나는 여기서 N km 까지 간다". 그래서 같은 거리라도 중개인마다 판정이 갈린다.
 * 업종 같은 추가 조건이 없다는 점만 작업 의뢰 push 추천(T5.1, 10명)과 다르다.
 *
 * ## 원점은 **건물** 좌표다
 *
 * `Unit` 에는 좌표가 없다(주소·좌표는 `Building` 이 가진다). 그래서 어느 호실을 내놓든
 * 매칭 원점은 그 호실이 속한 건물이다.
 *
 * ## 미리보기와 실제 발송이 **같은 함수**를 쓴다
 *
 * `selectBrokerageTargets` 는 **DB 를 읽기만 하고 아무 것도 쓰지 않는다.**
 * `GET /api/brokerage-requests/preview` 와 `dispatchBrokerageTargets` 가 둘 다 이 함수를 부르므로
 * "미리보기 3명 → 보내니 5명" 같은 어긋남이 생길 수 없다
 * (T5.2 의 `selectWorkOrderTargets` 와 같은 패턴).
 *
 * ## 두 번 불러도 안전하다
 *
 * `BrokerageTarget` 은 `@@unique([requestId, realtorProfileId])` 다. 여기서도 이미 보낸
 * 중개인을 미리 걸러 내므로 같은 요청으로 다시 불러도 **중복 타겟도, 중복 발송 로그도 생기지 않는다**
 * (재발송 = 그 사이 새로 조건을 만족하게 된 중개인에게만 간다).
 */
import { MessageKind, prisma, ProfileType } from "@zari/db";
import { rankByDistance, type GeoPoint } from "@/lib/geo/distance";
import { formatBrokeragePlace } from "./status";

/** 한 요청이 닿을 수 있는 중개인 수 상한(거리순). 작업 의뢰 추천(T5.1)은 10명이다 */
export const BROKERAGE_TARGET_LIMIT = 20;

/** 매칭 후보 — 반경 판정에 필요한 좌표·반경 + 발송 로그·연락 카드에 필요한 정보 */
export type RealtorCandidate = {
  profileId: string;
  officeName: string;
  address: string;
  lat: number;
  lng: number;
  radiusKm: number;
  licenseNo: string | null;
  intro: string | null;
  profile: { user: { name: string; phone: string } };
};

export type RankedRealtor = { candidate: RealtorCandidate; distanceKm: number };

/**
 * 조건 ①② 를 만족하는 중개인을 거리순으로 고른다.
 * **DB 를 읽지만 아무 것도 쓰지 않는다** — 발송 전 미리보기가 이 함수를 그대로 부른다.
 */
export async function selectBrokerageTargets(
  origin: GeoPoint,
  options: { limit?: number } = {},
): Promise<RankedRealtor[]> {
  const candidates = await prisma.realtorDetail.findMany({
    where: { profile: { type: ProfileType.REALTOR } },
    include: { profile: { include: { user: { select: { name: true, phone: true } } } } },
    // 거리가 완전히 같은 중개인의 순서를 실행마다 흔들지 않기 위한 안정된 입력 순서
    orderBy: { profileId: "asc" },
  });

  // ① 반경 + ② 거리순 상한 — 규칙은 순수 모듈 한 곳에만 있다
  return rankByDistance(origin, candidates, {
    limit: options.limit ?? BROKERAGE_TARGET_LIMIT,
  }).map((ranked) => ({
    candidate: ranked.candidate as RealtorCandidate,
    distanceKm: ranked.distanceKm,
  }));
}

/**
 * 요청에 대한 발송을 실제로 한다 — `BrokerageTarget(SENT)` + `MessageLog(BROKERAGE_REQUEST)`.
 *
 * 반환값은 **이번에 새로 보낸 수**다(이미 보낸 중개인은 세지 않는다).
 * 반경 안에 중개인이 없으면 0 이다 — 요청 자체는 남는다.
 */
export async function dispatchBrokerageTargets(requestId: string): Promise<number> {
  const request = await prisma.brokerageRequest.findUnique({
    where: { id: requestId },
    include: {
      unit: { include: { building: true } },
      targets: { select: { realtorProfileId: true } },
    },
  });
  if (!request) return 0;

  const building = request.unit.building;
  const selected = await selectBrokerageTargets(building);

  const already = new Set(request.targets.map((target) => target.realtorProfileId));
  const fresh = selected.filter((entry) => !already.has(entry.candidate.profileId));
  if (fresh.length === 0) return 0;

  const place = formatBrokeragePlace({
    buildingName: building.name,
    unitLabel: request.unit.label,
  });

  await prisma.$transaction([
    prisma.brokerageTarget.createMany({
      data: fresh.map((entry) => ({
        requestId,
        realtorProfileId: entry.candidate.profileId,
        distanceKm: entry.distanceKm,
        // status 는 스키마 기본값 SENT — 전이의 출발점이다
      })),
      // unique 제약과 위 필터가 겹치지만, 동시에 두 번 불려도 한쪽이 죽지 않게 둔다
      skipDuplicates: true,
    }),
    // 알림톡 시뮬레이터(T1.7 과 같은 발송 로그). 중개인 계정의 번호로 남긴다
    prisma.messageLog.createMany({
      data: fresh.map((entry) => ({
        kind: MessageKind.BROKERAGE_REQUEST,
        toPhone: entry.candidate.profile.user.phone,
        title: `새 공실 중개 요청 — ${place}`,
        body: `${building.address} · ${entry.distanceKm}km${
          request.message ? ` · ${request.message}` : ""
        }`,
      })),
    }),
  ]);

  return fresh.length;
}
