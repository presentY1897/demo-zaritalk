import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandlordOnly } from "@/features/landlord/LandlordOnly";
import { findLandlordProfile } from "@/features/landlord/ownership";
import { LeaseDetailView } from "@/features/lease/LeaseDetailView";
import { getLeaseDetail, listCharges } from "@/features/lease/queries";
import { requireUser } from "@/features/shell/session";

/**
 * `/landlord/leases/[id]` — 계약 상세(조건·세입자·종료) + 수납 탭 (T1.2 + T1.5).
 *
 * 서버가 계약과 청구를 한 번에 읽어 클라이언트에 `initialData` 로 넘긴다 —
 * `GET /api/leases/[id]`·`GET /api/leases/[id]/charges` 와 **같은 함수**라 모양이 어긋나지 않는다.
 * 남의 계약은 화면에서 404 로 막는다(API 는 403 — T1.1 이 세운 규칙).
 *
 * `params`·`searchParams` 는 Next 16 규약대로 Promise 다.
 */
export const metadata: Metadata = { title: "계약 — 자리 데모" };

export default async function LeaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const profile = findLandlordProfile(user);
  if (!profile) return <LandlordOnly />;

  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const lease = await getLeaseDetail(id, profile.id);
  if (!lease) notFound();

  const charges = await listCharges(id);

  return (
    <LeaseDetailView
      initialLease={lease}
      initialCharges={charges}
      initialTab={tab === "charges" ? "charges" : "terms"}
    />
  );
}
