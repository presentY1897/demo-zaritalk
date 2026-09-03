"use client";

/**
 * `/landlord/brokerage` 임대인 중개 요청 화면 (T3.6) — 목록 + 요청 시트.
 *
 * T0.5 가 배정한 임대인 「중개요청」 탭 목적지의 플레이스홀더를 대체한다.
 * 첫 데이터는 서버 컴포넌트가 넘겨주고, 발송 뒤에는 Tanstack Query 무효화 + `router.refresh()`
 * 로 다시 읽는다(T5.1 `LandlordWorkOrderListView` 와 같은 흐름).
 *
 * 시트는 **호실 → 메시지 → 미리보기 → 발송** 순이다. 미리보기는 `GET …/preview` 로
 * **실제 발송이 쓰는 것과 같은 함수**가 고른 대상을 그대로 보여 준다 — 그래서 여기 뜬 인원 수와
 * 발송 결과가 어긋나지 않는다.
 *
 * 호실 상세(T1.1)의 「중개 요청」 버튼이 `?unitId=` 를 달고 들어오면 그 호실을 고른 채 시트가 열린다.
 */
import { Badge, Button, Card, CardHeader, Sheet, useTrack } from "@zari/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { css, cx } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { formatManwon } from "@/features/landlord/format";
import { LISTING_STATUS_META } from "@/features/listing/status";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { BrokerageMap } from "./BrokerageMap";
import { useBrokeragePreview, useBrokerageRequests, useCreateBrokerageRequest } from "./hooks";
import {
  BROKERAGE_REQUEST_STATUS_META,
  BROKERAGE_TARGET_STATUS_META,
  BROKERAGE_TARGET_STATUS_ORDER,
  formatBrokeragePlace,
  formatDistanceKm,
} from "./status";
import type {
  BrokerageRequestDto,
  ListBrokerageRequestsResult,
} from "./types";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
});
const titleStyle = css({ textStyle: "headline", color: "text" });
const captionStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });
const listStyle = css({ display: "flex", flexDirection: "column", gap: "3" });
const emptyStyle = css({
  p: "6",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "dashed",
  borderColor: "border",
  textAlign: "center",
  textStyle: "body",
  color: "text.muted",
});
const formStyle = css({ display: "flex", flexDirection: "column", gap: "field" });
const labelStyle = css({ textStyle: "label", color: "text", mb: "1.5" });
const chipRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "2" });
const chipStyle = css({
  px: "3",
  py: "2",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  textStyle: "label",
  color: "text",
  cursor: "pointer",
  textAlign: "left",
});
const chipSelectedStyle = css({ bg: "primary.subtle", borderColor: "primary.border" });
const chipHintStyle = css({ display: "block", textStyle: "caption", color: "text.muted" });
const textareaStyle = css({
  w: "full",
  minH: "96px",
  p: "3",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  textStyle: "body",
  color: "text",
  resize: "vertical",
  _focusVisible: { outline: "2px solid", outlineColor: "border.focus", outlineOffset: "1px" },
});
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
const noticeStyle = css({
  bg: "info.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "info.border",
  rounded: "field",
  p: "3",
  textStyle: "caption",
  color: "info.text",
});
const previewBoxStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  p: "3",
  rounded: "card",
  bg: "bg.subtle",
});
const previewHeadStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  textStyle: "label",
  color: "text",
});
const realtorRowStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "3",
  py: "2",
  textStyle: "caption",
  color: "text.muted",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  _last: { borderBottomWidth: "0" },
});
const metaRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  mt: "2",
  textStyle: "caption",
  color: "text.muted",
  flexWrap: "wrap",
});
const bodyStyle = css({ mt: "2", textStyle: "body", color: "text" });
const contactCardStyle = css({
  mt: "3",
  p: "3",
  rounded: "card",
  bg: "success.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "success.border",
  display: "flex",
  flexDirection: "column",
  gap: "1",
  textStyle: "caption",
  color: "text",
});
const contactNameStyle = css({ textStyle: "label", color: "text" });
const phoneLinkStyle = css({ color: "text.brand", textDecoration: "none" });

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function RequestCard({ request }: { request: BrokerageRequestDto }) {
  const meta = BROKERAGE_REQUEST_STATUS_META[request.status];
  return (
    <Card
      padding="md"
      data-testid="brokerage-card"
      data-request-id={request.id}
      data-request-status={request.status}
      data-unit-label={request.place.unitLabel}
    >
      <CardHeader
        title={formatBrokeragePlace(request.place)}
        aside={<Badge tone={meta.tone}>{meta.label}</Badge>}
      />
      {request.message ? <p className={bodyStyle}>{request.message}</p> : null}

      <p className={metaRowStyle} data-testid="brokerage-counts">
        <span>대상 {request.targetCount}명</span>
        {BROKERAGE_TARGET_STATUS_ORDER.filter((status) => status !== "SENT").map((status) => (
          <span key={status} data-testid={`brokerage-count-${status}`}>
            · {BROKERAGE_TARGET_STATUS_META[status].label} {request.counts[status]}
          </span>
        ))}
        <span>· {formatDay(request.createdAt)}</span>
      </p>

      {request.accepted.map((realtor) => (
        <div key={realtor.targetId} className={contactCardStyle} data-testid="brokerage-accepted">
          <span className={contactNameStyle}>
            {realtor.officeName} · {realtor.name}
          </span>
          <span>
            {realtor.address} · {formatDistanceKm(realtor.distanceKm)}
            {realtor.licenseNo ? ` · 등록번호 ${realtor.licenseNo}` : ""}
          </span>
          <a href={`tel:${realtor.phone}`} className={phoneLinkStyle} data-testid="brokerage-accepted-phone">
            {realtor.phone}
          </a>
          {realtor.intro ? <span>{realtor.intro}</span> : null}
        </div>
      ))}

      {request.listing ? (
        <p className={metaRowStyle}>
          <Badge tone={LISTING_STATUS_META[request.listing.status].tone} size="sm">
            매물 {LISTING_STATUS_META[request.listing.status].label}
          </Badge>
          <span>
            {request.listing.dealType === "JEONSE" ? "전세" : "월세"}{" "}
            {formatManwon(request.listing.deposit)}
            {request.listing.monthlyRent > 0
              ? ` / 월 ${formatManwon(request.listing.monthlyRent)}`
              : ""}
          </span>
          <span>· 등록 {request.listing.listedByName}</span>
        </p>
      ) : null}

      <div className={css({ mt: "3" })}>
        <Link href={`/landlord/units/${request.place.unitId}`}>
          <Button size="sm" variant="secondary" fullWidth data-testid="brokerage-unit-link">
            호실 상세
          </Button>
        </Link>
      </div>
    </Card>
  );
}

export function BrokerageRequestListView({
  initialData,
  initialUnitId,
}: {
  initialData: ListBrokerageRequestsResult;
  /** 호실 상세에서 「중개 요청」 으로 들어왔을 때 미리 고를 호실 */
  initialUnitId?: string | null;
}) {
  const router = useRouter();
  const { track } = useTrack();

  const { data = initialData } = useBrokerageRequests(initialData);
  const createRequest = useCreateBrokerageRequest();

  const units = data.units;
  const [open, setOpen] = useState(Boolean(initialUnitId));
  const [unitId, setUnitId] = useState<string | null>(
    initialUnitId ?? units[0]?.unitId ?? null,
  );
  const [message, setMessage] = useState("");
  const [dispatched, setDispatched] = useState<number | null>(null);

  const preview = useBrokeragePreview(open ? unitId : null);
  const previewData = preview.data ?? null;

  // 미리보기가 도착하면 "몇 명에게 갈지" 를 지표로 남긴다(발송 전 이탈을 볼 수 있게)
  useEffect(() => {
    if (!previewData) return;
    track(TRACK_EVENTS.BROKERAGE_PREVIEW_VIEW, {
      unitId: previewData.unit.unitId,
      count: previewData.count,
      blocked: previewData.blockedReason !== null,
    });
  }, [track, previewData]);

  function closeSheet() {
    setOpen(false);
    createRequest.reset();
  }

  const blockedReason = previewData?.blockedReason ?? null;
  const canSubmit =
    unitId !== null && blockedReason === null && !preview.isPending && !createRequest.isPending;

  async function submit() {
    if (!unitId || !canSubmit) return;
    try {
      const result = await createRequest.mutateAsync({
        unitId,
        message: message.trim() === "" ? null : message.trim(),
      });
      track(TRACK_EVENTS.BROKERAGE_REQUEST_COMPLETE, {
        requestId: result.request.id,
        unitId,
        dispatchedCount: result.dispatchedCount,
        targetCount: result.request.targetCount,
        reused: result.reused,
      });
      setDispatched(result.dispatchedCount);
      setMessage("");
      closeSheet();
      router.refresh();
    } catch {
      /* 실패 문구는 errorMessage 로 시트 안에 표시된다 */
    }
  }

  return (
    <main className={pageStyle}>
      <div className={headerStyle}>
        <div>
          <h1 className={titleStyle}>중개요청</h1>
          <p className={captionStyle}>
            {data.requests.length > 0
              ? `요청 ${data.requests.length}건`
              : "공실을 주변 중개인에게 알려 세입자를 찾습니다."}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setOpen(true)}
          disabled={units.length === 0}
          data-testid="brokerage-new"
        >
          중개 요청
        </Button>
      </div>

      {units.length === 0 ? (
        <p className={emptyStyle} data-testid="brokerage-no-unit">
          요청을 보낼 공실이 없습니다.
          <br />
          계약이 끝난 호실이 생기면 여기서 바로 중개를 요청할 수 있습니다.
        </p>
      ) : null}

      {dispatched !== null ? (
        <p className={noticeStyle} data-testid="brokerage-dispatched" role="status">
          {dispatched > 0
            ? `활동반경 안 중개인 ${dispatched}명에게 요청을 보냈습니다. 응답은 이 목록에 바로 반영됩니다.`
            : "이번에 새로 보낼 중개인이 없었습니다. 이미 요청을 받은 중개인에게는 다시 보내지 않습니다."}
        </p>
      ) : null}

      {data.requests.length === 0 ? (
        <p className={emptyStyle} data-testid="brokerage-empty">
          아직 보낸 중개 요청이 없습니다.
        </p>
      ) : (
        <div className={listStyle}>
          {data.requests.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </div>
      )}

      <Sheet
        open={open}
        onClose={closeSheet}
        title="중개 요청 보내기"
        description="공실 건물을 기준으로 활동반경 안의 중개인에게 거리순으로 전달됩니다."
        footer={
          <Button
            fullWidth
            loading={createRequest.isPending}
            disabled={!canSubmit}
            onClick={submit}
            data-testid="brokerage-submit"
          >
            {previewData ? `중개인 ${previewData.count}명에게 요청` : "요청 보내기"}
          </Button>
        }
      >
        <div className={formStyle}>
          <div>
            <p className={labelStyle}>공실 호실</p>
            <div className={chipRowStyle}>
              {units.map((unit) => (
                <button
                  key={unit.unitId}
                  type="button"
                  className={cx(chipStyle, unitId === unit.unitId && chipSelectedStyle)}
                  aria-pressed={unitId === unit.unitId}
                  onClick={() => setUnitId(unit.unitId)}
                  data-testid={`brokerage-unit-${unit.unitId}`}
                  data-unit-label={unit.unitLabel}
                >
                  {formatBrokeragePlace(unit)}
                  <span className={chipHintStyle}>
                    {unit.buildingAddress}
                    {unit.openRequestId ? " · 요청 중" : ""}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className={labelStyle}>중개인에게 보낼 메시지 (선택)</p>
            <textarea
              className={textareaStyle}
              value={message}
              maxLength={500}
              placeholder="예) 즉시 입주 가능합니다. 월세 50만원 선으로 보고 있습니다."
              onChange={(event) => setMessage(event.target.value)}
              data-testid="brokerage-message"
            />
          </div>

          <div className={previewBoxStyle} data-testid="brokerage-preview">
            <div className={previewHeadStyle}>
              <span>받는 중개인</span>
              <span data-testid="brokerage-preview-count">
                {preview.isPending ? "계산 중…" : `${previewData?.count ?? 0}명`}
              </span>
            </div>

            {blockedReason ? (
              <p className={errorStyle} role="alert" data-testid="brokerage-blocked">
                {blockedReason}
              </p>
            ) : null}

            {previewData && previewData.count > 0 ? (
              <>
                <BrokerageMap unit={previewData.unit} realtors={previewData.realtors} />
                <div>
                  {previewData.realtors.map((realtor) => (
                    <div
                      key={realtor.profileId}
                      className={realtorRowStyle}
                      data-testid="brokerage-preview-realtor"
                    >
                      <span>{realtor.officeName}</span>
                      <span>{formatDistanceKm(realtor.distanceKm)}</span>
                    </div>
                  ))}
                </div>
                <p className={css({ textStyle: "caption", color: "text.muted" })}>
                  거리순 최대 {previewData.limit}명까지 전달됩니다. 연락처는 수락한 중개인만 열립니다.
                </p>
              </>
            ) : null}

            {previewData && previewData.count === 0 && !blockedReason ? (
              <p
                className={css({ textStyle: "caption", color: "text.muted" })}
                data-testid="brokerage-preview-empty"
              >
                이 건물을 활동반경에 둔 중개인이 아직 없습니다. 요청은 남고, 조건이 맞는 중개인이
                생기면 다시 보낼 수 있습니다.
              </p>
            ) : null}

            {previewData?.openRequestId ? (
              <p className={css({ textStyle: "caption", color: "text.muted" })} data-testid="brokerage-preview-reuse">
                이 호실에는 이미 진행 중인 요청이 있습니다. 새 요청을 만들지 않고 아직 받지 않은
                중개인에게만 추가로 보냅니다.
              </p>
            ) : null}
          </div>

          {createRequest.error ? (
            <p className={errorStyle} role="alert">
              {errorMessage(createRequest.error)}
            </p>
          ) : null}
        </div>
      </Sheet>
    </main>
  );
}
