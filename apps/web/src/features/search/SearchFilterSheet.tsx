"use client";

/**
 * 탐색 필터 시트 (T3.2) — 거래유형 · 보증금 · 월세.
 *
 * 값 목록은 전부 `features/search/filters.ts` 한 곳에서 온다(칩 라벨과 서버가 받는 원 단위 값이
 * 같은 상수에서 나온다). 시트 안에서 고른 값은 **「적용」을 눌러야** 밖으로 나간다 —
 * 칩을 누를 때마다 지도가 다시 조회되면 필터를 만지는 동안 네트워크가 계속 나간다.
 */
import { Badge, Button, Sheet } from "@zari/ui";
import { useEffect, useState } from "react";
import { css, cx } from "styled-system/css";
import type { DealTypeValue } from "@/features/landlord/types";
import {
  DEAL_TYPE_OPTIONS,
  DEPOSIT_STEPS,
  EMPTY_FILTERS,
  RENT_STEPS,
  activeFilterCount,
  invalidRangeMessage,
  type SearchFilters,
} from "./filters";

const groupStyle = css({ display: "flex", flexDirection: "column", gap: "2", mb: "5" });
const legendStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  textStyle: "label",
  color: "text",
});
const chipRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "2" });
const chipStyle = css({
  minH: "36px",
  px: "3",
  rounded: "pill",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  color: "text.muted",
  textStyle: "label",
  cursor: "pointer",
  _focusVisible: { outline: "2px solid", outlineColor: "border.focus", outlineOffset: "1px" },
});
const chipActiveStyle = css({
  bg: "primary.subtle",
  borderColor: "primary.border",
  color: "text",
});
const hintStyle = css({ textStyle: "caption", color: "text.muted" });
const errorStyle = css({ textStyle: "caption", color: "danger.text", mb: "3" });

export type SearchFilterSheetProps = {
  open: boolean;
  onClose: () => void;
  value: SearchFilters;
  onApply: (filters: SearchFilters) => void;
};

export function SearchFilterSheet({ open, onClose, value, onApply }: SearchFilterSheetProps) {
  const [draft, setDraft] = useState<SearchFilters>(value);

  // 시트를 열 때마다 바깥 값으로 되돌린다(닫고 다시 열면 적용된 값이 보여야 한다)
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const error = invalidRangeMessage(draft);
  const count = activeFilterCount(draft);

  const setDealType = (dealType: DealTypeValue | null) =>
    setDraft((prev) => ({ ...prev, dealType }));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="필터"
      description="지도에 보이는 매물을 조건으로 좁힙니다."
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => setDraft(EMPTY_FILTERS)}
            data-testid="search-filter-reset"
          >
            초기화
          </Button>
          <Button
            fullWidth
            disabled={Boolean(error)}
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            data-testid="search-filter-apply"
          >
            {count > 0 ? `필터 ${count}개 적용` : "전체 매물 보기"}
          </Button>
        </>
      }
    >
      <fieldset className={groupStyle}>
        <legend className={legendStyle}>거래유형</legend>
        <div className={chipRowStyle}>
          {DEAL_TYPE_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              className={cx(chipStyle, draft.dealType === option.value && chipActiveStyle)}
              aria-pressed={draft.dealType === option.value}
              onClick={() => setDealType(option.value)}
              data-testid={`search-filter-deal-${option.value ?? "ALL"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className={groupStyle}>
        <legend className={legendStyle}>보증금</legend>
        <div className={chipRowStyle}>
          {DEPOSIT_STEPS.map((step) => (
            <button
              key={step.label}
              type="button"
              className={cx(chipStyle, draft.depositMax === step.value && chipActiveStyle)}
              aria-pressed={draft.depositMax === step.value}
              onClick={() => setDraft((prev) => ({ ...prev, depositMax: step.value }))}
              data-testid={`search-filter-deposit-${step.value ?? "ALL"}`}
            >
              {step.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className={groupStyle}>
        <legend className={legendStyle}>
          월세 <Badge tone="neutral">전세 제외 안 함</Badge>
        </legend>
        <div className={chipRowStyle}>
          {RENT_STEPS.map((step) => (
            <button
              key={step.label}
              type="button"
              className={cx(chipStyle, draft.rentMax === step.value && chipActiveStyle)}
              aria-pressed={draft.rentMax === step.value}
              onClick={() => setDraft((prev) => ({ ...prev, rentMax: step.value }))}
              data-testid={`search-filter-rent-${step.value ?? "ALL"}`}
            >
              {step.label}
            </button>
          ))}
        </div>
        <p className={hintStyle}>
          전세 매물은 월세가 0원이라 「N만 이하」에 함께 남습니다. 월세만 보려면 거래유형에서
          「월세」를 고르세요.
        </p>
      </fieldset>

      {error ? (
        <p className={errorStyle} role="alert">
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}
