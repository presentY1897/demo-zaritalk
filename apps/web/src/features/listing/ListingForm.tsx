"use client";

/**
 * 매물 등록·수정 폼 (T3.1) — 거래유형·보증금·월세·입주가능일·사진·설명.
 *
 * ## 사진 (T2.4 업로더 연결 지점)
 * 지금은 **URL 입력(최대 5장) 또는 생략**이다. 파일 업로더(`POST /api/uploads`, T2.4)는
 * `applicationId`(환급 신청) 를 필수로 받게 만들어져 있어 매물에 그대로 붙일 수 없다.
 * 업로더를 일반화(`target=listing&listingId=…`)하면 이 자리에 파일 선택 UI 를 끼우면 되고,
 * 저장 형태(`Listing.photos` = URL 문자열 배열)는 바뀌지 않는다. 자세한 내용은
 * `docs/tasks/t3.1-listing-create.md` 의 "사진 처리" 절.
 *
 * 검증은 서버와 **같은 zod 스키마**(`schema.ts`)로 먼저 한 번 본다 — T1.2 폼과 같은 방식.
 */
import { Button, Input } from "@zari/ui";
import { useState } from "react";
import { css, cx } from "styled-system/css";
import { createListingSchema, LISTING_PHOTO_MAX } from "./schema";
import type { CreateListingInput } from "./schema";
import type { DealTypeValue, ListingDto } from "./types";

const formStyle = css({ display: "flex", flexDirection: "column", gap: "field" });
const fieldStyle = css({ display: "flex", flexDirection: "column", gap: "1.5" });
const labelStyle = css({ textStyle: "label", color: "text" });
const helperStyle = css({ textStyle: "caption", color: "text.muted" });
const chipRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "2" });
const chipStyle = css({
  px: "4",
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
const textareaStyle = css({
  w: "full",
  minH: "24",
  px: "3",
  py: "2.5",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  color: "text",
  textStyle: "body",
  resize: "vertical",
  _focusVisible: { outlineWidth: "thick", outlineStyle: "solid", outlineColor: "border.focus" },
});
const photoRowStyle = css({ display: "flex", alignItems: "flex-end", gap: "2" });
const photoGrowStyle = css({ flex: "1", minW: "0" });
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

const DEAL_TYPE_OPTIONS: readonly { value: DealTypeValue; label: string }[] = [
  { value: "WOLSE", label: "월세" },
  { value: "JEONSE", label: "전세" },
];

function toNumber(value: string): number {
  return Number(value.replaceAll(",", "").trim());
}

export type ListingFormProps = {
  mode: "create" | "edit";
  unitId: string;
  defaultValue?: ListingDto;
  pending?: boolean;
  errorMessage?: string;
  onSubmit: (input: CreateListingInput) => void;
};

export function ListingForm({
  mode,
  unitId,
  defaultValue,
  pending = false,
  errorMessage,
  onSubmit,
}: ListingFormProps) {
  const [dealType, setDealType] = useState<DealTypeValue>(defaultValue?.dealType ?? "WOLSE");
  const [deposit, setDeposit] = useState(defaultValue ? String(defaultValue.deposit) : "");
  const [monthlyRent, setMonthlyRent] = useState(
    defaultValue && defaultValue.monthlyRent > 0 ? String(defaultValue.monthlyRent) : "",
  );
  const [availableFrom, setAvailableFrom] = useState(defaultValue?.availableFrom ?? "");
  const [description, setDescription] = useState(defaultValue?.description ?? "");
  const [photos, setPhotos] = useState<string[]>(defaultValue?.photos ?? []);
  const [photoDraft, setPhotoDraft] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function addPhoto() {
    const url = photoDraft.trim();
    if (!url || photos.length >= LISTING_PHOTO_MAX) return;
    setPhotos((prev) => [...prev, url]);
    setPhotoDraft("");
  }

  function handleSubmit() {
    if (pending) return;
    const candidate = {
      unitId,
      dealType,
      deposit: toNumber(deposit || "0"),
      monthlyRent: dealType === "JEONSE" ? 0 : toNumber(monthlyRent || "0"),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(photos.length > 0 ? { photos } : {}),
      availableFrom: availableFrom.trim() === "" ? null : availableFrom.trim(),
    };
    const result = createListingSchema.safeParse(candidate);
    if (!result.success) {
      setLocalError(result.error.issues[0]?.message ?? "입력값을 확인해 주세요.");
      return;
    }
    setLocalError(null);
    onSubmit(result.data);
  }

  return (
    <div className={formStyle}>
      <div className={fieldStyle}>
        <span className={labelStyle}>거래 유형</span>
        <div className={chipRowStyle} role="group" aria-label="거래 유형">
          {DEAL_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={dealType === option.value}
              className={cx(chipStyle, dealType === option.value && chipSelectedStyle)}
              onClick={() => setDealType(option.value)}
              data-testid={`listing-deal-${option.value}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <Input
        label="보증금(원)"
        required
        inputMode="numeric"
        placeholder="10000000"
        value={deposit}
        onChange={(event) => setDeposit(event.target.value)}
        data-testid="listing-deposit"
      />

      {dealType === "WOLSE" ? (
        <Input
          label="월세(원)"
          required
          inputMode="numeric"
          placeholder="500000"
          value={monthlyRent}
          onChange={(event) => setMonthlyRent(event.target.value)}
          data-testid="listing-monthly-rent"
        />
      ) : (
        <p className={helperStyle}>전세는 월세 없이 보증금만 받습니다.</p>
      )}

      <Input
        label="입주가능일"
        type="date"
        value={availableFrom}
        onChange={(event) => setAvailableFrom(event.target.value)}
        helper="비워 두면 즉시 입주로 표시됩니다"
        data-testid="listing-available-from"
      />

      <div className={fieldStyle}>
        <label className={labelStyle} htmlFor="listing-description">
          설명
        </label>
        <textarea
          id="listing-description"
          className={textareaStyle}
          maxLength={500}
          placeholder="채광이 좋고 역까지 도보 5분입니다. (500자 이내)"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          data-testid="listing-description"
        />
      </div>

      <div className={fieldStyle}>
        <span className={labelStyle}>사진</span>
        <p className={noteStyle}>
          파일 업로더는 환급 서류 전용(T2.4)이라 매물에 아직 붙지 않았습니다. 지금은 이미지 주소를
          넣거나 비워 두세요. 최대 {LISTING_PHOTO_MAX}장.
        </p>
        {photos.map((url, index) => (
          <div key={`${url}-${index}`} className={photoRowStyle} data-testid="listing-photo-item">
            <span className={cx(photoGrowStyle, helperStyle)}>{url}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}
            >
              삭제
            </Button>
          </div>
        ))}
        {photos.length < LISTING_PHOTO_MAX ? (
          <div className={photoRowStyle}>
            <div className={photoGrowStyle}>
              <Input
                aria-label="사진 주소"
                placeholder="https://example.com/room.jpg"
                value={photoDraft}
                onChange={(event) => setPhotoDraft(event.target.value)}
                data-testid="listing-photo-input"
              />
            </div>
            <Button
              variant="secondary"
              onClick={addPhoto}
              disabled={photoDraft.trim() === ""}
              data-testid="listing-photo-add"
            >
              추가
            </Button>
          </div>
        ) : null}
      </div>

      {localError ?? errorMessage ? (
        <p className={errorBoxStyle} role="alert">
          {localError ?? errorMessage}
        </p>
      ) : null}

      <Button
        fullWidth
        size="lg"
        onClick={handleSubmit}
        disabled={pending}
        loading={pending}
        data-testid="listing-submit"
      >
        {mode === "create" ? "매물 등록" : "매물 저장"}
      </Button>
    </div>
  );
}
