/**
 * 세입자 대기 계약 판정 (T0.4) — **서버 전용 모듈**(prisma 사용).
 *
 * 임대인이 계약을 먼저 등록하면 세입자는 미가입 상태이므로 계약이
 * `PENDING_TENANT` 로 남고 전화번호만 적혀 있다. 그 번호로 가입해 세입자 프로필을
 * 만들면 수락 화면(T1.3)으로 보내야 한다 — 그 판정을 여기서 한다.
 */
import { LeaseStatus, prisma, ProfileType } from "@zari/db";

/** 홈 */
export const HOME_PATH = "/";
/** 세입자 계약 수락 화면 — 지금은 T1.3 플레이스홀더 페이지가 응답한다 */
export const PENDING_LEASE_PATH = "/tenant/leases/pending";

/** 내 번호로 등록된 수락 대기 계약(건물·호실 포함). 오래된 순. */
export function findPendingLeasesForPhone(phone: string) {
  return prisma.lease.findMany({
    where: { tenantPhone: phone, status: LeaseStatus.PENDING_TENANT },
    include: { unit: { include: { building: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function countPendingLeasesForPhone(phone: string): Promise<number> {
  return prisma.lease.count({
    where: { tenantPhone: phone, status: LeaseStatus.PENDING_TENANT },
  });
}

/**
 * 프로필 생성 직후 어디로 보낼지 정한다.
 * 세입자 유형 + 내 번호로 대기 계약이 있으면 수락 화면, 나머지는 홈.
 */
export async function resolveProfileRedirect(
  phone: string,
  type: ProfileType,
): Promise<string> {
  if (type !== ProfileType.TENANT) return HOME_PATH;
  const pending = await countPendingLeasesForPhone(phone);
  return pending > 0 ? PENDING_LEASE_PATH : HOME_PATH;
}
