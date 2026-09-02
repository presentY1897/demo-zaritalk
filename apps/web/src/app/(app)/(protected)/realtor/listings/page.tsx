import type { Metadata } from "next";
import { requireRealtor } from "@/features/brokerage/ownership";
import { listRealtorListings } from "@/features/brokerage/queries";
import { RealtorListingsView } from "@/features/realtor/RealtorListingsView";
import { RealtorOnly } from "@/features/realtor/RealtorOnly";

/**
 * `/realtor/listings` — 중개인 매물 관리 (T3.7). T0.5 가 배정한 탭 목적지의 플레이스홀더를 대체한다.
 *
 * 등록·수정·상태 변경 화면은 T3.1 의 `/landlord/units/[id]/listing` 을 그대로 쓴다
 * (그 화면이 이미 "소유 임대인 또는 수락 중개인" 을 받는다). 여기는 **입구와 목록**만 담당한다.
 */
export const metadata: Metadata = { title: "매물 — 자리 데모" };

export default async function RealtorListingsPage() {
  const realtor = await requireRealtor();
  if (realtor.response) return <RealtorOnly title="매물" />;

  const data = await listRealtorListings(realtor.data);
  return <RealtorListingsView data={data} />;
}
