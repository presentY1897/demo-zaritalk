/**
 * 매물 등록·수정 권한 (T3.1) — **소유 임대인 또는 수락 중개인**.
 *
 * T1.1 의 소유권 가드(`features/landlord/ownership.ts`)와 같은 `Guarded<T>` 규약을 쓰되,
 * 판정 대상이 하나 더 있다. 매물은 임대인만 올리는 것이 아니라 **중개 요청을 수락한 중개인**도
 * 올릴 수 있다([T3.7](../../../../docs/tasks/t3.7-realtor-inbox.md)).
 *
 * ```ts
 * const actor = await requireListingActorForUnit(unitId);
 * if (actor.response) return actor.response;      // 401 · 403 · 404
 * actor.data.role     // "LANDLORD" | "REALTOR"
 * ```
 *
 * ## 상태 코드 (T1.1 과 같은 규칙)
 *
 * | 상황 | status · code |
 * |---|---|
 * | 비로그인·만료 세션 | 401 `UNAUTHORIZED` |
 * | 없는 호실·매물 id | 404 `NOT_FOUND` |
 * | 임대인·중개인 프로필이 아예 없음 | 403 `FORBIDDEN` |
 * | 남의 호실 임대인 / 수락하지 않은 중개인 | 403 `FORBIDDEN` |
 *
 * ## 중개인 판정 (T3.7 미구현 구간)
 *
 * "수락" 은 `BrokerageTarget.status === ACCEPTED` 이고 그 타겟이 붙은 `BrokerageRequest.unitId`
 * 가 이 호실인 경우다. **그 상태를 만드는 API(`POST /api/brokerage-targets/[id]/respond`)는
 * T3.7 소유라 아직 없다.** 그래서 지금 화면으로는 중개인이 이 경로를 탈 수 없고, 여기서는
 * 판정만 열어 둔다 — T3.7 이 respond 라우트를 붙이면 코드 변경 없이 동작한다.
 * (권한 판정 자체는 데이터를 직접 만들어 테스트로 검증한다.)
 */
import {
  BrokerageTargetStatus,
  prisma,
  ProfileType,
  type Building,
  type Listing,
  type Profile,
  type Unit,
} from "@zari/db";
import type { Guarded } from "@/features/landlord/ownership";
import { fail } from "@/lib/api/response";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import type { ListedByRole } from "./types";

export type UnitWithBuilding = Unit & { building: Building };

/** 매물을 다룰 자격이 있는 사람 + 대상 호실 */
export type ListingActor = {
  user: SessionUser;
  /** 판정에 쓰인 프로필 — 매물의 `listedByProfileId` 가 된다 */
  profile: Profile;
  role: ListedByRole;
  unit: UnitWithBuilding;
};

/** 이 중개인이 이 호실의 중개를 수락했는가 */
export async function hasAcceptedBrokerage(
  realtorProfileId: string,
  unitId: string,
): Promise<boolean> {
  const target = await prisma.brokerageTarget.findFirst({
    where: {
      realtorProfileId,
      status: BrokerageTargetStatus.ACCEPTED,
      request: { unitId },
    },
    select: { id: true },
  });
  return target !== null;
}

function profileOfType(user: SessionUser, type: ProfileType): Profile | null {
  return user.profiles.find((profile) => profile.type === type) ?? null;
}

/**
 * 호실 하나에 대해 매물 권한을 판정한다.
 * 프로필은 활성 프로필 쿠키가 아니라 **유형으로** 고른다(T1.1 `findLandlordProfile` 과 같은 규칙) —
 * 세입자로 전환한 상태에서 API 를 불러도 결과가 같아야 한다.
 */
export async function requireListingActorForUnit(unitId: string): Promise<Guarded<ListingActor>> {
  const user = await getCurrentUser();
  if (!user) return { response: fail("UNAUTHORIZED", "로그인이 필요합니다.") };

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    include: { building: true },
  });
  if (!unit) return { response: fail("NOT_FOUND", "호실을 찾을 수 없습니다.") };

  const landlordProfile = profileOfType(user, ProfileType.LANDLORD);
  if (landlordProfile && unit.building.ownerProfileId === landlordProfile.id) {
    return { data: { user, profile: landlordProfile, role: "LANDLORD", unit } };
  }

  const realtorProfile = profileOfType(user, ProfileType.REALTOR);
  if (realtorProfile && (await hasAcceptedBrokerage(realtorProfile.id, unit.id))) {
    return { data: { user, profile: realtorProfile, role: "REALTOR", unit } };
  }

  return {
    response: fail(
      "FORBIDDEN",
      "매물은 호실 소유 임대인 또는 중개를 수락한 중개인만 등록할 수 있습니다.",
    ),
  };
}

export type ListingWithUnit = Listing & { unit: UnitWithBuilding };

/** 매물 하나에 대해 같은 판정을 한다(수정·상태 변경·삭제). */
export async function requireListingActorForListing(
  listingId: string,
): Promise<Guarded<ListingActor & { listing: ListingWithUnit }>> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { unit: { include: { building: true } } },
  });
  if (!listing) return { response: fail("NOT_FOUND", "매물을 찾을 수 없습니다.") };

  const actor = await requireListingActorForUnit(listing.unitId);
  if (actor.response) {
    // 없는 호실은 있을 수 없다(FK) — 여기 오는 404 는 매물 기준으로 다시 적어 준다
    return { response: actor.response };
  }
  return { data: { ...actor.data, listing } };
}
