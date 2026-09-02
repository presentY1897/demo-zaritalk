"use client";

/**
 * 공용 주소 검색 필드 (T3.1·T3.4가 만들고 **T3.2·T3.3·T3.6 이 그대로 재사용한다**).
 *
 * 검색어 → 후보 목록 → 고르면 `{ address, roadAddress, lat, lng, placeName }` 를 돌려준다.
 * 카카오 REST 키가 필요한 부분은 전부 서버(`/api/address/search`)에 있다 — 이 컴포넌트는
 * 우리 API 만 부른다.
 *
 * ```tsx
 * const [area, setArea] = useState<AddressSelection | null>(null);
 * <AddressSearchField
 *   label="주소" required value={area} onChange={setArea}
 *   testId="building-address"        // 입력 building-address-input / 후보 building-address-option-0
 * />
 * ```
 *
 * - **좌표 입력칸이 없다.** 좌표는 선택한 후보에서만 나온다 — 손으로 못 적는다.
 *   (T0.4·T1.1 의 위경도 수동 입력 + 지역 프리셋을 이 컴포넌트로 걷어냈다.)
 * - 고른 뒤에는 결과 요약 + 「변경」 버튼만 남는다. 다시 누르면 검색 상태로 돌아온다.
 * - 하드코딩 색상 0 — semantic 토큰만 쓴다(T0.6).
 */
import { Badge, Button, Input, Spinner } from "@zari/ui";
import { useState } from "react";
import { css, cx } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { useAddressSearch } from "./hooks";
import { displayAddress, toSelection, type AddressCandidate, type AddressSelection } from "./types";

export type AddressSearchFieldProps = {
  /** 필드 라벨. 기본 "주소" */
  label?: string;
  required?: boolean;
  /** 검색칸 아래 안내 문구 */
  helper?: string;
  placeholder?: string;
  /** 현재 선택값. `null` 이면 검색 상태로 보인다 */
  value: AddressSelection | null;
  onChange: (value: AddressSelection | null) => void;
  /** 폼 검증 실패 문구(선택 안 함 등) */
  errorMessage?: string;
  /** 한 번에 보여 줄 후보 수 (1~15) */
  size?: number;
  /** `data-testid` 접두사 — `-input` · `-submit` · `-option-<i>` · `-selected` · `-change` 가 붙는다 */
  testId?: string;
};

const wrapStyle = css({ display: "flex", flexDirection: "column", gap: "2" });
const rowStyle = css({ display: "flex", alignItems: "flex-end", gap: "2" });
const growStyle = css({ flex: "1", minW: "0" });
const listStyle = css({
  display: "flex",
  flexDirection: "column",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  rounded: "field",
  overflow: "hidden",
  bg: "bg.card",
});
const optionStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
  alignItems: "flex-start",
  textAlign: "left",
  w: "full",
  px: "3",
  py: "2.5",
  minH: "tap",
  bg: "bg.card",
  cursor: "pointer",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  _last: { borderBottomWidth: "0" },
  _hover: { bg: "bg.subtle" },
});
const optionTitleStyle = css({ textStyle: "bodyStrong", color: "text" });
const optionSubStyle = css({ textStyle: "caption", color: "text.muted" });
const selectedStyle = css({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "3",
  p: "3",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "primary.border",
  bg: "primary.subtle",
});
const labelStyle = css({ textStyle: "label", color: "text" });
const requiredMarkStyle = css({ color: "danger.text", ml: "0.5" });
const noteStyle = css({ textStyle: "caption", color: "text.muted" });
const errorStyle = css({ textStyle: "caption", color: "danger.text" });
const pendingStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  textStyle: "caption",
  color: "text.muted",
});

function candidateTitle(candidate: AddressCandidate): string {
  return candidate.placeName ?? displayAddress(candidate);
}

function candidateSub(candidate: AddressCandidate): string {
  const road = candidate.roadAddress;
  if (candidate.placeName) {
    return [road ?? candidate.address, road && road !== candidate.address ? candidate.address : null]
      .filter(Boolean)
      .join(" · ");
  }
  // 장소명이 없으면 제목이 도로명(없으면 지번)이므로 나머지 한쪽만 보조로 보여 준다
  return road ? candidate.address : "";
}

export function AddressSearchField({
  label = "주소",
  required = false,
  helper,
  placeholder = "도로명·지번·건물명 (예: 행당로 79, 왕십리역)",
  value,
  onChange,
  errorMessage,
  size = 8,
  testId = "address",
}: AddressSearchFieldProps) {
  const [term, setTerm] = useState("");
  const [editing, setEditing] = useState(false);
  const { search, reset, candidates, isPending, error, isEmpty, submitted } = useAddressSearch(size);

  const showSearch = value === null || editing;

  function runSearch() {
    if (term.trim().length < 2) return;
    search(term);
  }

  function pick(candidate: AddressCandidate) {
    onChange(toSelection(candidate));
    setEditing(false);
    setTerm("");
    reset();
  }

  const lookupError =
    error instanceof ApiError ? error.message : error ? "주소를 검색하지 못했습니다." : undefined;

  if (!showSearch && value) {
    return (
      <div className={wrapStyle}>
        <span className={labelStyle}>
          {label}
          {required ? (
            <span className={requiredMarkStyle} aria-hidden="true">
              *
            </span>
          ) : null}
        </span>
        <div className={selectedStyle} data-testid={`${testId}-selected`}>
          <div>
            <p className={optionTitleStyle}>{displayAddress(value)}</p>
            {value.roadAddress && value.roadAddress !== value.address ? (
              <p className={optionSubStyle}>{value.address}</p>
            ) : null}
            <p className={optionSubStyle}>
              위도 {value.lat.toFixed(5)} · 경도 {value.lng.toFixed(5)}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setEditing(true)}
            data-testid={`${testId}-change`}
          >
            변경
          </Button>
        </div>
        {errorMessage ? <p className={errorStyle}>{errorMessage}</p> : null}
      </div>
    );
  }

  return (
    <div className={wrapStyle}>
      <div className={rowStyle}>
        <div className={growStyle}>
          <Input
            label={label}
            required={required}
            placeholder={placeholder}
            helper={helper ?? "검색 후 목록에서 고르면 좌표가 자동으로 채워집니다."}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              runSearch();
            }}
            data-testid={`${testId}-input`}
          />
        </div>
        <Button
          variant="secondary"
          onClick={runSearch}
          disabled={term.trim().length < 2 || isPending}
          data-testid={`${testId}-submit`}
        >
          검색
        </Button>
      </div>

      {isPending ? (
        <p className={pendingStyle}>
          <Spinner size="sm" /> 주소를 찾는 중…
        </p>
      ) : null}

      {!isPending && candidates.length > 0 ? (
        <div className={listStyle} role="listbox" aria-label={`${label} 검색 결과`}>
          {candidates.map((candidate, index) => {
            const sub = candidateSub(candidate);
            return (
              <button
                key={candidate.id}
                type="button"
                role="option"
                aria-selected="false"
                className={cx(optionStyle)}
                onClick={() => pick(candidate)}
                data-testid={`${testId}-option-${index}`}
              >
                <span className={optionTitleStyle}>
                  {candidateTitle(candidate)}
                  {candidate.category ? (
                    <>
                      {" "}
                      <Badge tone="neutral" size="sm">
                        {candidate.category}
                      </Badge>
                    </>
                  ) : null}
                </span>
                {sub ? <span className={optionSubStyle}>{sub}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {!isPending && isEmpty ? (
        <p className={noteStyle} data-testid={`${testId}-empty`}>
          「{submitted}」 검색 결과가 없습니다. 도로명이나 건물명으로 다시 찾아보세요.
        </p>
      ) : null}

      {lookupError ? (
        <p className={errorStyle} role="alert">
          {lookupError}
        </p>
      ) : null}
      {errorMessage ? <p className={errorStyle}>{errorMessage}</p> : null}

      {value && editing ? (
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          검색 취소 — 기존 주소 유지
        </Button>
      ) : null}
    </div>
  );
}
