import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComplaintThreadView } from "@/features/complaint/ComplaintThreadView";
import { getComplaintForViewer } from "@/features/complaint/queries";
import { requireUser } from "@/features/shell/session";

/**
 * `/tenant/complaints/[id]` — 민원 스레드(세입자 시점) (T2.6).
 *
 * 권한 판정은 `getComplaintForViewer` 가 `features/complaint/ownership.ts` 의
 * `resolveComplaintParty` 를 그대로 불러서 한다 — API 와 **같은 판정 함수**다.
 * 볼 수 없는 민원은 화면에서 404 로 막는다(API 는 403 — T1.1 이 세운 규칙).
 *
 * 세입자로 판정되지 않으면(임대인이 이 URL 로 들어와도) 404 다 — 경로 이름과 시점을 일치시켜,
 * 「민원 목록」으로 돌아가는 링크나 상태 버튼이 반대편 화면에 섞이지 않게 한다.
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
export const metadata: Metadata = { title: "민원 — 자리 데모" };

export default async function TenantComplaintThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const viewed = await getComplaintForViewer(id, user);
  if (!viewed || viewed.viewer.party !== "TENANT") notFound();

  return <ComplaintThreadView initialComplaint={viewed.complaint} viewer={viewed.viewer.party} />;
}
