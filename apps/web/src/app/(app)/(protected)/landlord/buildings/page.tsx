import type { Metadata } from "next";
import { BuildingListView } from "@/features/landlord/BuildingListView";
import { LandlordOnly } from "@/features/landlord/LandlordOnly";
import { findLandlordProfile } from "@/features/landlord/ownership";
import { listBuildings } from "@/features/landlord/queries";
import { requireUser } from "@/features/shell/session";

/**
 * `/landlord/buildings` — 임대인 탭바의 "자산"(경로는 T0.5 에서 확정) (T1.1).
 *
 * 서버 컴포넌트가 첫 목록을 읽어 클라이언트 화면에 `initialData` 로 넘긴다 —
 * `GET /api/buildings` 와 **같은 함수**(`listBuildings`)라 모양이 어긋나지 않는다.
 */
export const metadata: Metadata = { title: "자산 — 자리 데모" };

export default async function BuildingsPage() {
  const user = await requireUser();
  const profile = findLandlordProfile(user);
  if (!profile) return <LandlordOnly />;

  const buildings = await listBuildings(profile.id);
  return <BuildingListView initialBuildings={buildings} />;
}
