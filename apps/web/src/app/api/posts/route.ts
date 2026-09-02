/**
 * `GET·POST /api/posts` — 지역 보드 목록·글 작성 (T4.1).
 *
 * ## `GET` — 지역 + 정렬 + 커서
 *
 * ```
 * ?region=11200&sort=popular&cursor=cG9wdWxhcnwzfDE3…&limit=20
 * ```
 *
 * 정렬·커서 규약은 `features/community/cursor.ts` 한 곳에 있다. **커서에 정렬 키가 박혀 있어**
 * 다른 탭의 커서를 쓰면 400 이다(조용히 중복·누락을 내지 않는다).
 * 노출 규칙(블라인드는 남기고 작성자 삭제는 뺀다)은 `features/community/moderation.ts` 가 정한다.
 *
 * ## `POST` — 활성 프로필로 쓴다
 *
 * 커뮤니티는 네 유형 공용 탭이라 "임대인 API" 처럼 유형으로 프로필을 고를 수 없다.
 * 활성 프로필(T0.5 쿠키)이 글쓴이가 되고, 그 유형이 목록의 배지가 된다.
 * `regionName` 은 상수표에서 만들어 **저장 시점의 표시명을 함께 박아 둔다**(표가 바뀌어도 옛 글이 깨지지 않게).
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 프로필 없음(온보딩 전) | 403 `FORBIDDEN` |
 * | 모르는 지역·정렬, **다른 탭의 커서·깨진 커서**, 제목·본문 형식 오류 | 400 `VALIDATION_ERROR` |
 */
import { prisma } from "@zari/db";
import { DEFAULT_PAGE_SIZE, decodeCursor, type PostSort } from "@/features/community/cursor";
import { requireCommunityProfile, toViewer } from "@/features/community/ownership";
import { getPostDetail, listPosts } from "@/features/community/queries";
import { findRegion, regionLabel, resolveRegion } from "@/features/community/regions";
import { createPostSchema, listPostsQuerySchema } from "@/features/community/schema";
import { created, fail, ok, parseJson, parseQuery } from "@/lib/api/response";

export async function GET(request: Request): Promise<Response> {
  const session = await requireCommunityProfile();
  if (session.response) return session.response;

  const parsed = parseQuery(request, listPostsQuerySchema);
  if (parsed.response) return parsed.response;

  const region = resolveRegion(parsed.data.region);
  const sort: PostSort = parsed.data.sort ?? "latest";
  const limit = parsed.data.limit ?? DEFAULT_PAGE_SIZE;

  const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor, sort) : null;
  if (parsed.data.cursor && !cursor) {
    return fail("VALIDATION_ERROR", "커서가 이 정렬에 맞지 않습니다. 처음부터 다시 읽어 주세요.");
  }

  const { posts, nextCursor } = await listPosts(
    { regionCode: region.code, sort, cursor, limit },
    toViewer(session.data),
  );

  return ok({
    posts,
    nextCursor,
    sort,
    region: { code: region.code, name: region.name, label: regionLabel(region) },
  });
}

export async function POST(request: Request): Promise<Response> {
  const session = await requireCommunityProfile();
  if (session.response) return session.response;

  const parsed = await parseJson(request, createPostSchema);
  if (parsed.response) return parsed.response;

  const region = findRegion(parsed.data.regionCode);
  if (!region) return fail("VALIDATION_ERROR", "지원하지 않는 지역입니다.");

  const row = await prisma.post.create({
    data: {
      authorProfileId: session.data.profile.id,
      regionCode: region.code,
      regionName: regionLabel(region),
      title: parsed.data.title,
      body: parsed.data.body,
    },
  });

  const post = await getPostDetail(row.id, toViewer(session.data));
  if (!post) return fail("INTERNAL_ERROR", "글을 저장하지 못했습니다.");
  return created({ post });
}
