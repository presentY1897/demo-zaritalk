import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandlordOnly } from "@/features/landlord/LandlordOnly";
import { findLandlordProfile } from "@/features/landlord/ownership";
import { requireUser } from "@/features/shell/session";
import { LandlordWorkOrderDetailView } from "@/features/workorder/LandlordWorkOrderDetailView";
import { getLandlordWorkOrderDetail } from "@/features/workorder/quotes";
import { prisma } from "@zari/db";

/**
 * `/landlord/workorders/[id]` — 작업 의뢰 상세 (T5.1 + T5.3 견적 비교).
 *
 * T2.6 민원 스레드의 「작업 의뢰로 전환」이 도착하는 목적지다.
 * **화면은 남의 의뢰를 404 로 막는다**(API 는 403 — T1.1·T2.6 이 세운 규칙).
 *
 * 의뢰와 받은 견적을 **한 함수**(`getLandlordWorkOrderDetail`)로 읽는다 —
 * 수락 응답(`POST /api/quotes/[id]/accept`)이 돌려주는 것과 같은 모양이라
 * 화면이 그대로 갈아 끼우면 된다.
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
export const metadata: Metadata = { title: "작업 의뢰 — 자리 데모" };

export default async function LandlordWorkOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const profile = findLandlordProfile(user);
  if (!profile) return <LandlordOnly />;

  const { id } = await params;
  const owner = await prisma.workOrder.findUnique({
    where: { id },
    select: { requesterProfileId: true },
  });
  if (!owner || owner.requesterProfileId !== profile.id) notFound();

  const detail = await getLandlordWorkOrderDetail(id);
  if (!detail) notFound();

  return (
    <LandlordWorkOrderDetailView
      initialWorkOrder={detail.workOrder}
      initialQuotes={detail.quotes}
    />
  );
}
