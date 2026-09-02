"use client";

/**
 * `/tenant/complaints` 세입자 민원 화면 (T2.6) — 접수 + 내 민원 목록.
 *
 * 첫 데이터는 서버 컴포넌트가 넘겨주고, 접수 후에는 Tanstack Query 무효화로 다시 읽는다
 * (T1.1 `BuildingListView` 와 같은 흐름). 접수 시트는 계약을 고른 뒤 제목·내용만 받는다 —
 * **사진 첨부는 T2.4(D3 Vercel Blob 업로드)가 붙은 뒤에 연다.**
 */
import { Badge, Button, Card, CardHeader, Input, Sheet, useTrack } from "@zari/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { css, cx } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { useCreateComplaint } from "./hooks";
import { COMPLAINT_STATUS_META } from "./status";
import type { ComplaintLeaseOptionDto, ComplaintSummaryDto } from "./types";

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
const captionStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });
const listStyle = css({ display: "flex", flexDirection: "column", gap: "3" });
const cardLinkStyle = css({ textDecoration: "none", color: "inherit", display: "block" });
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
const formStyle = css({ display: "flex", flexDirection: "column", gap: "field" });
const labelStyle = css({ textStyle: "label", color: "text", mb: "1.5" });
const textareaStyle = css({
  w: "full",
  minH: "112px",
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
const leaseRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "2" });
const leaseButtonStyle = css({
  px: "3",
  py: "2",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  textStyle: "label",
  color: "text",
  cursor: "pointer",
});
const leaseSelectedStyle = css({
  bg: "primary.subtle",
  borderColor: "primary.border",
});
const photoSlotStyle = css({
  p: "4",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "dashed",
  borderColor: "border",
  textAlign: "center",
  textStyle: "caption",
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
const metaRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  mt: "2",
  textStyle: "caption",
  color: "text.muted",
});

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

function formatMoment(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function TenantComplaintListView({
  initialComplaints,
  leases,
}: {
  initialComplaints: ComplaintSummaryDto[];
  leases: ComplaintLeaseOptionDto[];
}) {
  const router = useRouter();
  const { track } = useTrack();
  const createComplaint = useCreateComplaint();

  const [complaints, setComplaints] = useState(initialComplaints);
  const [open, setOpen] = useState(false);
  const [leaseId, setLeaseId] = useState(leases[0]?.leaseId ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const canSubmit = leaseId !== "" && title.trim().length >= 2 && body.trim().length >= 5;

  function closeSheet() {
    setOpen(false);
    createComplaint.reset();
  }

  async function submit() {
    if (!canSubmit || createComplaint.isPending) return;
    try {
      const created = await createComplaint.mutateAsync({
        leaseId,
        title: title.trim(),
        body: body.trim(),
      });
      track(TRACK_EVENTS.COMPLAINT_CREATE_COMPLETE, {
        complaintId: created.id,
        leaseId: created.leaseId,
      });
      setComplaints((previous) => [created, ...previous]);
      setTitle("");
      setBody("");
      closeSheet();
      // 서버 컴포넌트가 그린 목록도 맞춰 둔다(뒤로 갔다 와도 같은 화면)
      router.refresh();
    } catch {
      /* 실패 문구는 errorMessage 로 시트 안에 표시된다 */
    }
  }

  return (
    <main className={pageStyle}>
      <div className={headerStyle}>
        <div>
          <h1 className={titleStyle}>민원</h1>
          <p className={captionStyle}>
            {complaints.length > 0
              ? `접수한 민원 ${complaints.length}건`
              : "누수·보일러 같은 문제를 임대인에게 접수하세요."}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setOpen(true)}
          disabled={leases.length === 0}
          data-testid="complaint-new"
        >
          민원 접수
        </Button>
      </div>

      {leases.length === 0 ? (
        <p className={emptyStyle} data-testid="complaint-no-lease">
          연결된 계약이 없어 민원을 접수할 수 없습니다.
          <br />
          임대인이 등록한 계약을 먼저 수락해 주세요.
        </p>
      ) : null}

      {complaints.length === 0 ? (
        <p className={emptyStyle} data-testid="complaint-empty">
          아직 접수한 민원이 없습니다.
        </p>
      ) : (
        <div className={listStyle}>
          {complaints.map((complaint) => {
            const meta = COMPLAINT_STATUS_META[complaint.status];
            return (
              <Link
                key={complaint.id}
                href={`/tenant/complaints/${complaint.id}`}
                className={cardLinkStyle}
                data-testid="complaint-card"
                data-complaint-status={complaint.status}
              >
                <Card padding="md" interactive>
                  <CardHeader
                    title={complaint.title}
                    aside={<Badge tone={meta.tone}>{meta.label}</Badge>}
                  />
                  <p className={metaRowStyle}>
                    {complaint.unit.buildingName} {complaint.unit.label} · 대화{" "}
                    {complaint.messageCount} · {formatMoment(complaint.lastMessageAt)}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Sheet
        open={open}
        onClose={closeSheet}
        title="민원 접수"
        description="문제를 적어 보내면 임대인이 확인하고 답변합니다."
        footer={
          <Button
            fullWidth
            loading={createComplaint.isPending}
            disabled={!canSubmit}
            onClick={submit}
            data-testid="complaint-submit"
          >
            접수하기
          </Button>
        }
      >
        <div className={formStyle}>
          {leases.length > 1 ? (
            <div>
              <p className={labelStyle}>대상 계약</p>
              <div className={leaseRowStyle}>
                {leases.map((lease) => (
                  <button
                    key={lease.leaseId}
                    type="button"
                    className={cx(
                      leaseButtonStyle,
                      leaseId === lease.leaseId && leaseSelectedStyle,
                    )}
                    aria-pressed={leaseId === lease.leaseId}
                    onClick={() => setLeaseId(lease.leaseId)}
                    data-testid={`complaint-lease-${lease.leaseId}`}
                  >
                    {lease.buildingName} {lease.unitLabel}
                  </button>
                ))}
              </div>
            </div>
          ) : leases[0] ? (
            <p className={captionStyle} data-testid="complaint-lease-fixed">
              대상 · {leases[0].buildingName} {leases[0].unitLabel} (임대인 {leases[0].landlordName})
            </p>
          ) : null}

          <Input
            label="제목"
            required
            value={title}
            maxLength={60}
            placeholder="예) 온수가 나오지 않습니다"
            onChange={(event) => setTitle(event.target.value)}
            data-testid="complaint-title"
          />

          <div>
            <p className={labelStyle}>내용</p>
            <textarea
              className={textareaStyle}
              value={body}
              maxLength={1000}
              placeholder="언제부터, 어디가 어떻게 문제인지 적어 주세요."
              onChange={(event) => setBody(event.target.value)}
              data-testid="complaint-body"
            />
          </div>

          {/* 사진 슬롯 — 업로드 엔드포인트(D3 Vercel Blob)는 T2.4 소유라 아직 비어 있다.
              T2.4 가 업로드 URL을 돌려주기 시작하면 여기서 고른 URL 배열을
              `createComplaint({ …, photos })` 로 실어 보내면 된다(서버·스키마는 이미 받는다). */}
          <div className={photoSlotStyle} data-testid="complaint-photo-slot">
            사진 첨부는 곧 제공됩니다 (T2.4 업로드 연결).
          </div>

          {createComplaint.error ? (
            <p className={errorStyle} role="alert">
              {errorMessage(createComplaint.error)}
            </p>
          ) : null}
        </div>
      </Sheet>
    </main>
  );
}
