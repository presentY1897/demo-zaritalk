import type { Metadata } from "next";
import { TenantComplaintListView } from "@/features/complaint/TenantComplaintListView";
import { listComplaintLeaseOptions, listTenantComplaints } from "@/features/complaint/queries";
import { requireUser } from "@/features/shell/session";
import { findTenantProfile } from "@/features/tenant/ownership";
import { TenantOnly } from "@/features/tenant/TenantOnly";

/**
 * `/tenant/complaints` — 민원 접수·목록 (T2.6).
 *
 * 서버가 목록과 접수 폼의 계약 선택지를 한 번에 읽어 클라이언트에 넘긴다 —
 * `GET /api/complaints?role=tenant` 와 **같은 함수**라 모양이 어긋나지 않는다.
 */
export const metadata: Metadata = { title: "민원 — 자리 데모" };

export default async function TenantComplaintsPage() {
  const user = await requireUser();
  const profile = findTenantProfile(user);
  if (!profile) return <TenantOnly title="민원" />;

  const [complaints, leases] = await Promise.all([
    listTenantComplaints(profile.id),
    listComplaintLeaseOptions(profile.id),
  ]);

  return <TenantComplaintListView initialComplaints={complaints} leases={leases} />;
}
