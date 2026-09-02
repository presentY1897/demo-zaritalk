import type { Metadata } from "next";
import { LandlordComplaintListView } from "@/features/complaint/LandlordComplaintListView";
import { listLandlordComplaints } from "@/features/complaint/queries";
import { LandlordOnly } from "@/features/landlord/LandlordOnly";
import { findLandlordProfile } from "@/features/landlord/ownership";
import { requireUser } from "@/features/shell/session";

/**
 * `/landlord/complaints` — 임대인 민원 목록 (T2.6).
 *
 * **task 문서 표에 없는 화면이다.** 임대인은 홈(T1.9) 배지에서 상세로 바로 들어오지만,
 * 상세의 「민원 목록」 링크가 갈 곳이 필요하고 배지가 가리키지 않는 나머지 민원도 봐야 한다.
 * 그래서 최소 목록만 둔다(필터·검색 없음).
 */
export const metadata: Metadata = { title: "민원 — 자리 데모" };

export default async function LandlordComplaintsPage() {
  const user = await requireUser();
  const profile = findLandlordProfile(user);
  if (!profile) return <LandlordOnly />;

  const complaints = await listLandlordComplaints(profile.id);
  return <LandlordComplaintListView initialComplaints={complaints} />;
}
