import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOwnedTarget, requireRealtor } from "@/features/brokerage/ownership";
import { getRealtorInboxItem } from "@/features/brokerage/queries";
import { RealtorRequestDetailView } from "@/features/realtor/RealtorRequestDetailView";
import { RealtorOnly } from "@/features/realtor/RealtorOnly";

/**
 * `/realtor/requests/[id]` — 중개 요청 상세 (T3.7). 수락·거절이 일어나는 화면이다.
 *
 * 소유 판정은 API 와 **같은 함수**(`requireOwnedTarget`)를 쓴다. 다만 화면은 남의 타겟을
 * 403 이 아니라 **404 로 막는다** — T1.1 이 정한 규칙 그대로다.
 *
 * 열람 표시(`VIEWED`)는 여기서 하지 않고 클라이언트 화면이 마운트될 때 보낸다 —
 * 링크 프리페치만으로 "열람" 이 찍히면 임대인이 보는 현황이 거짓말이 되기 때문이다.
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
export const metadata: Metadata = { title: "중개 요청 상세 — 자리 데모" };

export default async function RealtorRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const realtor = await requireRealtor();
  if (realtor.response) return <RealtorOnly />;

  const target = await requireOwnedTarget(realtor.data, id);
  if (target.response) notFound();

  const item = await getRealtorInboxItem(realtor.data, id);
  if (!item) notFound();

  return <RealtorRequestDetailView initialItem={item} />;
}
