"use client";

/**
 * 커뮤니티 Tanstack Query 훅 (T4.1).
 *
 * **목록은 `useInfiniteQuery`** 다 — 서버가 준 `nextCursor` 를 그대로 다음 페이지 파라미터로 쓴다.
 * 첫 페이지는 서버 컴포넌트가 `initialData` 로 내려주므로 보드 진입에 네트워크 왕복이 없다.
 * 지역·정렬이 바뀌면 쿼리 키가 바뀌어 **커서가 자동으로 버려진다**(다른 탭의 커서를 보내면 400 이다).
 *
 * **상세는 쿼리로 두지 않는다** — 서버 컴포넌트가 내려준 값에서 시작해 좋아요·댓글 응답에 실려 온
 * 갱신본으로 화면 state 를 갱신한다(T2.6 민원 스레드와 같은 판단). 상세를 다시 읽으면
 * `GET /api/posts/[id]` 가 조회수를 또 올려 "화면 진입 1회 = 조회수 1" 이 깨진다.
 */
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PostSort } from "./cursor";
import {
  createComment,
  createPost,
  createReport,
  deleteComment,
  deletePost,
  fetchPosts,
  setPostLike,
} from "./api";
import type { CreateCommentInput, CreatePostInput, CreateReportInput } from "./schema";
import type { PostListResult } from "./types";

export const communityKeys = {
  all: ["community"] as const,
  board: (regionCode: string, sort: PostSort) => ["community", "board", regionCode, sort] as const,
};

export function useCommunityBoard(
  regionCode: string,
  sort: PostSort,
  initialPage?: PostListResult,
) {
  return useInfiniteQuery({
    queryKey: communityKeys.board(regionCode, sort),
    queryFn: ({ pageParam }) =>
      fetchPosts({ regionCode, sort, cursor: pageParam as string | null }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: PostListResult) => lastPage.nextCursor,
    // 서버 컴포넌트가 그린 첫 페이지를 그대로 캐시에 심는다(진입 시 왕복 0)
    initialData: initialPage
      ? { pages: [initialPage], pageParams: [null as string | null] }
      : undefined,
  });
}

/** 글 작성 — 성공하면 보드 캐시를 비운다(새 글이 최신 탭 맨 위로) */
export function useCreatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePostInput) => createPost(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}

/** 좋아요 — 인기 탭 정렬이 바뀌므로 보드 캐시를 비운다 */
export function useSetPostLike(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (liked: boolean) => setPostLike(postId, liked),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}

export function useCreateComment(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommentInput) => createComment(postId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}

export function useDeleteComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => deleteComment(commentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}

export function useDeletePost(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deletePost(postId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: communityKeys.all });
    },
  });
}

/** 신고 — 큐는 어드민 앱이 읽으므로 무효화할 캐시가 없다 */
export function useCreateReport() {
  return useMutation({ mutationFn: (input: CreateReportInput) => createReport(input) });
}
