import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandlordOnly } from "@/features/landlord/LandlordOnly";
import { UnitDetailView } from "@/features/landlord/UnitDetailView";
import { findLandlordProfile } from "@/features/landlord/ownership";
import { getUnitDetail } from "@/features/landlord/queries";
import { requireUser } from "@/features/shell/session";

/**
 * `/landlord/units/[id]` — 호실 상세(현재 계약·과거 이력·수납 요약) (T1.1).
 * `params` 는 Next 16 규약대로 Promise 다.
 */
export const metadata: Metadata = { title: "호실 — 자리 데모" };

export default async function UnitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const profile = findLandlordProfile(user);
  if (!profile) return <LandlordOnly />;

  const { id } = await params;
  const unit = await getUnitDetail(id, profile.id);
  if (!unit) notFound();

  return <UnitDetailView initialUnit={unit} />;
}
