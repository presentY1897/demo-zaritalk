"use client";

/**
 * `/master/orders/[id]` 마스터 시점 의뢰 상세 (T5.2).
 *
 * 추천(push)으로 받은 의뢰든 전체 피드(pull)에서 찾은 의뢰든 **같은 화면**을 쓴다 —
 * 다른 것은 상단 배지(추천 여부)와 발송 시각뿐이다.
 *
 * **견적 제안은 이 화면에 없다.** 금액·메시지로 견적을 내고 임대인이 수락하는 흐름은
 * [T5.3](../../../../../docs/tasks/t5.3-quote.md) 범위라 자리만 두고 안내한다.
 * 지금 이 task 가 책임지는 것은 "의뢰가 조건에 맞는 마스터에게 닿는가" 까지다.
 */
import { Badge, Button, Card, CardHeader, useTrack } from "@zari/ui";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { css } from "styled-system/css";
import {
  formatWorkOrderPlace,
  MASTER_CATEGORY_META,
  WORK_ORDER_STATUS_META,
} from "@/features/workorder/status";
import type { MasterWorkOrderDto } from "@/features/workorder/types";
import { TRACK_EVENTS } from "@/lib/tracking/events";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const backStyle = css({
  textStyle: "caption",
  color: "text.brand",
  textDecoration: "none",
  alignSelf: "flex-start",
});
const headerStyle = css({ display: "flex", flexDirection: "column", gap: "1" });
const titleRowStyle = css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const captionStyle = css({ textStyle: "caption", color: "text.muted" });
const descriptionStyle = css({ textStyle: "body", color: "text", whiteSpace: "pre-wrap" });
const rowStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "3",
  py: "1.5",
  textStyle: "caption",
  color: "text.muted",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  _last: { borderBottomWidth: "0" },
});
const rowValueStyle = css({ textStyle: "label", color: "text" });
const soonStyle = css({ textStyle: "caption", color: "text.muted", mt: "2" });

function formatMoment(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function MasterOrderDetailView({ workOrder }: { workOrder: MasterWorkOrderDto }) {
  const { track } = useTrack();
  const meta = WORK_ORDER_STATUS_META[workOrder.status];
  const category = MASTER_CATEGORY_META[workOrder.category];

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track(TRACK_EVENTS.MASTER_ORDER_VIEW, {
      workOrderId: workOrder.id,
      recommended: workOrder.recommended,
      distanceKm: workOrder.distanceKm,
    });
  }, [track, workOrder.id, workOrder.recommended, workOrder.distanceKm]);

  return (
    <main className={pageStyle}>
      <Link href="/master" className={backStyle} data-testid="master-order-back">
        ← 의뢰 피드
      </Link>

      <header className={headerStyle}>
        <div className={titleRowStyle}>
          <h1 className={titleStyle}>{category.label}</h1>
          <Badge tone={meta.tone} data-testid="master-order-status">
            {meta.label}
          </Badge>
          {workOrder.recommended ? (
            <Badge tone="brand" data-testid="master-order-recommended">
              추천
            </Badge>
          ) : null}
        </div>
        <p className={captionStyle}>
          {formatWorkOrderPlace(workOrder.place)} · {workOrder.distanceKm.toFixed(1)}km
        </p>
      </header>

      <Card padding="md">
        <CardHeader title="작업 내용" />
        <p className={descriptionStyle}>{workOrder.description}</p>
      </Card>

      <Card padding="md">
        <CardHeader title="의뢰 정보" />
        <div className={rowStyle}>
          <span>대상</span>
          <span className={rowValueStyle}>{formatWorkOrderPlace(workOrder.place)}</span>
        </div>
        <div className={rowStyle}>
          <span>주소</span>
          <span className={rowValueStyle}>{workOrder.place?.buildingAddress ?? "-"}</span>
        </div>
        <div className={rowStyle}>
          <span>거리</span>
          <span className={rowValueStyle} data-testid="master-order-distance">
            {workOrder.distanceKm.toFixed(1)}km
          </span>
        </div>
        <div className={rowStyle}>
          <span>임대인</span>
          <span className={rowValueStyle}>{workOrder.landlordName}</span>
        </div>
        <div className={rowStyle}>
          <span>희망일</span>
          <span className={rowValueStyle}>{workOrder.desiredDate ?? "협의"}</span>
        </div>
        <div className={rowStyle}>
          <span>{workOrder.recommended ? "추천 도착" : "의뢰 등록"}</span>
          <span className={rowValueStyle}>
            {formatMoment(workOrder.sentAt ?? workOrder.createdAt)}
          </span>
        </div>
      </Card>

      {/* 견적 제안은 T5.3 범위다 — 자리만 둔다 */}
      <Card padding="md" data-testid="master-quote-slot">
        <CardHeader title="견적 제안" />
        <Button fullWidth variant="secondary" disabled data-testid="master-quote-cta">
          견적 보내기
        </Button>
        <p className={soonStyle}>
          금액·메시지로 견적을 제안하는 기능은 T5.3에서 열립니다. 지금은 의뢰를 확인하는 것까지
          동작합니다.
        </p>
      </Card>
    </main>
  );
}
