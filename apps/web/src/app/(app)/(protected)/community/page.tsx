import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CommunityBoardView } from "@/features/community/CommunityBoardView";
import { DEFAULT_PAGE_SIZE, POST_SORTS, type PostSort } from "@/features/community/cursor";
import { requireCommunityProfile, toViewer } from "@/features/community/ownership";
import { listPosts, REGION_OPTIONS } from "@/features/community/queries";
import { regionLabel, resolveRegion } from "@/features/community/regions";

/**
 * `/community` — 지역 보드 (T4.1). T0.5 가 배정한 **네 프로필 공용 탭 목적지**의 플레이스홀더를 대체한다.
 *
 * 라우트 핸들러(`GET /api/posts`)와 **같은 조회 함수**로 첫 페이지를 그린다 — 진입에 왕복이 없고,
 * 이어지는 페이지만 커서로 읽는다. 지역·정렬은 `?region=&sort=` 라 새로고침·공유가 된다.
 *
 * **왜 로그인 필수(`(protected)`)인가** — T0.5 가 비로그인 허용 화면을 `/search`·`/refund/calculator`·
 * `/notice/[token]` 셋으로 못 박았고 커뮤니티는 거기 없다. 게다가 글쓰기·좋아요·댓글·신고가 전부
 * 프로필을 요구하므로, 비로그인에게는 잠긴 버튼만 늘어선 화면이 된다. API 도 같은 규칙(비로그인 401)이다.
 *
 * `searchParams` 는 Next 16 규약대로 Promise 다.
 */
export const metadata: Metadata = { title: "커뮤니티 — 자리 데모" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CommunityBoardPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireCommunityProfile();
  // 프로필이 없으면(온보딩 전) 커뮤니티에 남길 신분이 없다 — 온보딩으로 보낸다
  if (session.response) redirect("/onboarding");

  const params = await searchParams;
  const region = resolveRegion(first(params.region));
  const sortParam = first(params.sort);
  const sort: PostSort = (POST_SORTS as readonly string[]).includes(sortParam ?? "")
    ? (sortParam as PostSort)
    : "latest";

  const { posts, nextCursor } = await listPosts(
    { regionCode: region.code, sort, cursor: null, limit: DEFAULT_PAGE_SIZE },
    toViewer(session.data),
  );

  return (
    <CommunityBoardView
      regions={REGION_OPTIONS}
      initialRegionCode={region.code}
      initialSort={sort}
      initialPage={{
        posts,
        nextCursor,
        sort,
        region: { code: region.code, name: region.name, label: regionLabel(region) },
      }}
    />
  );
}
