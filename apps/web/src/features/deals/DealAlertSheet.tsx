"use client";

/**
 * 실거래가 알림 설정 시트 (T4.4) — 지역(+단지·유형) 구독 · 구독 목록 관리.
 *
 * 화면(`/deals`)은 비로그인도 볼 수 있지만 **구독은 로그인이 필요하다**. 그래서 시트는 두 얼굴이다:
 * 비로그인이면 안내 + 로그인 링크만, 로그인이면 구독 폼 + 목록.
 *
 * 단지는 **자유 입력이 아니라 셀렉트**다 — 알림 매칭이 공백 무시 완전일치라(`./alerts.ts`)
 * 손으로 친 이름이 한 글자만 달라도 알림이 오지 않기 때문이다. 셀렉트에는 그 지역·유형에서
 * 실제로 수집된 단지만 뜬다.
 *
 * 색은 전부 semantic 토큰이고 상태는 `Badge` 의 `tone` 으로만 구분한다(T0.6 — 하드코딩 색상 0).
 */
import { Badge, Button, Sheet, useTrack } from "@zari/ui";
import Link from "next/link";
import { useState } from "react";
import { css } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { useAlerts, useCreateAlert, useDeleteAlert } from "./hooks";
import { DEAL_TYPE_TABS } from "./labels";
import type { DealApartmentDto, DealRegionDto, RealDealTypeValue } from "./types";

const formStyle = css({ display: "flex", flexDirection: "column", gap: "3" });
const fieldStyle = css({ display: "flex", flexDirection: "column", gap: "1.5" });
const labelStyle = css({ textStyle: "label", color: "text" });
const selectStyle = css({
  w: "full",
  h: "44px",
  px: "3",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  textStyle: "body",
  color: "text",
  _focusVisible: { outline: "2px solid", outlineColor: "border.focus", outlineOffset: "1px" },
});
const noteStyle = css({ textStyle: "caption", color: "text.muted" });
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
const okStyle = css({
  bg: "success.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "success.border",
  rounded: "field",
  p: "3",
  textStyle: "caption",
  color: "success.text",
});
const dividerStyle = css({
  mt: "5",
  pt: "4",
  borderTopWidth: "hairline",
  borderTopStyle: "solid",
  borderTopColor: "border",
});
const listStyle = css({ display: "flex", flexDirection: "column", gap: "2", mt: "2" });
const itemStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  p: "3",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
});
const itemTextStyle = css({ textStyle: "body", color: "text", minW: 0 });
const linkStyle = css({ color: "text.brand" });

const ALL_APTS = "__ALL__";
const ALL_TYPES = "__ANY__";

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  return fallback;
}

export type DealAlertSheetProps = {
  open: boolean;
  onClose: () => void;
  region: DealRegionDto;
  dealType: RealDealTypeValue;
  apartments: DealApartmentDto[];
  loggedIn: boolean;
};

export function DealAlertSheet({
  open,
  onClose,
  region,
  dealType,
  apartments,
  loggedIn,
}: DealAlertSheetProps) {
  const { track } = useTrack();
  const [aptName, setAptName] = useState<string>(ALL_APTS);
  const [type, setType] = useState<string>(dealType);
  const [message, setMessage] = useState<string | null>(null);

  const alerts = useAlerts(open && loggedIn);
  const create = useCreateAlert();
  const remove = useDeleteAlert();

  /** 실패는 `create.isError` 로 화면에 나온다 — 여기서 다시 던지면 처리되지 않은 거절이 된다 */
  async function submit() {
    setMessage(null);
    const payload = {
      lawdCd: region.code,
      aptName: aptName === ALL_APTS ? null : aptName,
      dealType: type === ALL_TYPES ? null : (type as RealDealTypeValue),
    };
    try {
      const result = await create.mutateAsync(payload);
      track(TRACK_EVENTS.DEALS_ALERT_CREATE, {
        lawdCd: payload.lawdCd,
        dealType: payload.dealType,
        hasApt: payload.aptName !== null,
        duplicated: result.duplicated,
      });
      setMessage(
        result.duplicated
          ? "이미 같은 조건으로 구독하고 있습니다."
          : "새 거래가 수집되면 알림톡으로 알려 드립니다.",
      );
    } catch {
      // 문구는 아래 create.isError 블록이 그린다
    }
  }

  async function removeAlert(alertId: string) {
    setMessage(null);
    try {
      await remove.mutateAsync(alertId);
      track(TRACK_EVENTS.DEALS_ALERT_DELETE, { alertId });
    } catch {
      // 문구는 아래 remove.isError 블록이 그린다
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="실거래가 알림 설정"
      description={`${region.label}에 새 거래가 등록되면 알림톡(시뮬)으로 알려 드립니다.`}
      footer={
        loggedIn ? (
          <Button
            fullWidth
            loading={create.isPending}
            onClick={() => void submit()}
            data-testid="deals-alert-submit"
          >
            이 조건으로 구독
          </Button>
        ) : undefined
      }
    >
      {!loggedIn ? (
        <p className={noteStyle} data-testid="deals-alert-login-required">
          알림 구독은 로그인이 필요합니다.{" "}
          <Link href="/login" className={linkStyle}>
            로그인하러 가기
          </Link>
        </p>
      ) : (
        <>
          <div className={formStyle}>
            <div className={fieldStyle}>
              <span className={labelStyle}>지역</span>
              <p className={noteStyle}>{region.label} (화면에서 보고 있는 지역)</p>
            </div>

            <label className={fieldStyle}>
              <span className={labelStyle}>단지</span>
              <select
                className={selectStyle}
                value={aptName}
                onChange={(event) => setAptName(event.target.value)}
                data-testid="deals-alert-apt"
              >
                <option value={ALL_APTS}>단지 전체</option>
                {apartments.map((apt) => (
                  <option key={apt.name} value={apt.name}>
                    {apt.name} ({apt.count}건)
                  </option>
                ))}
              </select>
              <span className={noteStyle}>
                수집된 단지만 고를 수 있습니다 — 이름이 정확해야 알림이 갑니다.
              </span>
            </label>

            <label className={fieldStyle}>
              <span className={labelStyle}>거래 유형</span>
              <select
                className={selectStyle}
                value={type}
                onChange={(event) => setType(event.target.value)}
                data-testid="deals-alert-type"
              >
                <option value={ALL_TYPES}>모든 유형</option>
                {DEAL_TYPE_TABS.map((tab) => (
                  <option key={tab.key} value={tab.key}>
                    {tab.label}
                  </option>
                ))}
              </select>
            </label>

            {create.isError ? (
              <p className={errorStyle} role="alert" data-testid="deals-alert-error">
                {errorMessage(create.error, "구독을 저장하지 못했습니다.")}
              </p>
            ) : null}
            {remove.isError ? (
              <p className={errorStyle} role="alert">
                {errorMessage(remove.error, "구독을 해제하지 못했습니다.")}
              </p>
            ) : null}
            {message ? (
              <p className={okStyle} role="status" data-testid="deals-alert-message">
                {message}
              </p>
            ) : null}
          </div>

          <div className={dividerStyle}>
            <span className={labelStyle}>내 구독</span>
            {alerts.isError ? (
              <p className={errorStyle} role="alert">
                {errorMessage(alerts.error, "구독 목록을 불러오지 못했습니다.")}
              </p>
            ) : null}
            {alerts.data && alerts.data.alerts.length === 0 ? (
              <p className={noteStyle} data-testid="deals-alert-empty">
                아직 구독한 조건이 없습니다.
              </p>
            ) : null}
            <div className={listStyle} data-testid="deals-alert-list">
              {(alerts.data?.alerts ?? []).map((alert) => (
                <div key={alert.id} className={itemStyle} data-testid="deals-alert-item">
                  <span className={itemTextStyle}>
                    <Badge tone="info">구독중</Badge> {alert.summary}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={remove.isPending}
                    onClick={() => void removeAlert(alert.id)}
                    data-testid="deals-alert-remove"
                  >
                    해제
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Sheet>
  );
}
