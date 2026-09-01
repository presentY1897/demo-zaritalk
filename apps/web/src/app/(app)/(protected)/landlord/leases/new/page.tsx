import type { Metadata } from "next";
import { LandlordOnly } from "@/features/landlord/LandlordOnly";
import { findLandlordProfile } from "@/features/landlord/ownership";
import { LeaseNewView } from "@/features/lease/LeaseNewView";
import { listUnitOptions } from "@/features/lease/queries";
import { requireUser } from "@/features/shell/session";

/**
 * `/landlord/leases/new` — 계약 등록 (T1.2).
 *
 * `?unitId=` 로 호실을 미리 고를 수 있다(호실 상세의 「계약 등록」 버튼이 이 링크를 쓴다).
 * Next 16 에서 `searchParams` 는 **Promise** 다
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`).
 */
export const metadata: Metadata = { title: "계약 등록 — 자리 데모" };

export default async function LeaseNewPage({
  searchParams,
}: {
  searchParams: Promise<{ unitId?: string }>;
}) {
  const user = await requireUser();
  const profile = findLandlordProfile(user);
  if (!profile) return <LandlordOnly />;

  const [units, { unitId }] = await Promise.all([listUnitOptions(profile.id), searchParams]);
  // 남의 호실 id 를 붙여 와도 내 호실 목록에 없으면 무시된다
  const defaultUnitId = units.some((unit) => unit.unitId === unitId) ? unitId : undefined;

  return <LeaseNewView units={units} defaultUnitId={defaultUnitId} />;
}
