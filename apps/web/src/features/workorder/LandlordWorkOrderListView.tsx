"use client";

/**
 * `/landlord/workorders` 임대인 작업 의뢰 화면 (T5.1) — 목록 + 직접 생성.
 *
 * 첫 데이터는 서버 컴포넌트가 넘겨주고, 등록 후에는 Tanstack Query 무효화로 다시 읽는다
 * (T2.6 `TenantComplaintListView` 와 같은 흐름). 생성 시트는 **업종 → 건물/호실 → 내용 → 희망일**
 * 순으로 받는다 — push 추천의 조건(업종·건물 좌표)이 앞 두 칸에서 결정되기 때문이다.
 *
 * 등록에 성공하면 응답의 `dispatchedCount`(이번에 추천이 나간 PRO 마스터 수)를 그대로 알린다.
 * 0명이어도 실패가 아니다 — 무료 마스터는 **전체 피드(pull)** 로 이 의뢰를 본다([D4](../../../../../docs/DECISIONS.md#-d4-마스터-매칭-방식--pull--push-하이브리드)).
 */
import { Badge, Button, Card, CardHeader, Input, Sheet, useTrack } from "@zari/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { css, cx } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { useCreateWorkOrder } from "./hooks";
import {
  formatWorkOrderPlace,
  MASTER_CATEGORY_META,
  MASTER_CATEGORY_ORDER,
  WORK_ORDER_STATUS_META,
} from "./status";
import type {
  LandlordWorkOrderDto,
  MasterCategoryValue,
  WorkOrderPlaceOptionDto,
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
const cardLinkStyle = css({ textDecoration: "none", color: "inherit", display: "block" });
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
  minH: "112px",
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
const metaRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  mt: "2",
  textStyle: "caption",
  color: "text.muted",
  flexWrap: "wrap",
});
const bodyStyle = css({
  mt: "2",
  textStyle: "body",
  color: "text",
  overflow: "hidden",
  // 두 줄까지만 — panda 의 lineClamp 유틸이 -webkit-box·orient 까지 함께 깐다
  display: "-webkit-box",
  lineClamp: 2,
});

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

export function LandlordWorkOrderListView({
  initialWorkOrders,
  places,
}: {
  initialWorkOrders: LandlordWorkOrderDto[];
  places: WorkOrderPlaceOptionDto[];
}) {
  const router = useRouter();
  const { track } = useTrack();
  const createWorkOrder = useCreateWorkOrder();

  const [workOrders, setWorkOrders] = useState(initialWorkOrders);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<MasterCategoryValue>("REPAIR");
  const [buildingId, setBuildingId] = useState(places[0]?.buildingId ?? "");
  const [unitId, setUnitId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [desiredDate, setDesiredDate] = useState("");
  const [dispatched, setDispatched] = useState<number | null>(null);

  const selectedPlace = places.find((place) => place.buildingId === buildingId) ?? null;
  const canSubmit = buildingId !== "" && description.trim().length >= 5;

  function closeSheet() {
    setOpen(false);
    createWorkOrder.reset();
  }

  async function submit() {
    if (!canSubmit || createWorkOrder.isPending) return;
    try {
      const result = await createWorkOrder.mutateAsync({
        category,
        buildingId,
        unitId: unitId ?? null,
        description: description.trim(),
        desiredDate: desiredDate === "" ? null : desiredDate,
      });
      track(TRACK_EVENTS.WORK_ORDER_CREATE_COMPLETE, {
        workOrderId: result.workOrder.id,
        category: result.workOrder.category,
        source: "DIRECT",
        dispatchedCount: result.dispatchedCount,
      });
      setWorkOrders((previous) => [result.workOrder, ...previous]);
      setDispatched(result.dispatchedCount);
      setDescription("");
      setDesiredDate("");
      closeSheet();
      // 서버 컴포넌트가 그린 목록도 맞춰 둔다(뒤로 갔다 와도 같은 화면)
      router.refresh();
    } catch {
      /* 실패 문구는 errorMessage 로 시트 안에 표시된다 */
    }
  }

  return (
    <main className={pageStyle}>
      <div className={headerStyle}>
        <div>
          <h1 className={titleStyle}>작업 의뢰</h1>
          <p className={captionStyle}>
            {workOrders.length > 0
              ? `의뢰 ${workOrders.length}건`
              : "청소·수리·인테리어를 협력업체(마스터)에 의뢰하세요."}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setOpen(true)}
          disabled={places.length === 0}
          data-testid="workorder-new"
        >
          의뢰 등록
        </Button>
      </div>

      {places.length === 0 ? (
        <p className={emptyStyle} data-testid="workorder-no-building">
          등록된 건물이 없어 의뢰를 낼 수 없습니다.
          <br />
          자산에서 건물을 먼저 등록해 주세요.
        </p>
      ) : null}

      {dispatched !== null ? (
        <p className={noticeStyle} data-testid="workorder-dispatched" role="status">
          {dispatched > 0
            ? `조건에 맞는 PRO 마스터 ${dispatched}명에게 추천을 보냈습니다. 무료 마스터도 전체 피드에서 이 의뢰를 봅니다.`
            : "추천 대상 PRO 마스터가 없습니다. 무료 마스터는 전체 피드에서 이 의뢰를 볼 수 있습니다."}
        </p>
      ) : null}

      {workOrders.length === 0 ? (
        <p className={emptyStyle} data-testid="workorder-empty">
          아직 등록한 작업 의뢰가 없습니다.
        </p>
      ) : (
        <div className={listStyle}>
          {workOrders.map((workOrder) => {
            const meta = WORK_ORDER_STATUS_META[workOrder.status];
            return (
              <Link
                key={workOrder.id}
                href={`/landlord/workorders/${workOrder.id}`}
                className={cardLinkStyle}
                data-testid="workorder-card"
                data-workorder-status={workOrder.status}
                data-workorder-source={workOrder.source}
              >
                <Card padding="md" interactive>
                  <CardHeader
                    title={MASTER_CATEGORY_META[workOrder.category].label}
                    aside={<Badge tone={meta.tone}>{meta.label}</Badge>}
                  />
                  <p className={bodyStyle}>{workOrder.description}</p>
                  <p className={metaRowStyle}>
                    <span>{formatWorkOrderPlace(workOrder.place)}</span>
                    <span>· 추천 {workOrder.targetCount}명</span>
                    <span>· {formatDay(workOrder.createdAt)}</span>
                    {workOrder.source === "COMPLAINT" ? (
                      <Badge tone="info" size="sm">
                        민원 전환
                      </Badge>
                    ) : null}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Sheet
        open={open}
        onClose={closeSheet}
        title="작업 의뢰 등록"
        description="업종과 대상을 고르면 조건에 맞는 마스터에게 전달됩니다."
        footer={
          <Button
            fullWidth
            loading={createWorkOrder.isPending}
            disabled={!canSubmit}
            onClick={submit}
            data-testid="workorder-submit"
          >
            의뢰 등록
          </Button>
        }
      >
        <div className={formStyle}>
          <div>
            <p className={labelStyle}>업종</p>
            <div className={chipRowStyle}>
              {MASTER_CATEGORY_ORDER.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={cx(chipStyle, category === value && chipSelectedStyle)}
                  aria-pressed={category === value}
                  onClick={() => setCategory(value)}
                  data-testid={`workorder-category-${value}`}
                >
                  {MASTER_CATEGORY_META[value].label}
                  <span className={chipHintStyle}>{MASTER_CATEGORY_META[value].hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className={labelStyle}>건물</p>
            <div className={chipRowStyle}>
              {places.map((place) => (
                <button
                  key={place.buildingId}
                  type="button"
                  className={cx(chipStyle, buildingId === place.buildingId && chipSelectedStyle)}
                  aria-pressed={buildingId === place.buildingId}
                  onClick={() => {
                    setBuildingId(place.buildingId);
                    setUnitId(null);
                  }}
                  data-testid={`workorder-building-${place.buildingId}`}
                >
                  {place.buildingName}
                  <span className={chipHintStyle}>{place.buildingAddress}</span>
                </button>
              ))}
            </div>
          </div>

          {selectedPlace && selectedPlace.units.length > 0 ? (
            <div>
              <p className={labelStyle}>호실 (선택 안 하면 공용부 작업)</p>
              <div className={chipRowStyle}>
                <button
                  type="button"
                  className={cx(chipStyle, unitId === null && chipSelectedStyle)}
                  aria-pressed={unitId === null}
                  onClick={() => setUnitId(null)}
                  data-testid="workorder-unit-none"
                >
                  공용부
                </button>
                {selectedPlace.units.map((unit) => (
                  <button
                    key={unit.id}
                    type="button"
                    className={cx(chipStyle, unitId === unit.id && chipSelectedStyle)}
                    aria-pressed={unitId === unit.id}
                    onClick={() => setUnitId(unit.id)}
                    data-testid={`workorder-unit-${unit.id}`}
                  >
                    {unit.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <p className={labelStyle}>작업 내용</p>
            <textarea
              className={textareaStyle}
              value={description}
              maxLength={1000}
              placeholder="예) 201호 온수가 미지근합니다. 보일러 점검·수리 부탁드립니다."
              onChange={(event) => setDescription(event.target.value)}
              data-testid="workorder-description"
            />
          </div>

          <Input
            type="date"
            label="희망일 (선택)"
            helper="비워 두면 마스터와 협의합니다."
            value={desiredDate}
            onChange={(event) => setDesiredDate(event.target.value)}
            data-testid="workorder-desired-date"
          />

          {createWorkOrder.error ? (
            <p className={errorStyle} role="alert">
              {errorMessage(createWorkOrder.error)}
            </p>
          ) : null}
        </div>
      </Sheet>
    </main>
  );
}
