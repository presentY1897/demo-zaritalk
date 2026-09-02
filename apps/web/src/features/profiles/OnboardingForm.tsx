"use client";

/**
 * 온보딩 폼 (T0.4) — 이름 + 프로필 유형 선택(+ 유형별 상세).
 *
 * 두 모드를 같은 폼으로 쓴다.
 * - `SIGNUP`: OTP 로 받은 가입 티켓으로 User 생성까지 (`POST /api/profiles` 가 세션까지 발급)
 * - `ADD_PROFILE`: 이미 로그인한 계정에 다른 유형 프로필 추가
 *
 * 중개인·마스터의 **활동지역은 T3.1 에서 주소 검색으로 교체**했다. 원래는 주소 문자열 +
 * 위경도 수동 입력 + 지역 프리셋(`AREA_PRESETS`)이었지만, 카카오 키를 받은 뒤 공용
 * 주소 검색(`features/address/AddressSearchField`)으로 갈아 끼웠다 —
 * 위경도 입력칸과 프리셋은 사라졌고 좌표는 검색 결과에서만 들어온다.
 */
import { Badge, Button, Input, useTrack } from "@zari/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { css, cx } from "styled-system/css";
import { AddressSearchField } from "@/features/address/AddressSearchField";
import type { AddressSelection } from "@/features/address/types";
import { ApiError } from "@/features/auth/api";
import { useCreateProfile } from "@/features/auth/hooks";
import { formatPhone } from "@/lib/phone";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { MASTER_CATEGORY_OPTIONS, PROFILE_TYPE_OPTIONS, RADIUS_OPTIONS } from "./constants";
import type { CreateProfileInput, MasterCategoryValue, ProfileTypeValue } from "./schema";

export type OnboardingMode = "SIGNUP" | "ADD_PROFILE";

export type OnboardingFormProps = {
  mode: OnboardingMode;
  /** 가입 티켓의 전화번호(SIGNUP) 또는 로그인 계정 번호(ADD_PROFILE) */
  phone: string;
  /** SIGNUP 모드에서만 있다 */
  ticket?: string;
  defaultName?: string;
  /** 이미 가진 유형 — 중복 선택을 막는다(`@@unique([userId, type])`) */
  existingTypes?: ProfileTypeValue[];
};

const pageStyle = css({ display: "flex", flexDirection: "column", gap: "section", py: "8" });
const headerStyle = css({ display: "flex", flexDirection: "column", gap: "1.5" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const leadStyle = css({ textStyle: "body", color: "text.muted" });
const sectionStyle = css({ display: "flex", flexDirection: "column", gap: "field" });
const sectionTitleStyle = css({ textStyle: "subtitle", color: "text" });
const typeListStyle = css({ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "2" });
const typeCardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  alignItems: "flex-start",
  textAlign: "left",
  p: "3",
  rounded: "card",
  border: "1px solid",
  borderColor: "border",
  bg: "bg.card",
  cursor: "pointer",
  transition: "background-color token(durations.fast) token(easings.standard)",
  _disabled: { cursor: "not-allowed", opacity: 0.6 },
});
const typeCardSelectedStyle = css({
  bg: "primary.subtle",
  borderColor: "primary.border",
  borderWidth: "thick",
});
const typeLabelStyle = css({ textStyle: "bodyStrong", color: "text" });
const typeDescStyle = css({ textStyle: "caption", color: "text.muted" });
const chipRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "2" });
const chipStyle = css({
  px: "3",
  py: "2",
  rounded: "pill",
  border: "1px solid",
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
  color: "text",
  fontWeight: "600",
});
const noteStyle = css({
  bg: "info.subtle",
  border: "1px solid",
  borderColor: "info.border",
  rounded: "field",
  p: "3",
  textStyle: "caption",
  color: "info.text",
});
const errorBoxStyle = css({
  bg: "danger.subtle",
  border: "1px solid",
  borderColor: "danger.border",
  rounded: "field",
  p: "3",
  textStyle: "caption",
  color: "danger.text",
});
const phoneRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  textStyle: "caption",
  color: "text.muted",
});

export function OnboardingForm({
  mode,
  phone,
  ticket,
  defaultName = "",
  existingTypes = [],
}: OnboardingFormProps) {
  const router = useRouter();
  const { track, flush } = useTrack();
  const createProfile = useCreateProfile();

  const [name, setName] = useState(defaultName);
  const [type, setType] = useState<ProfileTypeValue | null>(null);

  // 중개인·마스터 공통 활동지역 — 좌표는 주소 검색 결과에서만 들어온다(T3.1)
  const [area, setArea] = useState<AddressSelection | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(3);
  // 중개인
  const [officeName, setOfficeName] = useState("");
  const [licenseNo, setLicenseNo] = useState("");
  // 마스터
  const [companyName, setCompanyName] = useState("");
  const [categories, setCategories] = useState<MasterCategoryValue[]>([]);

  const needsArea = type === "REALTOR" || type === "MASTER";
  const coordsFilled = area !== null;
  const detailReady =
    type === "REALTOR"
      ? officeName.trim() !== "" && coordsFilled
      : type === "MASTER"
        ? companyName.trim() !== "" && categories.length > 0 && coordsFilled
        : true;
  const canSubmit = name.trim().length >= 2 && type !== null && detailReady;

  function toggleCategory(value: MasterCategoryValue) {
    setCategories((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  function buildInput(): CreateProfileInput | null {
    if (!type) return null;
    const base = { name: name.trim(), ...(ticket ? { signupTicket: ticket } : {}) };
    // 활동지역은 주소 검색 결과 그대로 — 도로명이 있으면 도로명을 저장한다(사람이 더 잘 알아본다)
    const areaFields = area
      ? { address: (area.roadAddress ?? area.address).slice(0, 120), lat: area.lat, lng: area.lng }
      : null;
    if (type === "REALTOR") {
      if (!areaFields) return null;
      return {
        ...base,
        type,
        realtor: {
          officeName: officeName.trim(),
          ...(licenseNo.trim() ? { licenseNo: licenseNo.trim() } : {}),
          ...areaFields,
          radiusKm,
        },
      };
    }
    if (type === "MASTER") {
      if (!areaFields) return null;
      return {
        ...base,
        type,
        master: {
          companyName: companyName.trim(),
          categories,
          ...areaFields,
          radiusKm,
        },
      };
    }
    return { ...base, type };
  }

  async function handleSubmit() {
    const input = buildInput();
    if (!input) return;
    try {
      const result = await createProfile.mutateAsync(input);
      // D2 퍼널의 마지막 단계. 프로필 추가(ADD_PROFILE)는 가입이 아니므로 제외한다.
      if (mode === "SIGNUP") {
        track(TRACK_EVENTS.SIGNUP_COMPLETE, { profileType: result.profile.type });
        flush(); // 곧바로 라우팅하므로 배치 창을 기다리지 않고 내보낸다
      }
      // 세입자 + 대기 계약이면 수락 화면(T1.3), 아니면 홈 — 판정은 서버가 한다
      router.replace(result.redirectTo);
      router.refresh();
    } catch {
      /* 실패는 createProfile.error 로 화면에 표시된다 */
    }
  }

  const error = createProfile.error;
  const message =
    error instanceof ApiError ? error.message : error ? "잠시 후 다시 시도해 주세요." : undefined;

  return (
    <div className={pageStyle}>
      <header className={headerStyle}>
        <h1 className={titleStyle}>
          {mode === "SIGNUP" ? "가입 정보를 알려 주세요" : "프로필 추가"}
        </h1>
        <p className={leadStyle}>
          {mode === "SIGNUP"
            ? "이름과 사용할 유형만 고르면 바로 시작합니다."
            : "한 계정에서 유형별 프로필을 하나씩 가질 수 있습니다."}
        </p>
        <p className={phoneRowStyle}>
          <Badge tone="brand">인증 완료</Badge>
          {formatPhone(phone)}
        </p>
      </header>

      <section className={sectionStyle}>
        <Input
          label="이름"
          required
          autoComplete="name"
          placeholder="홍길동"
          value={name}
          onChange={(event) => setName(event.target.value)}
          helper="계약서에 적힌 이름과 같게 적어 주세요"
          data-testid="onboarding-name"
        />
      </section>

      <section className={sectionStyle}>
        <h2 className={sectionTitleStyle}>어떤 유형으로 쓰시나요?</h2>
        <div className={typeListStyle} role="group" aria-label="프로필 유형">
          {PROFILE_TYPE_OPTIONS.map((option) => {
            const owned = existingTypes.includes(option.value);
            const selected = type === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={cx(typeCardStyle, selected && typeCardSelectedStyle)}
                aria-pressed={selected}
                disabled={owned}
                onClick={() => setType(option.value)}
                data-testid={`profile-type-${option.value}`}
              >
                <span className={typeLabelStyle}>
                  {option.label}
                  {owned ? " (보유 중)" : ""}
                </span>
                <span className={typeDescStyle}>{option.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      {type === "REALTOR" ? (
        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>중개사무소 정보</h2>
          <Input
            label="사무소명"
            required
            placeholder="왕십리부동산"
            value={officeName}
            onChange={(event) => setOfficeName(event.target.value)}
          />
          <Input
            label="중개등록번호"
            placeholder="선택 입력"
            value={licenseNo}
            onChange={(event) => setLicenseNo(event.target.value)}
          />
        </section>
      ) : null}

      {type === "MASTER" ? (
        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>업체 정보</h2>
          <Input
            label="업체명"
            required
            placeholder="성수홈케어"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
          />
          <fieldset>
            <legend className={css({ textStyle: "label", color: "text", mb: "1.5" })}>
              업종 (복수 선택)
            </legend>
            <div className={chipRowStyle}>
              {MASTER_CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cx(chipStyle, categories.includes(option.value) && chipSelectedStyle)}
                  aria-pressed={categories.includes(option.value)}
                  onClick={() => toggleCategory(option.value)}
                  data-testid={`master-category-${option.value}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        </section>
      ) : null}

      {needsArea ? (
        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>활동지역</h2>
          <p className={noteStyle}>
            주소를 검색해 고르면 좌표가 자동으로 채워집니다. 이 좌표와 아래 반경으로 중개 요청·작업
            의뢰가 매칭됩니다.
          </p>
          <AddressSearchField
            label="사무소·업체 주소"
            required
            value={area}
            onChange={setArea}
            placeholder="도로명·지번·건물명 (예: 왕십리로 300)"
            testId="area-address"
          />
          <fieldset>
            <legend className={css({ textStyle: "label", color: "text", mb: "1.5" })}>
              활동반경
            </legend>
            <div className={chipRowStyle}>
              {RADIUS_OPTIONS.map((km) => (
                <button
                  key={km}
                  type="button"
                  className={cx(chipStyle, radiusKm === km && chipSelectedStyle)}
                  aria-pressed={radiusKm === km}
                  onClick={() => setRadiusKm(km)}
                >
                  {km}km
                </button>
              ))}
            </div>
          </fieldset>
        </section>
      ) : null}

      {message ? (
        <p className={errorBoxStyle} role="alert">
          {message}
        </p>
      ) : null}

      <Button
        fullWidth
        size="lg"
        onClick={handleSubmit}
        disabled={!canSubmit || createProfile.isPending}
        loading={createProfile.isPending}
        data-testid="onboarding-submit"
      >
        {mode === "SIGNUP" ? "시작하기" : "프로필 추가하기"}
      </Button>
    </div>
  );
}
