"use client";

/**
 * 계약 등록 폼 (T1.2).
 *
 * 전화번호는 T0.3 의 `phoneSchema`(하이픈 허용 → 숫자만 정규화)를 그대로 쓰고,
 * 나머지 값도 서버와 **같은 zod 스키마**(`createLeaseSchema`)로 먼저 막는다.
 * 기간 역전·형식 오류는 여기서 걸러지고, 같은 호실 기간 중복(409)은 서버 문구를 그대로 보여 준다.
 *
 * `@zari/ui` 에 Select 가 아직 없어 호실 선택만 네이티브 `<select>` 를 쓴다 —
 * 스타일은 Input 과 같은 토큰으로 맞췄다(하드코딩 색상 0).
 */
import { Button, Input } from "@zari/ui";
import { useMemo, useState } from "react";
import { css } from "styled-system/css";
import { formatKrw } from "@/features/landlord/format";
import { createLeaseSchema, type CreateLeaseInput } from "./schema";
import type { UnitOptionDto } from "./types";

const formStyle = css({ display: "flex", flexDirection: "column", gap: "field" });
const twoColStyle = css({ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "2" });
const fieldStyle = css({ display: "flex", flexDirection: "column", gap: "1.5" });
const labelStyle = css({ textStyle: "label", color: "text" });
const selectStyle = css({
  w: "full",
  minH: "tap",
  px: "3",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  color: "text",
  textStyle: "body",
  _focusVisible: { outline: "2px solid", outlineColor: "border.focus", outlineOffset: "1px" },
});
const helperStyle = css({ textStyle: "caption", color: "text.muted" });
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
const summaryStyle = css({
  bg: "bg.subtle",
  rounded: "card",
  p: "3",
  textStyle: "caption",
  color: "text.muted",
  display: "flex",
  flexDirection: "column",
  gap: "1",
});
const summaryStrongStyle = css({ textStyle: "bodyStrong", color: "text" });

/** 오늘부터 1년(하루 전날까지) — 등록 폼의 기본 계약 기간 */
function defaultPeriod(): { start: string; end: string } {
  const today = new Date();
  const start = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );
  const end = new Date(start);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  end.setUTCDate(end.getUTCDate() - 1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function toNumber(value: string): number {
  const parsed = Number(value.replace(/[,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export type LeaseFormProps = {
  units: UnitOptionDto[];
  defaultUnitId?: string;
  pending?: boolean;
  errorMessage?: string;
  onSubmit: (input: CreateLeaseInput) => void;
};

export function LeaseForm({
  units,
  defaultUnitId,
  pending = false,
  errorMessage,
  onSubmit,
}: LeaseFormProps) {
  const period = useMemo(defaultPeriod, []);
  const [unitId, setUnitId] = useState(defaultUnitId ?? units[0]?.unitId ?? "");
  const [tenantName, setTenantName] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [deposit, setDeposit] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [maintenanceFee, setMaintenanceFee] = useState("");
  const [paymentDay, setPaymentDay] = useState("5");
  const [startDate, setStartDate] = useState(period.start);
  const [endDate, setEndDate] = useState(period.end);
  const [lateFeeRatePct, setLateFeeRatePct] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const monthlyTotal = (toNumber(monthlyRent) || 0) + (toNumber(maintenanceFee) || 0);

  function handleSubmit() {
    if (pending) return;
    const candidate = {
      unitId,
      tenantName,
      tenantPhone,
      deposit: toNumber(deposit || "0"),
      monthlyRent: toNumber(monthlyRent || "0"),
      maintenanceFee: toNumber(maintenanceFee || "0"),
      paymentDay: toNumber(paymentDay),
      startDate,
      endDate,
      lateFeeRatePct: lateFeeRatePct.trim() === "" ? null : toNumber(lateFeeRatePct),
    };
    const result = createLeaseSchema.safeParse(candidate);
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
        <label className={labelStyle} htmlFor="lease-unit">
          호실
        </label>
        <select
          id="lease-unit"
          className={selectStyle}
          value={unitId}
          onChange={(event) => setUnitId(event.target.value)}
          data-testid="lease-unit"
        >
          {units.map((unit) => (
            <option key={unit.unitId} value={unit.unitId}>
              {unit.buildingName} {unit.label}
            </option>
          ))}
        </select>
        <p className={helperStyle}>계약 기간이 겹치는 계약이 이미 있으면 등록할 수 없습니다.</p>
      </div>

      <Input
        label="세입자 이름"
        required
        placeholder="박세입"
        value={tenantName}
        onChange={(event) => setTenantName(event.target.value)}
        data-testid="lease-tenant-name"
      />
      <Input
        label="세입자 전화번호"
        required
        inputMode="tel"
        placeholder="010-1234-5678"
        value={tenantPhone}
        onChange={(event) => setTenantPhone(event.target.value)}
        helper="이 번호로 가입하면 세입자가 계약을 수락할 수 있습니다"
        data-testid="lease-tenant-phone"
      />

      <Input
        label="보증금(원)"
        required
        inputMode="numeric"
        placeholder="20000000"
        value={deposit}
        onChange={(event) => setDeposit(event.target.value)}
        data-testid="lease-deposit"
      />
      <div className={twoColStyle}>
        <Input
          label="월세(원)"
          required
          inputMode="numeric"
          placeholder="650000"
          value={monthlyRent}
          onChange={(event) => setMonthlyRent(event.target.value)}
          helper="전세면 0"
          data-testid="lease-monthly-rent"
        />
        <Input
          label="관리비(원)"
          inputMode="numeric"
          placeholder="50000"
          value={maintenanceFee}
          onChange={(event) => setMaintenanceFee(event.target.value)}
          data-testid="lease-maintenance-fee"
        />
      </div>

      <div className={twoColStyle}>
        <Input
          label="납부일"
          required
          inputMode="numeric"
          placeholder="5"
          value={paymentDay}
          onChange={(event) => setPaymentDay(event.target.value)}
          helper="매월 이 날. 없는 날이면 말일"
          data-testid="lease-payment-day"
        />
        <Input
          label="연체이율(월 %)"
          inputMode="decimal"
          placeholder="5"
          value={lateFeeRatePct}
          onChange={(event) => setLateFeeRatePct(event.target.value)}
          helper="비우면 연체료 없음"
          data-testid="lease-late-fee-rate"
        />
      </div>

      <div className={twoColStyle}>
        <Input
          label="계약 시작일"
          required
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          data-testid="lease-start-date"
        />
        <Input
          label="계약 종료일"
          required
          type="date"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          data-testid="lease-end-date"
        />
      </div>

      <div className={summaryStyle}>
        <span className={summaryStrongStyle}>매월 {formatKrw(monthlyTotal)}</span>
        <span>월세 + 관리비 기준입니다. 미납이 생기면 다음 달 청구에 이월·연체료가 붙습니다.</span>
      </div>

      {localError || errorMessage ? (
        <p className={errorBoxStyle} role="alert">
          {localError ?? errorMessage}
        </p>
      ) : null}

      <Button
        fullWidth
        size="lg"
        onClick={handleSubmit}
        disabled={pending || units.length === 0}
        loading={pending}
        data-testid="lease-submit"
      >
        계약 등록
      </Button>
      <p className={helperStyle}>
        등록하면 세입자 연결 대기 상태가 되고, 당월 청구서가 함께 만들어집니다.
      </p>
    </div>
  );
}
