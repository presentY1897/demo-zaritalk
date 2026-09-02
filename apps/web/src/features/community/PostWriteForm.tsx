"use client";

/**
 * `/community/write` 글 작성 (T4.1) — 지역·제목·본문.
 *
 * 검증은 서버와 **같은 zod 스키마**(`features/community/schema.ts`)로 미리 막는다 —
 * 화면과 API 의 규칙이 갈라질 자리가 없다. 작성에 성공하면 방금 쓴 글 상세로 이동한다.
 */
import { Button, Card, Input, useTrack } from "@zari/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { css } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { useCreatePost } from "./hooks";
import { createPostSchema } from "./schema";
import type { RegionOptionDto } from "./types";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const titleStyle = css({ textStyle: "headline", color: "text" });
const captionStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });
const formStyle = css({ display: "flex", flexDirection: "column", gap: "field" });
const labelStyle = css({ textStyle: "label", color: "text", mb: "1.5" });
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
const textareaStyle = css({
  w: "full",
  minH: "180px",
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
const backLinkStyle = css({ textStyle: "caption", color: "text.brand" });

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

export function PostWriteForm({
  regions,
  defaultRegionCode,
}: {
  regions: RegionOptionDto[];
  defaultRegionCode: string;
}) {
  const router = useRouter();
  const { track } = useTrack();
  const createPost = useCreatePost();

  const [regionCode, setRegionCode] = useState(defaultRegionCode);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const parsed = createPostSchema.safeParse({ regionCode, title, body });

  async function submit() {
    if (!parsed.success) return;
    const post = await createPost.mutateAsync(parsed.data);
    track(TRACK_EVENTS.COMMUNITY_POST_CREATE, {
      postId: post.id,
      regionCode: post.regionCode,
      profileType: post.author.type,
    });
    router.push(`/community/${post.id}`);
  }

  return (
    <main className={pageStyle}>
      <div>
        <h1 className={titleStyle}>글쓰기</h1>
        <p className={captionStyle}>같은 지역 이웃에게만 보입니다.</p>
      </div>

      <Card padding="md">
        <div className={formStyle}>
          <div>
            <p className={labelStyle}>지역</p>
            <select
              className={selectStyle}
              aria-label="지역 선택"
              value={regionCode}
              onChange={(event) => setRegionCode(event.target.value)}
              data-testid="community-write-region"
            >
              {regions.map((region) => (
                <option key={region.code} value={region.code}>
                  {region.label}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="제목"
            required
            value={title}
            maxLength={60}
            placeholder="예) 관리비가 갑자기 올랐어요"
            onChange={(event) => setTitle(event.target.value)}
            data-testid="community-write-title"
          />

          <div>
            <p className={labelStyle}>내용</p>
            <textarea
              className={textareaStyle}
              value={body}
              maxLength={2000}
              placeholder="이웃들에게 묻고 싶은 이야기를 적어 주세요."
              onChange={(event) => setBody(event.target.value)}
              data-testid="community-write-body"
            />
          </div>

          {createPost.error ? (
            <p className={errorStyle} role="alert">
              {errorMessage(createPost.error)}
            </p>
          ) : null}

          <Button
            fullWidth
            loading={createPost.isPending}
            disabled={!parsed.success}
            onClick={() => void submit()}
            data-testid="community-write-submit"
          >
            올리기
          </Button>
        </div>
      </Card>

      <Link href="/community" className={backLinkStyle}>
        ← 커뮤니티로 돌아가기
      </Link>
    </main>
  );
}
