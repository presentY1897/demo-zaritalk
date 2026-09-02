"use client";

/**
 * 건물 등록·수정 폼 (T1.1 → **T3.1 에서 주소 검색으로 교체**).
 *
 * 원래는 주소 문자열 + 위경도 수동 입력 + 지역 프리셋(`AREA_PRESETS`)이었다. 카카오 키를 받은
 * 뒤 공용 주소 검색(`features/address/AddressSearchField`)으로 갈아 끼웠다 —
 * **위경도 입력칸과 지역 프리셋은 사라졌고**, 좌표는 검색 결과에서만 들어온다.
 * 도로명 주소(`roadAddress`)도 이제 검색 결과에서 자동으로 채워진다.
 */
import { Button, Input } from "@zari/ui";
import { useState } from "react";
import { css } from "styled-system/css";
import { AddressSearchField } from "@/features/address/AddressSearchField";
import type { AddressSelection } from "@/features/address/types";
import type { CreateBuildingInput } from "./schema";
import type { BuildingSummaryDto } from "./types";

const formStyle = css({ display: "flex", flexDirection: "column", gap: "field" });
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
  const [address, setAddress] = useState<AddressSelection | null>(
    defaultValue
      ? {
          address: defaultValue.address,
          roadAddress: defaultValue.roadAddress,
          lat: defaultValue.lat,
          lng: defaultValue.lng,
        }
      : null,
  );
  const [note, setNote] = useState(defaultValue?.note ?? "");

  const canSubmit = name.trim().length > 0 && address !== null;

  function handleSubmit() {
    if (!canSubmit || !address) return;
    onSubmit({
      name: name.trim(),
      address: address.address,
      ...(address.roadAddress ? { roadAddress: address.roadAddress } : {}),
      lat: address.lat,
      lng: address.lng,
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

      <AddressSearchField
        label="주소"
        required
        value={address}
        onChange={setAddress}
        placeholder="도로명·지번·건물명 (예: 행당로 79)"
        testId="building-address"
      />
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
