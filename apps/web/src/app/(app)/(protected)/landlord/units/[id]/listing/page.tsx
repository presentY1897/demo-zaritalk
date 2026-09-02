import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingView } from "@/features/listing/ListingView";
import { requireListingActorForUnit } from "@/features/listing/permissions";
import { getListingPage } from "@/features/listing/queries";

/**
 * `/landlord/units/[id]/listing` — 매물 등록·상태 관리 (T3.1).
 *
 * 권한 판정은 API 와 **같은 함수**(`requireListingActorForUnit`)를 쓴다. 다만 화면은
 * 남의 자원을 403 이 아니라 **404 로 막는다** — T1.1 이 정한 규칙 그대로다
 * (API 는 403 을 주고, 화면은 존재 여부를 흘리지 않는 편이 낫다).
 * 비로그인은 `(protected)` 레이아웃이 `/login` 으로 보낸다.
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
export const metadata: Metadata = { title: "매물 관리 — 자리 데모" };

export default async function UnitListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const actor = await requireListingActorForUnit(id);
  if (actor.response) notFound();

  const page = await getListingPage(actor.data);
  return <ListingView initialPage={page} />;
}
