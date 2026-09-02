import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComplaintThreadView } from "@/features/complaint/ComplaintThreadView";
import { getComplaintForViewer } from "@/features/complaint/queries";
import { requireUser } from "@/features/shell/session";

/**
 * `/landlord/complaints/[id]` — 민원 스레드(임대인 시점) + 상태 변경 (T2.6).
 *
 * **임대인 홈(T1.9)의 「새 민원 N건」 배지가 가리키는 목적지가 바로 이 경로다**
 * (`inbox.latestComplaintId` → `/landlord/complaints/[id]`).
 *
 * 권한 판정은 세입자 스레드와 **같은 함수**(`getComplaintForViewer` → `resolveComplaintParty`)로 한다.
 * 임대인으로 판정되지 않으면(제3자·다른 임대인) 404 로 막는다.
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
export const metadata: Metadata = { title: "민원 — 자리 데모" };

export default async function LandlordComplaintThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const viewed = await getComplaintForViewer(id, user);
  if (!viewed || viewed.viewer.party !== "LANDLORD") notFound();

  return <ComplaintThreadView initialComplaint={viewed.complaint} viewer={viewed.viewer.party} />;
}
