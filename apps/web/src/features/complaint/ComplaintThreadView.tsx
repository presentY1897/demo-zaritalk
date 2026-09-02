"use client";

/**
 * 민원 스레드 (T2.6) — `/tenant/complaints/[id]` 와 `/landlord/complaints/[id]` 가 **같은 화면**을 쓴다.
 *
 * 두 사람이 보는 것이 같은 대화라 화면을 둘로 나눌 이유가 없다. `viewer` 로 갈리는 것은 셋뿐이다:
 * 말풍선 정렬(내 글이 오른쪽) · 상태 변경 버튼(임대인만) · 목록으로 돌아가는 경로.
 *
 * 상태는 서버 컴포넌트가 내려준 값에서 시작해 **답장·상태 변경 응답에 실려 온 갱신본**으로
 * 갱신한다(`features/complaint/hooks.ts` 주석 참고). 임대인 홈 배지는 서버가 그린 값이라
 * 상태를 바꾸면 `router.refresh()` 로 다음 진입에 반영되게 한다.
 *
 * ## 아직 열지 않은 자리
 * - **사진 첨부** — 업로드 엔드포인트(D3 Vercel Blob)가 T2.4 소유라 지금은 슬롯만 있다.
 *   `complaint.photos` 가 비어 있지 않으면 그대로 그린다(서버는 이미 받을 준비가 돼 있다).
 * - **「작업 의뢰로 전환」** — [T5.1](../../../../docs/tasks/t5.1-workorder.md)이 여는 버튼이라
 *   지금은 비활성 + 안내다. `complaint.workOrderId` 가 채워지면 그 의뢰로 링크하면 된다.
 */
import { Badge, Button, Card, CardHeader, useTrack } from "@zari/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { css, cx } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { useSendComplaintMessage, useUpdateComplaintStatus } from "./hooks";
import {
  canTransition,
  COMPLAINT_STATUS_META,
  COMPLAINT_STATUS_TARGETS,
  transitionRejectReason,
} from "./status";
import type { ComplaintDetailDto, ComplaintMessageDto, ComplaintParty } from "./types";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const backStyle = css({
  textStyle: "caption",
  color: "text.brand",
  textDecoration: "none",
  alignSelf: "flex-start",
});
const headerStyle = css({ display: "flex", flexDirection: "column", gap: "1" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const captionStyle = css({ textStyle: "caption", color: "text.muted" });
const metaRowStyle = css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap" });
const threadStyle = css({ display: "flex", flexDirection: "column", gap: "3" });
const bubbleRowStyle = css({ display: "flex", flexDirection: "column", gap: "1" });
const bubbleRowMineStyle = css({ alignItems: "flex-end" });
const bubbleRowTheirsStyle = css({ alignItems: "flex-start" });
const bubbleStyle = css({
  maxW: "82%",
  px: "3.5",
  py: "2.5",
  rounded: "card",
  textStyle: "body",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});
const bubbleMineStyle = css({ bg: "primary.subtle", color: "text" });
const bubbleTheirsStyle = css({
  bg: "bg.subtle",
  color: "text",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
});
const bubbleMetaStyle = css({ textStyle: "caption", color: "text.muted" });
const openingTagStyle = css({ textStyle: "caption", color: "text.muted" });
const composerStyle = css({ display: "flex", flexDirection: "column", gap: "2" });
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
const statusRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "2", mt: "3" });
const soonStyle = css({ textStyle: "caption", color: "text.muted", mt: "2" });
const rowStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "3",
  py: "1.5",
  textStyle: "caption",
  color: "text.muted",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  _last: { borderBottomWidth: "0" },
});
const rowValueStyle = css({ textStyle: "label", color: "text" });
const photoListStyle = css({ display: "flex", flexWrap: "wrap", gap: "2", mt: "2" });
const photoStyle = css({ w: "88px", h: "88px", objectFit: "cover", rounded: "field" });

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

/** "2026.09.02 14:03" — 스레드는 날짜만으로는 순서를 알 수 없어 분까지 적는다 */
function formatMoment(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function MessageBubble({
  message,
  viewer,
}: {
  message: ComplaintMessageDto;
  viewer: ComplaintParty;
}) {
  const mine = message.authorRole === viewer;
  return (
    <div
      className={cx(bubbleRowStyle, mine ? bubbleRowMineStyle : bubbleRowTheirsStyle)}
      data-testid="complaint-message"
      data-author-role={message.authorRole}
      data-message-kind={message.kind}
    >
      <p className={bubbleMetaStyle}>
        {message.authorName} · {message.authorRole === "LANDLORD" ? "임대인" : "세입자"} ·{" "}
        {formatMoment(message.createdAt)}
      </p>
      <p className={cx(bubbleStyle, mine ? bubbleMineStyle : bubbleTheirsStyle)}>{message.body}</p>
      {message.kind === "OPENING" ? <p className={openingTagStyle}>접수 내용</p> : null}
    </div>
  );
}

export function ComplaintThreadView({
  initialComplaint,
  viewer,
}: {
  initialComplaint: ComplaintDetailDto;
  viewer: ComplaintParty;
}) {
  const router = useRouter();
  const { track } = useTrack();
  const [complaint, setComplaint] = useState(initialComplaint);
  const [draft, setDraft] = useState("");
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const sendMessage = useSendComplaintMessage(complaint.id);
  const changeStatus = useUpdateComplaintStatus(complaint.id);

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track(TRACK_EVENTS.COMPLAINT_THREAD_VIEW, {
      complaintId: complaint.id,
      status: complaint.status,
      role: viewer,
    });
  }, [track, complaint.id, complaint.status, viewer]);

  const meta = COMPLAINT_STATUS_META[complaint.status];
  const listHref = viewer === "LANDLORD" ? "/landlord/complaints" : "/tenant/complaints";

  async function submitMessage() {
    const body = draft.trim();
    if (!body || sendMessage.isPending) return;
    try {
      const result = await sendMessage.mutateAsync({ body });
      setComplaint(result.complaint);
      setDraft("");
      track(TRACK_EVENTS.COMPLAINT_MESSAGE_SEND, { complaintId: complaint.id, role: viewer });
      router.refresh();
    } catch {
      /* 실패 문구는 errorMessage 로 폼 아래에 표시된다 */
    }
  }

  async function submitStatus(next: (typeof COMPLAINT_STATUS_TARGETS)[number]) {
    if (changeStatus.isPending) return;
    setTransitionError(null);
    if (!canTransition(complaint.status, next)) {
      // 화면에서 이미 비활성이지만, 규칙은 한 곳(status.ts)에서만 읽는다
      setTransitionError(transitionRejectReason(complaint.status, next));
      return;
    }
    const from = complaint.status;
    try {
      const updated = await changeStatus.mutateAsync({ status: next });
      setComplaint(updated);
      track(TRACK_EVENTS.COMPLAINT_STATUS_CHANGE, {
        complaintId: complaint.id,
        from,
        to: next,
      });
      // 임대인 홈(T1.9)의 미확인 민원 배지는 서버 컴포넌트가 그린 값이라 새로 읽어야 한다
      router.refresh();
    } catch (error) {
      setTransitionError(errorMessage(error) ?? "상태를 바꾸지 못했습니다.");
    }
  }

  return (
    <main className={pageStyle}>
      <Link href={listHref} className={backStyle} data-testid="complaint-back">
        ← 민원 목록
      </Link>

      <header className={headerStyle}>
        <div className={metaRowStyle}>
          <h1 className={titleStyle}>{complaint.title}</h1>
          <Badge tone={meta.tone} data-testid="complaint-status">
            {meta.label}
          </Badge>
        </div>
        <p className={captionStyle}>
          {complaint.unit.buildingName} {complaint.unit.label} · 접수{" "}
          {formatMoment(complaint.createdAt)}
        </p>
      </header>

      <Card padding="md">
        <CardHeader title="대화" aside={<Badge tone="neutral">{complaint.messageCount}</Badge>} />
        <div className={threadStyle} data-testid="complaint-thread">
          {complaint.messages.map((message) => (
            <MessageBubble key={message.id} message={message} viewer={viewer} />
          ))}
        </div>

        {/* 사진 슬롯 — 업로드는 T2.4(D3 Vercel Blob)가 붙인다. URL 이 있으면 그대로 그린다 */}
        {complaint.photos.length > 0 ? (
          <div className={photoListStyle} data-testid="complaint-photos">
            {complaint.photos.map((photo) => (
              // next/image 를 쓰지 않는다 — 외부 Blob 호스트(T2.4)가 아직 정해지지 않아
              // `images.remotePatterns` 를 적을 수 없다. 도메인이 정해지면 그때 바꾼다.
              <img key={photo} src={photo} alt="민원 첨부 사진" className={photoStyle} />
            ))}
          </div>
        ) : null}

        <div className={cx(composerStyle, css({ mt: "4" }))}>
          <textarea
            className={textareaStyle}
            value={draft}
            maxLength={1000}
            placeholder={
              viewer === "LANDLORD"
                ? "예) 내일 오전에 설비 기사가 방문합니다."
                : "예) 어제 저녁부터 온수가 나오지 않습니다."
            }
            onChange={(event) => setDraft(event.target.value)}
            data-testid="complaint-message-input"
          />
          {sendMessage.error ? (
            <p className={errorStyle} role="alert">
              {errorMessage(sendMessage.error)}
            </p>
          ) : null}
          <Button
            fullWidth
            loading={sendMessage.isPending}
            disabled={draft.trim().length === 0}
            onClick={submitMessage}
            data-testid="complaint-message-submit"
          >
            보내기
          </Button>
        </div>
      </Card>

      {viewer === "LANDLORD" ? (
        <Card padding="md" data-testid="complaint-status-panel">
          <CardHeader title="처리 상태" />
          <p className={captionStyle}>
            접수 → 진행중 → 해결/반려 순으로 바꿉니다. 종결한 민원은 「진행중」으로 다시 열 수
            있습니다.
          </p>
          <div className={statusRowStyle}>
            {COMPLAINT_STATUS_TARGETS.map((target) => (
              <Button
                key={target}
                size="sm"
                variant={target === "REJECTED" ? "ghost" : "secondary"}
                disabled={!canTransition(complaint.status, target) || changeStatus.isPending}
                onClick={() => submitStatus(target)}
                data-testid={`complaint-status-${target}`}
              >
                {COMPLAINT_STATUS_META[target].label}
              </Button>
            ))}
          </div>
          {transitionError ? (
            <p className={cx(errorStyle, css({ mt: "3" }))} role="alert">
              {transitionError}
            </p>
          ) : null}

          {/* T5.1(작업 의뢰) 자리 — 목적지 `/landlord/workorders/[id]` 가 아직 없어 비활성으로 둔다 */}
          <div className={css({ mt: "4" })}>
            <Button variant="secondary" fullWidth disabled data-testid="complaint-workorder-cta">
              작업 의뢰로 전환
            </Button>
            <p className={soonStyle}>
              민원을 협력업체 작업 의뢰로 넘기는 기능은 Phase 5(T5.1)에서 열립니다.
            </p>
          </div>
        </Card>
      ) : null}

      <Card padding="md">
        <CardHeader title="민원 정보" />
        <div className={rowStyle}>
          <span>대상</span>
          <span className={rowValueStyle}>
            {complaint.unit.buildingName} {complaint.unit.label}
          </span>
        </div>
        <div className={rowStyle}>
          <span>주소</span>
          <span className={rowValueStyle}>{complaint.unit.buildingAddress}</span>
        </div>
        <div className={rowStyle}>
          <span>세입자</span>
          <span className={rowValueStyle}>{complaint.tenantName}</span>
        </div>
        <div className={rowStyle}>
          <span>임대인</span>
          <span className={rowValueStyle}>{complaint.landlordName}</span>
        </div>
        <div className={rowStyle}>
          <span>마지막 활동</span>
          <span className={rowValueStyle}>{formatMoment(complaint.lastMessageAt)}</span>
        </div>
      </Card>
    </main>
  );
}
