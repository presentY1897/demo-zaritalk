import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PostWriteForm } from "@/features/community/PostWriteForm";
import { requireCommunityProfile } from "@/features/community/ownership";
import { REGION_OPTIONS } from "@/features/community/queries";
import { resolveRegion } from "@/features/community/regions";

/**
 * `/community/write` — 글 작성 (T4.1).
 *
 * 보드에서 넘어올 때 `?region=` 을 실어 보내면 그 지역이 기본 선택이 된다.
 * 글쓴이는 **활성 프로필**이라 여기서 고르지 않는다(유형은 목록 배지로 드러난다).
 *
 * `searchParams` 는 Next 16 규약대로 Promise 다.
 */
export const metadata: Metadata = { title: "글쓰기 — 자리 데모" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CommunityWritePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireCommunityProfile();
  if (session.response) redirect("/onboarding");

  const params = await searchParams;
  const raw = params.region;
  const region = resolveRegion(Array.isArray(raw) ? raw[0] : raw);

  return <PostWriteForm regions={REGION_OPTIONS} defaultRegionCode={region.code} />;
}
