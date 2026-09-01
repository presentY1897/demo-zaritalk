import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BuildingDetailView } from "@/features/landlord/BuildingDetailView";
import { LandlordOnly } from "@/features/landlord/LandlordOnly";
import { findLandlordProfile } from "@/features/landlord/ownership";
import { getBuildingDetail } from "@/features/landlord/queries";
import { requireUser } from "@/features/shell/session";

/**
 * `/landlord/buildings/[id]` — 건물 상세(호실 그리드) (T1.1).
 *
 * Next 16 에서 동적 세그먼트 `params` 는 **Promise** 다
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`).
 *
 * 남의 건물은 화면에서 404 로 막는다(API 는 403 — 화면은 존재 여부를 흘리지 않는 편이 낫다).
 */
export const metadata: Metadata = { title: "건물 — 자리 데모" };

export default async function BuildingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const profile = findLandlordProfile(user);
  if (!profile) return <LandlordOnly />;

  const { id } = await params;
  const building = await getBuildingDetail(id, profile.id);
  if (!building) notFound();

  return <BuildingDetailView initialBuilding={building} />;
}
