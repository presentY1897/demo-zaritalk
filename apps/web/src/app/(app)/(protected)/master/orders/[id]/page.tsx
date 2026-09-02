import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MasterOnly } from "@/features/master/MasterOnly";
import { MasterOrderDetailView } from "@/features/master/MasterOrderDetailView";
import { requireMaster } from "@/features/master/ownership";
import { getMasterWorkOrder } from "@/features/master/queries";

/**
 * `/master/orders/[id]` — 마스터 시점 의뢰 상세 (T5.2).
 *
 * 볼 수 있는 의뢰는 둘 중 하나다 — ① 나에게 추천으로 온 의뢰 ② 내 업종·활동반경 안의 의뢰.
 * 그 밖에는 **404** 다(존재 여부를 흘리지 않는다 — T2.6 화면 규칙과 같다).
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

  return <MasterOrderDetailView workOrder={workOrder} />;
}
