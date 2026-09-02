"use client";

/**
 * `/community/[postId]` 글 상세 (T4.1·T4.2) — 조회수·좋아요·댓글·신고·블라인드 표시.
 *
 * **상세는 Tanstack Query 로 다시 읽지 않는다.** 서버 컴포넌트가 내려준 값에서 시작해
 * 좋아요·댓글 응답에 실려 온 갱신본으로 state 를 갱신한다(T2.6 민원 스레드와 같은 판단).
 * 다시 읽으면 `GET /api/posts/[id]` 가 조회수를 또 올려 "화면 진입 1회 = 조회수 1" 이 깨진다.
 *
 * 블라인드된 글은 **자리를 남기고 본문만 가린다**(작성자·어드민은 원문을 본다 —
 * `features/community/moderation.ts` 규칙표). 그때 좋아요·댓글·신고 버튼은 전부 잠긴다.
 */
import { Badge, Button, Card, Sheet, useTrack } from "@zari/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { css, cx } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import {
  useCreateComment,
  useCreateReport,
  useDeleteComment,
  useDeletePost,
  useSetPostLike,
} from "./hooks";
import { PROFILE_TYPE_META, formatMoment } from "./labels";
import { REPORT_REASONS, type PostCommentDto, type PostDetailDto } from "./types";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const backLinkStyle = css({ textStyle: "caption", color: "text.brand" });
const titleStyle = css({ textStyle: "title", color: "text" });
const captionStyle = css({ textStyle: "caption", color: "text.muted" });
const rowStyle = css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap" });
const bodyStyle = css({ mt: "3", textStyle: "body", color: "text", whiteSpace: "pre-wrap" });
const mutedBodyStyle = css({ color: "text.muted" });
const noticeStyle = css({
  mt: "3",
  p: "3",
  rounded: "field",
  bg: "danger.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "danger.border",
  textStyle: "caption",
  color: "danger.text",
});
const actionRowStyle = css({ display: "flex", gap: "2", mt: "4", flexWrap: "wrap" });
const commentListStyle = css({ display: "flex", flexDirection: "column", gap: "2" });
const commentStyle = css({
  p: "3",
  rounded: "field",
  bg: "bg.subtle",
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
});
const commentBodyStyle = css({ textStyle: "body", color: "text", whiteSpace: "pre-wrap" });
const smallButtonRowStyle = css({ display: "flex", gap: "2", justifyContent: "flex-end" });
const textareaStyle = css({
  w: "full",
  minH: "88px",
  p: "3",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  textStyle: "body",
  color: "text",
  resize: "vertical",
  _focusVisible: { outline: "2px solid", outlineColor: "border.focus", outlineOffset: "1px" },
});
const reasonRowStyle = css({ display: "flex", flexDirection: "column", gap: "2" });
const reasonButtonStyle = css({
  px: "3",
  py: "2.5",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  textStyle: "label",
  color: "text",
  cursor: "pointer",
  textAlign: "left",
});
const reasonSelectedStyle = css({ bg: "primary.subtle", borderColor: "primary.border" });
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
const doneStyle = css({
  bg: "success.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "success.border",
  rounded: "field",
  p: "3",
  textStyle: "caption",
  color: "success.text",
});
const sectionTitleStyle = css({ textStyle: "subtitle", color: "text" });

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

type ReportTarget = { type: "POST" | "COMMENT"; id: string; label: string };

export function PostDetailView({ initialPost }: { initialPost: PostDetailDto }) {
  const router = useRouter();
  const { track } = useTrack();
  const [post, setPost] = useState(initialPost);
  const [commentBody, setCommentBody] = useState("");
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [reasonDetail, setReasonDetail] = useState("");
  const [reportDone, setReportDone] = useState<string | null>(null);

  const setLike = useSetPostLike(post.id);
  const createComment = useCreateComment(post.id);
  const deleteComment = useDeleteComment();
  const deletePost = useDeletePost(post.id);
  const createReport = useCreateReport();

  useEffect(() => {
    track(TRACK_EVENTS.COMMUNITY_POST_VIEW, {
      postId: initialPost.id,
      regionCode: initialPost.regionCode,
      moderation: initialPost.moderation,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPost.id]);

  const author = PROFILE_TYPE_META[post.author.type];

  async function toggleLike() {
    const next = !post.liked;
    const result = await setLike.mutateAsync(next);
    setPost((current) => ({ ...current, liked: result.liked, likeCount: result.likeCount }));
    track(TRACK_EVENTS.COMMUNITY_LIKE_TOGGLE, {
      postId: post.id,
      liked: result.liked,
      likeCount: result.likeCount,
    });
  }

  async function submitComment() {
    const trimmed = commentBody.trim();
    if (trimmed.length === 0) return;
    const result = await createComment.mutateAsync({ body: trimmed });
    setPost(result.post);
    setCommentBody("");
    track(TRACK_EVENTS.COMMUNITY_COMMENT_CREATE, { postId: post.id });
  }

  async function removeComment(comment: PostCommentDto) {
    const result = await deleteComment.mutateAsync(comment.id);
    setPost(result.post);
  }

  async function removePost() {
    await deletePost.mutateAsync();
    router.push("/community");
  }

  function openReport(target: ReportTarget) {
    setReportTarget(target);
    setReason(REPORT_REASONS[0]);
    setReasonDetail("");
    createReport.reset();
  }

  async function submitReport() {
    if (!reportTarget) return;
    const detail = reasonDetail.trim();
    const finalReason = detail ? `${reason} — ${detail}` : reason;
    const result = await createReport.mutateAsync({
      targetType: reportTarget.type,
      targetId: reportTarget.id,
      reason: finalReason,
    });
    track(TRACK_EVENTS.COMMUNITY_REPORT_SUBMIT, {
      targetType: reportTarget.type,
      targetId: reportTarget.id,
      duplicated: result.duplicated,
    });
    setReportTarget(null);
    setReportDone(
      result.duplicated
        ? "이미 접수된 신고입니다. 관리자가 확인 중입니다."
        : "신고가 접수되었습니다. 관리자가 확인합니다.",
    );
  }

  return (
    <main className={pageStyle}>
      <Link href="/community" className={backLinkStyle}>
        ← 커뮤니티
      </Link>

      <Card padding="md">
        <div className={rowStyle}>
          <Badge tone={author.tone}>{author.label}</Badge>
          <span className={captionStyle}>{post.author.name}</span>
          <span className={captionStyle}>{post.regionName}</span>
          {post.moderation === "BLINDED" ? (
            <Badge tone="danger" data-testid="community-post-blinded">
              블라인드
            </Badge>
          ) : null}
        </div>

        <h1 className={titleStyle} data-testid="community-detail-title">
          {post.title}
        </h1>

        {post.bodyHidden ? (
          <p className={noticeStyle} data-testid="community-detail-blind-notice">
            {post.body}
          </p>
        ) : (
          <p
            className={cx(bodyStyle, post.moderation === "BLINDED" && mutedBodyStyle)}
            data-testid="community-detail-body"
          >
            {post.body}
          </p>
        )}

        {post.moderation === "BLINDED" && !post.bodyHidden ? (
          <p className={noticeStyle}>
            신고로 가려진 글입니다. 원문은 작성자와 관리자에게만 보입니다.
          </p>
        ) : null}

        <div className={cx(rowStyle, css({ mt: "3" }))}>
          <span className={captionStyle}>{formatMoment(post.createdAt)}</span>
          <span className={captionStyle} aria-hidden>
            ·
          </span>
          <span className={captionStyle}>조회 {post.viewCount}</span>
          <span className={captionStyle} aria-hidden>
            ·
          </span>
          <span className={captionStyle}>댓글 {post.commentCount}</span>
        </div>

        <div className={actionRowStyle}>
          <Button
            variant={post.liked ? "primary" : "secondary"}
            size="sm"
            disabled={!post.canInteract}
            loading={setLike.isPending}
            onClick={() => void toggleLike()}
            data-testid="community-like-button"
            data-liked={post.liked ? "true" : "false"}
          >
            좋아요 {post.likeCount}
          </Button>

          {post.mine ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={!post.canEdit}
              loading={deletePost.isPending}
              onClick={() => void removePost()}
              data-testid="community-delete-post"
            >
              삭제
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={!post.canInteract}
              onClick={() => openReport({ type: "POST", id: post.id, label: post.title })}
              data-testid="community-report-post"
            >
              신고
            </Button>
          )}
        </div>

        {setLike.error || deletePost.error ? (
          <p className={errorStyle} role="alert">
            {errorMessage(setLike.error ?? deletePost.error)}
          </p>
        ) : null}
      </Card>

      {reportDone ? (
        <p className={doneStyle} role="status" data-testid="community-report-done">
          {reportDone}
        </p>
      ) : null}

      <section className={css({ display: "flex", flexDirection: "column", gap: "3" })}>
        <h2 className={sectionTitleStyle}>댓글 {post.commentCount}</h2>

        <div className={commentListStyle} data-testid="community-comment-list">
          {post.comments.length === 0 ? (
            <p className={captionStyle}>첫 댓글을 남겨 보세요.</p>
          ) : (
            post.comments.map((comment) => {
              const meta = PROFILE_TYPE_META[comment.author.type];
              return (
                <div
                  key={comment.id}
                  className={commentStyle}
                  data-testid="community-comment"
                  data-comment-id={comment.id}
                >
                  <div className={rowStyle}>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <span className={captionStyle}>{comment.author.name}</span>
                    <span className={captionStyle}>{formatMoment(comment.createdAt)}</span>
                    {comment.moderation === "BLINDED" ? <Badge tone="danger">블라인드</Badge> : null}
                  </div>
                  <p className={cx(commentBodyStyle, comment.bodyHidden && mutedBodyStyle)}>
                    {comment.body}
                  </p>
                  <div className={smallButtonRowStyle}>
                    {comment.canDelete ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void removeComment(comment)}
                        data-testid="community-comment-delete"
                      >
                        삭제
                      </Button>
                    ) : null}
                    {!comment.mine && comment.moderation === "VISIBLE" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          openReport({ type: "COMMENT", id: comment.id, label: comment.body })
                        }
                        data-testid="community-report-comment"
                      >
                        신고
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {post.canInteract ? (
          <div className={css({ display: "flex", flexDirection: "column", gap: "2" })}>
            <textarea
              className={textareaStyle}
              value={commentBody}
              maxLength={500}
              placeholder="이웃에게 답을 남겨 주세요."
              onChange={(event) => setCommentBody(event.target.value)}
              data-testid="community-comment-input"
            />
            <Button
              fullWidth
              loading={createComment.isPending}
              disabled={commentBody.trim().length === 0}
              onClick={() => void submitComment()}
              data-testid="community-comment-submit"
            >
              댓글 남기기
            </Button>
            {createComment.error ? (
              <p className={errorStyle} role="alert">
                {errorMessage(createComment.error)}
              </p>
            ) : null}
          </div>
        ) : (
          <p className={captionStyle} data-testid="community-comment-locked">
            블라인드된 글에는 댓글을 남길 수 없습니다.
          </p>
        )}
      </section>

      <Sheet
        open={reportTarget !== null}
        onClose={() => setReportTarget(null)}
        title={reportTarget?.type === "COMMENT" ? "댓글 신고" : "글 신고"}
        description="사유를 골라 주세요. 관리자가 확인 후 블라인드하거나 기각합니다."
        footer={
          <Button
            fullWidth
            loading={createReport.isPending}
            onClick={() => void submitReport()}
            data-testid="community-report-submit"
          >
            신고하기
          </Button>
        }
      >
        <div className={reasonRowStyle}>
          {REPORT_REASONS.map((preset, index) => (
            <button
              key={preset}
              type="button"
              className={cx(reasonButtonStyle, reason === preset && reasonSelectedStyle)}
              aria-pressed={reason === preset}
              onClick={() => setReason(preset)}
              data-testid={`community-report-reason-${index}`}
            >
              {preset}
            </button>
          ))}

          <textarea
            className={textareaStyle}
            value={reasonDetail}
            maxLength={400}
            placeholder="자세한 사유를 적어 주세요 (선택)"
            onChange={(event) => setReasonDetail(event.target.value)}
            data-testid="community-report-detail"
          />

          {createReport.error ? (
            <p className={errorStyle} role="alert">
              {errorMessage(createReport.error)}
            </p>
          ) : null}
        </div>
      </Sheet>
    </main>
  );
}
