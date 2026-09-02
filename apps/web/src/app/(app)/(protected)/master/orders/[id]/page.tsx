import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MasterOnly } from "@/features/master/MasterOnly";
import { MasterOrderDetailView } from "@/features/master/MasterOrderDetailView";
import { requireMaster } from "@/features/master/ownership";
import { getMasterWorkOrder } from "@/features/master/queries";
import { findMyQuote } from "@/features/workorder/quotes";

/**
 * `/master/orders/[id]` — 마스터 시점 의뢰 상세 (T5.2 + T5.3 견적 제안).
 *
 * 볼 수 있는 의뢰는 둘 중 하나다 — ① 나에게 추천으로 온 의뢰 ② 내 업종·활동반경 안의 의뢰.
 * 그 밖에는 **404** 다(존재 여부를 흘리지 않는다 — T2.6 화면 규칙과 같다).
 * 견적 제안 API(`POST /api/work-orders/[id]/quotes`)도 **같은 판정 함수**를 쓴다.
 *
 * 내가 이미 낸 견적이 있으면 함께 내려 준다 — 의뢰당 1회라 그 자리는 버튼이 아니라 카드가 된다.
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
export const metadata: Metadata = { title: "의뢰 상세 — 자리 데모" };

export default async function MasterOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const master = await requireMaster();
  if (master.response) return <MasterOnly />;

  const { id } = await params;
  const workOrder = await getMasterWorkOrder(master.data, id);
  if (!workOrder) notFound();

  const myQuote = await findMyQuote(master.data.profile.id, id);

  return <MasterOrderDetailView workOrder={workOrder} initialQuote={myQuote} />;
}
