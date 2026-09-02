import type { Metadata } from "next";
import { LandlordOnly } from "@/features/landlord/LandlordOnly";
import { findLandlordProfile } from "@/features/landlord/ownership";
import { requireUser } from "@/features/shell/session";
import { LandlordWorkOrderListView } from "@/features/workorder/LandlordWorkOrderListView";
import {
  listLandlordWorkOrders,
  listWorkOrderPlaceOptions,
} from "@/features/workorder/queries";

/**
 * `/landlord/workorders` — 임대인 작업 의뢰 목록·생성 (T5.1).
 *
 * 라우트 핸들러(`GET /api/work-orders`)와 **같은 조회 함수**를 써서 첫 데이터를 그린다(T1.1 규칙).
 *
 * **임대인 탭바에는 이 경로가 없다**(T0.5 탭 배정표는 홈·자산·중개요청·커뮤니티·마이 다).
 * 지금 진입로는 ① 민원 스레드에서 전환한 뒤 따라오는 링크 ② 직접 URL 이다 —
 * 홈/자산에서 링크를 거는 것은 `features/landlord/**` 소유라 이 task 범위 밖이다(task 문서 참고).
 */
export const metadata: Metadata = { title: "작업 의뢰 — 자리 데모" };

export default async function LandlordWorkOrdersPage() {
  const user = await requireUser();
  const profile = findLandlordProfile(user);
  if (!profile) return <LandlordOnly />;

  const [workOrders, places] = await Promise.all([
    listLandlordWorkOrders(profile.id),
    listWorkOrderPlaceOptions(profile.id),
  ]);
  return <LandlordWorkOrderListView initialWorkOrders={workOrders} places={places} />;
}
