/**
 * 민원 권한 가드 (T2.6) — **이 task 의 핵심. 판정은 여기 한 곳에만 있다.**
 *
 * 민원 스레드는 **해당 계약의 세입자와 임대인 둘만** 볼 수 있다. 임대인 자원(T1.1·T1.2)처럼
 * "내 것인가" 한 방향으로 끝나지 않고 **두 방향**이라, 판정이 화면·API 로 흩어지면
 * 한쪽만 고쳐서 구멍이 난다. 그래서 규칙 자체는 순수 함수 `resolveComplaintParty` 하나로 두고,
 * API(`requireComplaintAccess`)와 화면(`features/complaint/queries.ts` 의 `getComplaintForViewer`)이
 * **같은 함수**를 부른다.
 *
 * ```ts
 * const access = await requireComplaintAccess(id);
 * if (access.response) return access.response;      // 401 · 404 · 403
 * const { complaint, party, profileId } = access.data;
 * ```
 *
 * 반환 형태(`Guarded<T>`)·상태 코드 규칙은 T1.1 `features/landlord/ownership.ts` 와 같다.
 *
 * ## 판정 규칙
 *
 * | 대상 | 판정 키 | 결과 |
 * |---|---|---|
 * | 계약의 세입자 | `Lease.tenantProfileId` == 내 TENANT 프로필 | `party: "TENANT"` |
 * | 민원을 접수한 세입자 | `Complaint.tenantProfileId` == 내 TENANT 프로필 | `party: "TENANT"` |
 * | 건물 주인 | `Unit.building.ownerProfileId` == 내 LANDLORD 프로필 | `party: "LANDLORD"` |
 * | 그 외 전부(제3자·다른 임대인·다른 세입자) | — | **403** |
 *
 * - **접수자(`Complaint.tenantProfileId`)도 함께 본다** — 계약이 종료되며 세입자 연결이 정리돼도
 *   자기가 쓴 민원은 계속 읽을 수 있어야 하기 때문이다. 접수자는 제3자가 아니다.
 * - 한 계정이 이 계약의 세입자이면서 이 건물의 임대인이기도 하면 **임대인으로 판정**한다 —
 *   상태 변경까지 포함하는 넓은 쪽이다(데모 시드에는 없는 조합).
 * - 프로필은 활성 프로필 쿠키가 아니라 **유형으로** 고른다(`@@unique([userId, type])`).
 *   임대인 프로필로 전환한 상태에서 세입자 API 를 불러도 결과가 같아야 한다(T1.1·T1.3 와 같은 규칙).
 *
 * ## 상태 코드 규칙
 *
 * | 상황 | status · code |
 * |---|---|
 * | 비로그인·만료 세션 | 401 `UNAUTHORIZED` |
 * | 없는 민원 id | 404 `NOT_FOUND` |
 * | **제3자**(그 계약의 세입자도 임대인도 아님) | 403 `FORBIDDEN` |
 * | 세입자가 상태를 바꾸려 함 | 403 `FORBIDDEN` (`requireComplaintLandlord`) |
 *
 * 남의 민원을 404 로 감추지 않고 403 을 주는 것도 T1.1 과 같은 선택이다(task 최소 테스트가 403 을 요구한다).
 * 화면(서버 컴포넌트)만 `notFound()` 로 막는다 — 존재 여부를 흘리지 않는 편이 낫다.
 */
import {
  LeaseStatus,
  prisma,
  ProfileType,
  type Building,
  type Complaint,
  type Lease,
  type Profile,
  type Unit,
} from "@zari/db";
import type { Guarded } from "@/features/landlord/ownership";
import { fail } from "@/lib/api/response";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import type { ComplaintParty } from "./types";

export type { ComplaintParty };

/** 민원 + 계약 + 호실 + 건물 — 판정과 화면 문구("행당해피빌 201호")에 필요한 만큼 */
export type ComplaintWithContext = Complaint & {
  lease: Lease & { unit: Unit & { building: Building } };
};

/** 판정에 필요한 세 개의 프로필 id만 뽑아 둔 것 — DB 를 모르는 순수 입력 */
export type ComplaintPartyTarget = {
  /** `Lease.tenantProfileId` — 세입자 연결 전이면 null */
  leaseTenantProfileId: string | null;
  /** `Complaint.tenantProfileId` — 민원을 접수한 세입자 */
  complaintTenantProfileId: string;
  /** `Unit.building.ownerProfileId` — 건물 주인 */
  ownerProfileId: string;
};

/** 누구로 판정됐는지 + 그 판정에 쓰인 내 프로필 id(메시지 작성자로 기록된다) */
export type ComplaintPartyMatch = { party: ComplaintParty; profileId: string };

export type ComplaintAccess = ComplaintPartyMatch & {
  user: SessionUser;
  complaint: ComplaintWithContext;
};

/** 민원 판정에 필요한 만큼만 추린 계약 — 접수(POST) 가드가 돌려준다 */
export type ComplaintLease = Lease & { unit: Unit & { building: Building } };

/**
 * 판정 키를 담고 있는 최소 모양 — 가드가 읽은 행(`ComplaintWithContext`)과
 * 화면용 조회가 읽은 행(`features/complaint/queries.ts`)이 **둘 다 이 모양에 맞는다**.
 * 덕분에 판정 입력을 만드는 자리도 하나뿐이다.
 */
export type ComplaintPartySource = {
  tenantProfileId: string;
  lease: {
    tenantProfileId: string | null;
    unit: { building: { ownerProfileId: string } };
  };
};

/** 민원 컨텍스트에서 판정 입력을 뽑는다 — 판정 키가 어디서 오는지 한 줄로 보이게 */
export function toPartyTarget(complaint: ComplaintPartySource): ComplaintPartyTarget {
  return {
    leaseTenantProfileId: complaint.lease.tenantProfileId,
    complaintTenantProfileId: complaint.tenantProfileId,
    ownerProfileId: complaint.lease.unit.building.ownerProfileId,
  };
}

/**
 * **권한 판정의 단일 출처** — DB 를 모르는 순수 함수라 테스트가 DB 없이 돈다.
 *
 * 임대인 → 세입자 순으로 본다(위 문서의 "넓은 쪽" 규칙). 아무 것도 맞지 않으면 `null` = 제3자.
 */
export function resolveComplaintParty(
  profiles: readonly Pick<Profile, "id" | "type">[],
  target: ComplaintPartyTarget,
): ComplaintPartyMatch | null {
  const landlord = profiles.find(
    (profile) => profile.type === ProfileType.LANDLORD && profile.id === target.ownerProfileId,
  );
  if (landlord) return { party: "LANDLORD", profileId: landlord.id };

  const tenant = profiles.find(
    (profile) =>
      profile.type === ProfileType.TENANT &&
      (profile.id === target.leaseTenantProfileId ||
        profile.id === target.complaintTenantProfileId),
  );
  if (tenant) return { party: "TENANT", profileId: tenant.id };

  return null;
}

/** 민원 + 계약 + 호실 + 건물을 한 번에 읽는다(판정 키가 전부 여기 들어 있다) */
export function findComplaintWithContext(complaintId: string): Promise<ComplaintWithContext | null> {
  return prisma.complaint.findUnique({
    where: { id: complaintId },
    include: { lease: { include: { unit: { include: { building: true } } } } },
  });
}

/** 스레드를 볼 수 있는가. 401(비로그인) · 404(없는 민원) · 403(제3자). */
export async function requireComplaintAccess(
  complaintId: string,
): Promise<Guarded<ComplaintAccess>> {
  const user = await getCurrentUser();
  if (!user) return { response: fail("UNAUTHORIZED", "로그인이 필요합니다.") };

  const complaint = await findComplaintWithContext(complaintId);
  if (!complaint) return { response: fail("NOT_FOUND", "민원을 찾을 수 없습니다.") };

  const matched = resolveComplaintParty(user.profiles, toPartyTarget(complaint));
  if (!matched) {
    return { response: fail("FORBIDDEN", "이 민원의 세입자와 임대인만 볼 수 있습니다.") };
  }
  return { data: { ...matched, user, complaint } };
}

/**
 * 상태를 바꿀 수 있는가 — **임대인 전용**. 스레드 접근을 먼저 통과해야 하므로
 * 세입자는 404 가 아니라 403 을 받는다(민원이 있다는 것 자체는 그가 이미 아는 사실이다).
 */
export async function requireComplaintLandlord(
  complaintId: string,
): Promise<Guarded<ComplaintAccess>> {
  const access = await requireComplaintAccess(complaintId);
  if (access.response) return access;
  if (access.data.party !== "LANDLORD") {
    return { response: fail("FORBIDDEN", "민원 상태는 임대인만 바꿀 수 있습니다.") };
  }
  return access;
}

/**
 * 이 계약에 민원을 접수할 수 있는가 — 세입자 전용.
 * 404(없는 계약) · 403(내 계약이 아님) · 409(진행 중이 아닌 계약).
 *
 * 진행 중(`ACTIVE`) 계약만 받는다 — 살고 있지 않은 집의 수리를 새로 요청할 수는 없기 때문이다.
 * 이미 접수된 민원의 스레드는 계약이 끝나도 계속 읽고 쓸 수 있다(위 판정 규칙의 접수자 항목).
 */
export async function requireOwnComplaintLease(
  tenantProfileId: string,
  leaseId: string,
): Promise<Guarded<ComplaintLease>> {
  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: { unit: { include: { building: true } } },
  });
  if (!lease) return { response: fail("NOT_FOUND", "계약을 찾을 수 없습니다.") };
  if (lease.tenantProfileId !== tenantProfileId) {
    return { response: fail("FORBIDDEN", "내 계약에만 민원을 접수할 수 있습니다.") };
  }
  if (lease.status !== LeaseStatus.ACTIVE) {
    return { response: fail("CONFLICT", "진행 중인 계약에만 민원을 접수할 수 있습니다.") };
  }
  return { data: lease };
}
