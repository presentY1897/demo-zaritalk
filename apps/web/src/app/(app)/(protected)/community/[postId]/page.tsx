import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PostDetailView } from "@/features/community/PostDetailView";
import { requireCommunityProfile, toViewer } from "@/features/community/ownership";
import { getPostDetail } from "@/features/community/queries";

/**
 * `/community/[postId]` — 글 상세 (T4.1·T4.2).
 *
 * **조회수는 여기서 오른다** — 화면 진입 1회 = 1. 상세는 클라이언트에서 다시 읽지 않으므로
 * (`PostDetailView` 주석 참고) 이중 계산이 없다.
 *
 * 작성자가 지운 글은 `getPostDetail` 이 `null` 을 주고 화면은 `notFound()` 다.
 * 블라인드된 글은 **열린다** — 본문을 가리고 참여를 막는 것은 DTO·API 가 한다
 * (`features/community/moderation.ts` 규칙표).
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
export const metadata: Metadata = { title: "커뮤니티 — 자리 데모" };

export default async function CommunityPostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const session = await requireCommunityProfile();
  if (session.response) redirect("/onboarding");

  const { postId } = await params;
  const post = await getPostDetail(postId, toViewer(session.data), { countView: true });
  if (!post) notFound();

  return <PostDetailView initialPost={post} />;
}
