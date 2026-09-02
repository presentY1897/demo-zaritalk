/**
 * 커뮤니티 API 호출부 (T4.1·T4.2).
 * 에러는 D1 규약대로 `{ error: { code, message } }` 한 형태라 `ApiError`(T0.4)로 바꿔 던진다.
 * 래퍼 모양은 T2.6 `features/complaint/api.ts` 와 같다.
 */
import { ApiError } from "@/features/auth/api";
import type { PostSort } from "./cursor";
import type { CreateCommentInput, CreatePostInput, CreateReportInput } from "./schema";
import type {
  CommentDeleteResult,
  CommentResult,
  LikeResult,
  PostDeleteResult,
  PostDetailDto,
  PostListResult,
  ReportResult,
} from "./types";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });

  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "INTERNAL_ERROR",
      error?.message ?? "요청을 처리하지 못했습니다.",
      error?.details,
    );
  }
  return body as T;
}

export type FetchPostsParams = {
  regionCode: string;
  sort: PostSort;
  cursor?: string | null;
  limit?: number;
};

export function fetchPosts(params: FetchPostsParams): Promise<PostListResult> {
  const query = new URLSearchParams({ region: params.regionCode, sort: params.sort });
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit) query.set("limit", String(params.limit));
  return requestJson<PostListResult>(`/api/posts?${query.toString()}`);
}

export function createPost(input: CreatePostInput): Promise<PostDetailDto> {
  return requestJson<{ post: PostDetailDto }>("/api/posts", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((body) => body.post);
}

export function deletePost(postId: string): Promise<PostDeleteResult> {
  return requestJson<PostDeleteResult>(`/api/posts/${postId}`, { method: "DELETE" });
}

/** 목표 상태를 지정하는 두 동사 — 토글이 아니라 멱등한 설정이다 */
export function setPostLike(postId: string, liked: boolean): Promise<LikeResult> {
  return requestJson<LikeResult>(`/api/posts/${postId}/like`, {
    method: liked ? "POST" : "DELETE",
  });
}

export function createComment(postId: string, input: CreateCommentInput): Promise<CommentResult> {
  return requestJson<CommentResult>(`/api/posts/${postId}/comments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteComment(commentId: string): Promise<CommentDeleteResult> {
  return requestJson<CommentDeleteResult>(`/api/comments/${commentId}`, { method: "DELETE" });
}

export function createReport(input: CreateReportInput): Promise<ReportResult> {
  return requestJson<ReportResult>("/api/reports", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
