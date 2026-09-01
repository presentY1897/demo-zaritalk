"use client";

/**
 * 건물 등록·수정 폼 (T1.1).
 *
 * 주소는 **문자열 + 위경도 수동 입력 + 지역 프리셋**으로 받는다 — 카카오맵 키가 아직 없어
 * 주소→좌표 지오코딩을 할 수 없다. 프리셋은 T0.4 가 만든 `features/profiles/constants.ts` 의
 * `AREA_PRESETS` 를 그대로 재사용한다.
 * **T3.x(매물 지도)에서 카카오 로컬 API 주소 검색이 들어오면 위경도 입력칸과 프리셋을 함께 걷어낸다.**
 */
import { Button, Input } from "@zari/ui";
import { useState } from "react";
import { css, cx } from "styled-system/css";
import { AREA_PRESETS } from "@/features/profiles/constants";
import type { CreateBuildingInput } from "./schema";
import type { BuildingSummaryDto } from "./types";

const formStyle = css({ display: "flex", flexDirection: "column", gap: "field" });
const chipRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "2" });
const chipStyle = css({
  px: "3",
  py: "2",
  rounded: "pill",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  textStyle: "label",
  color: "text",
  cursor: "pointer",
  minH: "9",
});
const chipSelectedStyle = css({
  bg: "primary.subtle",
  borderColor: "primary.border",
  fontWeight: "600",
});
const twoColStyle = css({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2" });
const noteStyle = css({
  bg: "info.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "info.border",
  rounded: "field",
  p: "3",
  textStyle: "caption",
  color: "info.text",
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

export type BuildingFormProps = {
  mode: "create" | "edit";
  /** 수정 모드의 초기값 */
  defaultValue?: BuildingSummaryDto;
  pending?: boolean;
  errorMessage?: string;
  onSubmit: (input: CreateBuildingInput) => void;
};

export function BuildingForm({
  mode,
  defaultValue,
  pending = false,
  errorMessage,
  onSubmit,
}: BuildingFormProps) {
  const [name, setName] = useState(defaultValue?.name ?? "");
  const [address, setAddress] = useState(defaultValue?.address ?? "");
  const [lat, setLat] = useState(defaultValue ? String(defaultValue.lat) : "");
  const [lng, setLng] = useState(defaultValue ? String(defaultValue.lng) : "");
  const [note, setNote] = useState(defaultValue?.note ?? "");

  const canSubmit =
    name.trim().length > 0 &&
    address.trim().length > 1 &&
    Number.isFinite(Number(lat)) &&
    lat.trim() !== "" &&
    Number.isFinite(Number(lng)) &&
    lng.trim() !== "";

  function applyPreset(preset: (typeof AREA_PRESETS)[number]) {
    setAddress(preset.address);
    setLat(String(preset.lat));
    setLng(String(preset.lng));
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({
      name: name.trim(),
      address: address.trim(),
      lat: Number(lat),
      lng: Number(lng),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
  }

  return (
    <div className={formStyle}>
      <Input
        label="건물 이름"
        required
        placeholder="행당해피빌"
        value={name}
        onChange={(event) => setName(event.target.value)}
        data-testid="building-name"
      />

      <p className={noteStyle}>
        지도 연동(카카오맵) 전이라 주소와 좌표를 직접 받습니다. 아래 지역을 누르면 주소·좌표가
        채워집니다.
      </p>
      <div className={chipRowStyle}>
        {AREA_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={cx(chipStyle, address === preset.address && chipSelectedStyle)}
            onClick={() => applyPreset(preset)}
            data-testid={`building-area-preset-${preset.label}`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <Input
        label="주소"
        required
        placeholder="서울 성동구 행당로 79"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        data-testid="building-address"
      />
      <div className={twoColStyle}>
        <Input
          label="위도"
          required
          inputMode="decimal"
          placeholder="37.56152"
          value={lat}
          onChange={(event) => setLat(event.target.value)}
          data-testid="building-lat"
        />
        <Input
          label="경도"
          required
          inputMode="decimal"
          placeholder="127.03648"
          value={lng}
          onChange={(event) => setLng(event.target.value)}
          data-testid="building-lng"
        />
      </div>
      <Input
        label="메모"
        placeholder="선택 입력 — 엘리베이터 없음 등"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        data-testid="building-note"
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
        disabled={!canSubmit || pending}
        loading={pending}
        data-testid="building-submit"
      >
        {mode === "create" ? "건물 등록" : "저장"}
      </Button>
    </div>
  );
}
