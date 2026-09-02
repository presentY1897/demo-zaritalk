"use client";

/**
 * 서류 업로드 슬롯 (T2.4) — 신청서와 보완 화면이 **같은 컴포넌트**를 쓴다.
 *
 * 제한(타입·크기·장수)은 `documents.ts` 한 곳에서 오고, 화면은 **올리기 전에 먼저 걸러** 준다
 * (`validateUploadFile`) — 서버가 같은 규칙으로 한 번 더 막으므로 화면 검증은 편의일 뿐이다.
 *
 * 색은 전부 semantic 토큰이다(하드코딩 색상 0, T0.6).
 */
import { Badge, Button, useTrack } from "@zari/ui";
import { useRef, useState } from "react";
import { css } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import {
  REFUND_SLOTS,
  REFUND_SLOT_META,
  UPLOAD_ACCEPT,
  UPLOAD_LIMIT_HINT,
  validateUploadFile,
  type RefundDocumentSlot,
} from "./documents";
import { useUploadRefundDocument } from "./hooks";
import type { RefundApplicationDto, RefundUploadResult } from "./types";

const wrapStyle = css({ display: "flex", flexDirection: "column", gap: "3" });
const slotStyle = css({
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  rounded: "card",
  p: "3",
  display: "flex",
  flexDirection: "column",
  gap: "2",
});
const slotHeadStyle = css({ display: "flex", alignItems: "center", gap: "2" });
const slotTitleStyle = css({ textStyle: "bodyStrong", color: "text" });
const slotDescStyle = css({ textStyle: "caption", color: "text.muted" });
const fileRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  py: "1.5",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  _last: { borderBottomWidth: "0" },
});
const fileNameStyle = css({
  textStyle: "caption",
  color: "text.brand",
  textDecoration: "underline",
  wordBreak: "break-all",
});
const fileMetaStyle = css({ textStyle: "caption", color: "text.muted", fontFamily: "numeric" });
const hintStyle = css({ textStyle: "caption", color: "text.muted" });
const errorStyle = css({ textStyle: "caption", color: "danger.text" });
const hiddenInputStyle = css({
  position: "absolute",
  w: "1px",
  h: "1px",
  p: "0",
  m: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  borderWidth: "0",
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function DocumentUploader({
  application,
  onUploaded,
  disabled = false,
}: {
  application: RefundApplicationDto;
  onUploaded: (result: RefundUploadResult) => void;
  disabled?: boolean;
}) {
  const { track } = useTrack();
  const upload = useUploadRefundDocument();
  const [error, setError] = useState<string | null>(null);
  const [busySlot, setBusySlot] = useState<RefundDocumentSlot | null>(null);
  const inputs = useRef<Partial<Record<RefundDocumentSlot, HTMLInputElement | null>>>({});

  async function handleFile(slot: RefundDocumentSlot, file: File) {
    setError(null);

    // 서버와 같은 규칙으로 먼저 거른다 — 4MB 파일을 올려 보고 나서 거부당하지 않게
    const checked = validateUploadFile({ name: file.name, size: file.size, type: file.type });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }

    setBusySlot(slot);
    try {
      const result = await upload.mutateAsync({ applicationId: application.id, slot, file });
      track(TRACK_EVENTS.REFUND_DOC_UPLOAD, {
        applicationId: application.id,
        slot,
        size: file.size,
        stage: result.document.stage,
      });
      onUploaded(result);
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "서류를 올리지 못했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setBusySlot(null);
      const input = inputs.current[slot];
      if (input) input.value = "";
    }
  }

  return (
    <div className={wrapStyle} data-testid="refund-doc-uploader">
      {REFUND_SLOTS.map((slot) => {
        const meta = REFUND_SLOT_META[slot];
        const files = application.documents.filter((doc) => doc.slot === slot);
        const inputId = `refund-doc-input-${slot}`;

        return (
          <div key={slot} className={slotStyle} data-testid={`refund-doc-slot-${slot}`}>
            <div className={slotHeadStyle}>
              <span className={slotTitleStyle}>{meta.label}</span>
              {meta.required ? (
                <Badge tone="danger" size="sm">
                  필수
                </Badge>
              ) : (
                <Badge tone="neutral" size="sm">
                  선택
                </Badge>
              )}
              {files.length > 0 ? (
                <Badge tone="success" size="sm">
                  {files.length}장
                </Badge>
              ) : null}
            </div>
            <p className={slotDescStyle}>{meta.description}</p>

            {files.length > 0 ? (
              <div>
                {files.map((doc) => (
                  <div key={doc.id} className={fileRowStyle}>
                    <a
                      className={fileNameStyle}
                      href={doc.viewHref}
                      target="_blank"
                      rel="noreferrer"
                      data-testid={`refund-doc-link-${doc.id}`}
                    >
                      {doc.name}
                    </a>
                    <span className={fileMetaStyle}>
                      {formatSize(doc.size)}
                      {doc.stage === "SUPPLEMENT" ? " · 보완" : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            <input
              id={inputId}
              ref={(node) => {
                inputs.current[slot] = node;
              }}
              className={hiddenInputStyle}
              type="file"
              accept={UPLOAD_ACCEPT}
              data-testid={inputId}
              disabled={disabled}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void handleFile(slot, file);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              loading={busySlot === slot}
              data-testid={`refund-doc-pick-${slot}`}
              onClick={() => inputs.current[slot]?.click()}
            >
              파일 선택
            </Button>
          </div>
        );
      })}

      <p className={hintStyle}>{UPLOAD_LIMIT_HINT}</p>
      {error ? (
        <p className={errorStyle} role="alert" data-testid="refund-doc-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
