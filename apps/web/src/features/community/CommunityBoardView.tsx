"use client";

/**
 * `/community` 지역 보드 (T4.1) — 시군구 선택 · 최신/인기 탭 · 무한 스크롤.
 *
 * 첫 페이지는 서버 컴포넌트가 `initialPage` 로 넘겨주고, 이후 페이지는 `useInfiniteQuery` 가
 * 서버가 준 `nextCursor` 로 이어 읽는다. **지역·정렬은 쿼리 키의 일부**라 바꾸면 커서가 통째로
 * 버려진다(다른 탭의 커서를 보내면 서버가 400 이다 — `features/community/cursor.ts` 참고).
 *
 * 지역·정렬은 `history.replaceState` 로 주소에만 반영한다 — 네비게이션을 일으키지 않아
 * 스크롤 위치와 이미 읽은 페이지가 유지된다. 새로고침·공유하면 서버 컴포넌트가 그 값으로 첫 페이지를 그린다.
 *
 * 다음 페이지는 목록 끝의 감시 대상(IntersectionObserver)이 보이면 자동으로 읽고,
 * **「더 보기」 버튼도 함께 둔다** — 키보드·스크린리더 사용자와 E2E 가 쓰는 확실한 경로다.
 */
import { Badge, Button, buttonRecipe, Card, useTrack } from "@zari/ui";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { css, cx } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import type { PostSort } from "./cursor";
import { useCommunityBoard } from "./hooks";
import { PROFILE_TYPE_META, SORT_TABS, formatMoment } from "./labels";
import type { PostListResult, PostSummaryDto, RegionOptionDto } from "./types";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
});
const titleStyle = css({ textStyle: "headline", color: "text" });
const captionStyle = css({ textStyle: "caption", color: "text.muted" });
const selectStyle = css({
  w: "full",
  h: "44px",
  px: "3",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  textStyle: "body",
  color: "text",
  _focusVisible: { outline: "2px solid", outlineColor: "border.focus", outlineOffset: "1px" },
});
const tabRowStyle = css({ display: "flex", gap: "1", p: "1", rounded: "pill", bg: "bg.subtle" });
const tabStyle = css({
  flex: "1",
  px: "3",
  py: "2",
  rounded: "pill",
  borderWidth: "0",
  bg: "transparent",
  textStyle: "label",
  color: "text.muted",
  cursor: "pointer",
  _focusVisible: { outline: "2px solid", outlineColor: "border.focus", outlineOffset: "1px" },
});
const tabActiveStyle = css({ bg: "bg.card", color: "text", shadow: "card" });
const listStyle = css({ display: "flex", flexDirection: "column", gap: "3" });
const cardLinkStyle = css({ textDecoration: "none", color: "inherit", display: "block" });
const postTitleStyle = css({ textStyle: "bodyStrong", color: "text" });
const blindedTitleStyle = css({ color: "text.muted" });
const bodyStyle = css({
  mt: "1.5",
  textStyle: "body",
  color: "text.muted",
  overflow: "hidden",
  display: "-webkit-box",
  lineClamp: 2,
});
const metaRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  mt: "2",
  flexWrap: "wrap",
  textStyle: "caption",
  color: "text.muted",
});
const authorRowStyle = css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap" });
const emptyStyle = css({
  p: "6",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "dashed",
  borderColor: "border",
  textAlign: "center",
  textStyle: "body",
  color: "text.muted",
});
const errorStyle = css({
  bg: "danger.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "danger.border",
  rounded: "field",
  p: "3",
  textStyle: "caption",
  color: "danger.text",
});
const sentinelStyle = css({ h: "1px" });
const linkButtonStyle = css({ textDecoration: "none" });

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "목록을 불러오지 못했습니다.";
}

function PostCard({ post }: { post: PostSummaryDto }) {
  const author = PROFILE_TYPE_META[post.author.type];
  return (
    <Link
      href={`/community/${post.id}`}
      className={cardLinkStyle}
      data-testid="community-post-card"
      data-post-id={post.id}
      data-blinded={post.bodyHidden ? "true" : "false"}
    >
      <Card padding="md" interactive>
        <div className={authorRowStyle}>
          <Badge tone={author.tone}>{author.label}</Badge>
          <span className={captionStyle}>{post.author.name}</span>
          {post.moderation === "BLINDED" ? <Badge tone="danger">블라인드</Badge> : null}
        </div>
        <p className={cx(postTitleStyle, post.bodyHidden && blindedTitleStyle)} data-testid="community-post-title">
          {post.title}
        </p>
        <p className={bodyStyle}>{post.body}</p>
        <div className={metaRowStyle}>
          <span>{formatMoment(post.createdAt)}</span>
          <span aria-hidden>·</span>
          <span data-testid="community-post-likes">좋아요 {post.likeCount}</span>
          <span aria-hidden>·</span>
          <span>댓글 {post.commentCount}</span>
          <span aria-hidden>·</span>
          <span>조회 {post.viewCount}</span>
        </div>
      </Card>
    </Link>
  );
}

export type CommunityBoardViewProps = {
  regions: RegionOptionDto[];
  initialRegionCode: string;
  initialSort: PostSort;
  initialPage: PostListResult;
};

export function CommunityBoardView({
  regions,
  initialRegionCode,
  initialSort,
  initialPage,
}: CommunityBoardViewProps) {
  const { track } = useTrack();
  const [regionCode, setRegionCode] = useState(initialRegionCode);
  const [sort, setSort] = useState<PostSort>(initialSort);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // 서버가 그려 준 첫 페이지는 진입 시점의 지역·정렬에만 해당한다
  const isInitialKey = regionCode === initialRegionCode && sort === initialSort;
  const board = useCommunityBoard(regionCode, sort, isInitialKey ? initialPage : undefined);

  const posts = board.data?.pages.flatMap((page) => page.posts) ?? [];
  const region = regions.find((item) => item.code === regionCode);

  useEffect(() => {
    track(TRACK_EVENTS.COMMUNITY_BOARD_VIEW, { regionCode, sort, count: posts.length });
    // 지역·정렬이 바뀔 때마다 한 번씩 — 목록 길이 변화로는 다시 쏘지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionCode, sort]);

  /** 주소만 바꾼다(네비게이션 없음) — 새로고침·공유하면 서버가 이 값으로 첫 페이지를 그린다 */
  function syncUrl(nextRegion: string, nextSort: PostSort) {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("region", nextRegion);
    url.searchParams.set("sort", nextSort);
    window.history.replaceState(null, "", url.toString());
  }

  function changeRegion(next: string) {
    if (next === regionCode) return;
    track(TRACK_EVENTS.COMMUNITY_REGION_CHANGE, { from: regionCode, to: next });
    setRegionCode(next);
    syncUrl(next, sort);
  }

  function changeSort(next: PostSort) {
    if (next === sort) return;
    track(TRACK_EVENTS.COMMUNITY_SORT_CHANGE, { sort: next });
    setSort(next);
    syncUrl(regionCode, next);
  }

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = board;

  // 목록 끝이 보이면 다음 페이지를 읽는다
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <main className={pageStyle}>
      <div className={headerStyle}>
        <div>
          <h1 className={titleStyle}>커뮤니티</h1>
          <p className={captionStyle}>{region?.label ?? "지역"} 이웃들의 이야기</p>
        </div>
        <Link
          href="/community/write"
          className={cx(buttonRecipe({ variant: "primary", size: "sm" }), linkButtonStyle)}
          data-testid="community-write-link"
        >
          글쓰기
        </Link>
      </div>

      <select
        className={selectStyle}
        aria-label="지역 선택"
        value={regionCode}
        onChange={(event) => changeRegion(event.target.value)}
        data-testid="community-region-select"
      >
        {regions.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>

      <div className={tabRowStyle} role="tablist" aria-label="정렬">
        {SORT_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={sort === tab.key}
            title={tab.hint}
            className={cx(tabStyle, sort === tab.key && tabActiveStyle)}
            onClick={() => changeSort(tab.key)}
            data-testid={`community-sort-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {board.isError ? (
        <p className={errorStyle} role="alert">
          {errorMessage(board.error)}
        </p>
      ) : null}

      {posts.length === 0 && !board.isPending ? (
        <p className={emptyStyle} data-testid="community-empty">
          아직 이 지역에 글이 없습니다. 첫 글을 남겨 보세요.
        </p>
      ) : (
        <div className={listStyle} data-testid="community-post-list">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className={sentinelStyle} aria-hidden />

      {hasNextPage ? (
        <Button
          variant="secondary"
          fullWidth
          loading={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
          data-testid="community-load-more"
        >
          더 보기
        </Button>
      ) : null}
    </main>
  );
}
