import type { Metadata } from "next";
import { findTenantProfile } from "@/features/tenant/ownership";
import { PendingLeaseAcceptView } from "@/features/tenant/PendingLeaseAcceptView";
import { listPendingLeases } from "@/features/tenant/queries";
import { TenantOnly } from "@/features/tenant/TenantOnly";
import { requireUser } from "@/features/shell/session";

/**
 * `/tenant/leases/accept` — 대기 계약 목록 → 조건 확인 → 수락/거절 (T1.3).
 *
 * 온보딩에서 세입자 프로필을 만들면 내 번호로 걸린 `PENDING_TENANT` 계약이 있는지 보고
 * 이 화면으로 보낸다(`features/profiles/pending-lease.ts` 의 `resolveProfileRedirect`).
 * T0.4 가 깔아 둔 `/tenant/leases/pending` 은 이 경로로 리다이렉트만 한다.
 *
 * 서버가 대기 계약을 읽어 클라이언트에 `initialData` 로 넘긴다 —
 * `GET /api/tenant/pending-leases` 와 **같은 함수**(`listPendingLeases`)라 모양이 어긋나지 않는다.
 */
export const metadata: Metadata = {
  title: "계약 수락 — 자리 데모",
  description: "내 번호로 등록된 임대차 계약을 확인하고 수락합니다.",
};

export default async function PendingLeaseAcceptPage() {
  const user = await requireUser();
  if (!findTenantProfile(user)) return <TenantOnly title="세입자 계약 수락" />;

  const leases = await listPendingLeases(user.phone);
  return <PendingLeaseAcceptView initialLeases={leases} />;
}
