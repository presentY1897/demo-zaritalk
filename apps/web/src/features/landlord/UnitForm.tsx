"use client";

/**
 * 호실 추가·수정 폼 (T1.1).
 * 라벨은 건물 안에서 유일해야 한다(`@@unique([buildingId, label])`) — 중복이면 서버가 409 를
 * 돌려주고 그 문구를 그대로 보여 준다.
 */
import { Button, Input } from "@zari/ui";
import { useState } from "react";
import { css } from "styled-system/css";
import type { CreateUnitInput } from "./schema";
import type { UnitSummaryDto } from "./types";

const formStyle = css({ display: "flex", flexDirection: "column", gap: "field" });
const threeColStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "2",
});
const errorBoxStyle = css({
  bg: "danger.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "danger.border",
  rounded: "field",
  p: "3",
  textStyle: "caption",
  color: "danger.text",
});
const dangerZoneStyle = css({
  mt: "2",
  pt: "3",
  borderTopWidth: "hairline",
  borderTopStyle: "solid",
  borderTopColor: "border",
  display: "flex",
  flexDirection: "column",
  gap: "2",
});
const hintStyle = css({ textStyle: "caption", color: "text.muted" });

export type UnitFormProps = {
  mode: "create" | "edit";
  defaultValue?: UnitSummaryDto;
  pending?: boolean;
  errorMessage?: string;
  onSubmit: (input: CreateUnitInput) => void;
  /** 수정 모드에서만 — 삭제 버튼을 그린다 */
  onDelete?: () => void;
  deletePending?: boolean;
};

/** 빈 문자열이면 null(값 비움), 숫자로 못 읽으면 undefined(변경 없음) */
function toNumberOrNull(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function UnitForm({
  mode,
  defaultValue,
  pending = false,
  errorMessage,
  onSubmit,
  onDelete,
  deletePending = false,
}: UnitFormProps) {
  const [label, setLabel] = useState(defaultValue?.label ?? "");
  const [floor, setFloor] = useState(defaultValue?.floor != null ? String(defaultValue.floor) : "");
  const [areaM2, setAreaM2] = useState(
    defaultValue?.areaM2 != null ? String(defaultValue.areaM2) : "",
  );
  const [rooms, setRooms] = useState(defaultValue?.rooms != null ? String(defaultValue.rooms) : "");
  const [note, setNote] = useState(defaultValue?.note ?? "");

  const canSubmit = label.trim().length > 0 && !pending;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({
      label: label.trim(),
      floor: toNumberOrNull(floor),
      areaM2: toNumberOrNull(areaM2),
      rooms: toNumberOrNull(rooms),
      note: note.trim() === "" ? null : note.trim(),
    });
  }

  return (
    <div className={formStyle}>
      <Input
        label="호실 이름"
        required
        placeholder="301호"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        helper="같은 건물 안에서 겹칠 수 없습니다"
        data-testid="unit-label"
      />
      <div className={threeColStyle}>
        <Input
          label="층"
          inputMode="numeric"
          placeholder="3"
          value={floor}
          onChange={(event) => setFloor(event.target.value)}
          data-testid="unit-floor"
        />
        <Input
          label="면적(㎡)"
          inputMode="decimal"
          placeholder="23.1"
          value={areaM2}
          onChange={(event) => setAreaM2(event.target.value)}
          data-testid="unit-area"
        />
        <Input
          label="방 수"
          inputMode="numeric"
          placeholder="1"
          value={rooms}
          onChange={(event) => setRooms(event.target.value)}
          data-testid="unit-rooms"
        />
      </div>
      <Input
        label="메모"
        placeholder="선택 입력 — 풀옵션 등"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        data-testid="unit-note"
      />

      {errorMessage ? (
        <p className={errorBoxStyle} role="alert">
          {errorMessage}
        </p>
      ) : null}

      <Button
        fullWidth
        size="lg"
        onClick={handleSubmit}
        disabled={!canSubmit}
        loading={pending}
        data-testid="unit-submit"
      >
        {mode === "create" ? "호실 추가" : "저장"}
      </Button>

      {mode === "edit" && onDelete ? (
        <div className={dangerZoneStyle}>
          <p className={hintStyle}>
            계약·매물·중개 요청이 걸린 호실은 삭제할 수 없습니다(이력 보존).
          </p>
          <Button
            variant="danger"
            fullWidth
            onClick={onDelete}
            loading={deletePending}
            disabled={deletePending}
            data-testid="unit-delete"
          >
            호실 삭제
          </Button>
        </div>
      ) : null}
    </div>
  );
}
