/**
 * 민원 API 테스트 픽스처 (T2.6) — **테스트에서만 import 한다**(앱 코드에서 쓰지 않는다).
 *
 * 계정·건물·호실은 T1.1 `features/landlord/testing.ts`, 계약은 T1.2 `features/lease/testing.ts`,
 * 세입자 계정은 T1.3 `features/tenant/testing.ts` 를 그대로 재사용하고 —
 * 여기서는 **연결된 계약 + 민원**만 더한다.
 */
import { ComplaintStatus, LeaseStatus, prisma } from "@zari/db";
import { createLandlordWithUnit } from "@/features/lease/testing";
import { createPendingLease, createTenant } from "@/features/tenant/testing";

/** 시드 세입자(박세입)와 같은 번호 — 201호 ACTIVE 계약이 걸린 번호다 */
export const COMPLAINT_TENANT_PHONE = "01022222222";
/** 시드 임대인(김임대)과 같은 번호 */
export const COMPLAINT_LANDLORD_PHONE = "01011111111";

export type ComplaintSceneOptions = {
  landlordPhone?: string;
  tenantPhone?: string;
  tenantName?: string;
  unitLabel?: string;
  leaseStatus?: LeaseStatus;
};

export type ComplaintScene = Awaited<ReturnType<typeof createComplaintScene>>;

/**
 * 민원 테스트의 공통 무대 — 임대인 + 건물/호실 + **연결된 ACTIVE 계약** + 세입자.
 * 민원까지 만들려면 `addComplaint(scene)` 을 이어 부른다.
 *
 * 한 테스트에서 무대를 둘 이상 만들 때는 번호를 서로 다르게 준다(`User.phone` 이 유니크다).
 */
export async function createComplaintScene(options: ComplaintSceneOptions = {}) {
  const landlord = await createLandlordWithUnit(options.landlordPhone ?? COMPLAINT_LANDLORD_PHONE, [
    options.unitLabel ?? "201호",
  ]);
  const tenant = await createTenant(
    options.tenantPhone ?? COMPLAINT_TENANT_PHONE,
    options.tenantName ?? "박세입",
  );
  const lease = await createPendingLease(landlord.unit.id, {
    tenantPhone: options.tenantPhone ?? COMPLAINT_TENANT_PHONE,
    tenantName: options.tenantName ?? "박세입",
    tenantProfileId: tenant.profile.id,
    status: options.leaseStatus ?? LeaseStatus.ACTIVE,
  });
  return { landlord, tenant, lease };
}

/** 서로 겹치지 않는 두 번째 무대 — "남의 건물 민원은 안 보인다" 검증용 */
export function createOtherScene(options: ComplaintSceneOptions = {}) {
  return createComplaintScene({
    landlordPhone: "01099999999",
    tenantPhone: "01066666666",
    tenantName: "이세입",
    unitLabel: "401호",
    ...options,
  });
}

/** 무대 위에 민원 1건 (기본 `OPEN` — 임대인 홈 배지가 세는 상태) */
export async function addComplaint(
  scene: { lease: { id: string }; tenant: { profile: { id: string } } },
  overrides: {
    status?: ComplaintStatus;
    title?: string;
    body?: string;
    photos?: string[];
  } = {},
) {
  return prisma.complaint.create({
    data: {
      leaseId: scene.lease.id,
      tenantProfileId: scene.tenant.profile.id,
      title: overrides.title ?? "온수가 나오지 않습니다",
      body: overrides.body ?? "어제 저녁부터 온수가 전혀 나오지 않습니다.",
      status: overrides.status ?? ComplaintStatus.OPEN,
      photos: overrides.photos,
    },
  });
}

/** 스레드 메시지 1건 (작성자 프로필을 직접 지정한다 — 작성자 기록 검증용) */
export async function addComplaintMessage(
  complaintId: string,
  authorProfileId: string,
  body = "확인하고 연락드리겠습니다.",
) {
  return prisma.complaintMessage.create({ data: { complaintId, authorProfileId, body } });
}

/**
 * 무대와 아무 관계 없는 **제3자** — 다른 건물을 가진 임대인 + 계약이 없는 세입자.
 * "제3자 403" 을 두 방향(임대인·세입자) 모두에서 확인하려고 둘 다 만든다.
 */
export async function createOutsiders() {
  const otherLandlord = await createLandlordWithUnit("01077777777", ["301호"]);
  const otherTenant = await createTenant("01088888888", "남남남");
  return { otherLandlord, otherTenant };
}
