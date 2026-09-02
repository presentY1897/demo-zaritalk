"use client";

/**
 * `/landlord/workorders/[id]` 작업 의뢰 상세 (T5.1) — 상태 변경(완료·취소) + 추천 현황.
 *
 * T2.6 스레드의 「작업 의뢰로 전환」이 도착하는 목적지이기도 하다 —
 * 전환된 의뢰는 원래 민원 스레드로 되돌아가는 링크를 함께 보여 준다.
 *
 * **견적은 이 화면에 없다.** 마스터의 견적 제안·수락은 [T5.3](../../../../../docs/tasks/t5.3-quote.md)
 * 범위라 자리만 두고 안내한다.
 */
import { Badge, Button, Card, CardHeader, useTrack } from "@zari/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { css, cx } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { useUpdateWorkOrder } from "./hooks";
import {
  canTransitionWorkOrder,
  formatWorkOrderPlace,
  MASTER_CATEGORY_META,
  WORK_ORDER_STATUS_META,
  WORK_ORDER_STATUS_TARGETS,
  workOrderTransitionRejectReason,
} from "./status";
import type { LandlordWorkOrderDto } from "./types";

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
const titleStyle = css({ textStyle: "headline", color: "text" });
const captionStyle = css({ textStyle: "caption", color: "text.muted" });
const metaRowStyle = css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap" });
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
const buttonRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "2", mt: "3" });
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
const soonStyle = css({ textStyle: "caption", color: "text.muted", mt: "2" });

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

export function LandlordWorkOrderDetailView({
  initialWorkOrder,
}: {
  initialWorkOrder: LandlordWorkOrderDto;
}) {
  const router = useRouter();
  const { track } = useTrack();
  const [workOrder, setWorkOrder] = useState(initialWorkOrder);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const changeStatus = useUpdateWorkOrder(workOrder.id);

  const meta = WORK_ORDER_STATUS_META[workOrder.status];
  const category = MASTER_CATEGORY_META[workOrder.category];

  async function submitStatus(next: (typeof WORK_ORDER_STATUS_TARGETS)[number]) {
    if (changeStatus.isPending) return;
    setTransitionError(null);
    if (!canTransitionWorkOrder(workOrder.status, next)) {
      // 화면에서 이미 비활성이지만, 규칙은 한 곳(status.ts)에서만 읽는다
      setTransitionError(workOrderTransitionRejectReason(workOrder.status, next));
      return;
    }
    const from = workOrder.status;
    try {
      const updated = await changeStatus.mutateAsync({ status: next });
      setWorkOrder(updated);
      track(TRACK_EVENTS.WORK_ORDER_STATUS_CHANGE, {
        workOrderId: workOrder.id,
        from,
        to: next,
      });
      router.refresh();
    } catch (error) {
      setTransitionError(errorMessage(error) ?? "상태를 바꾸지 못했습니다.");
    }
  }

  return (
    <main className={pageStyle}>
      <Link href="/landlord/workorders" className={backStyle} data-testid="workorder-back">
        ← 작업 의뢰 목록
      </Link>

      <header className={headerStyle}>
        <div className={metaRowStyle}>
          <h1 className={titleStyle}>{category.label}</h1>
          <Badge tone={meta.tone} data-testid="workorder-status">
            {meta.label}
          </Badge>
          {workOrder.source === "COMPLAINT" ? <Badge tone="info">민원 전환</Badge> : null}
        </div>
        <p className={captionStyle}>
          {formatWorkOrderPlace(workOrder.place)} · 등록 {formatDay(workOrder.createdAt)}
        </p>
      </header>

      <Card padding="md">
        <CardHeader title="작업 내용" />
        <p className={descriptionStyle}>{workOrder.description}</p>
      </Card>

      {workOrder.complaintId ? (
        <Card padding="md" data-testid="workorder-complaint-link">
          <CardHeader title="전환된 민원" />
          <p className={captionStyle}>이 의뢰는 세입자 민원에서 넘어왔습니다.</p>
          <div className={buttonRowStyle}>
            <Link
              href={`/landlord/complaints/${workOrder.complaintId}`}
              className={backStyle}
              data-testid="workorder-complaint-href"
            >
              「{workOrder.complaintTitle ?? "민원"}」 스레드 열기 →
            </Link>
          </div>
        </Card>
      ) : null}

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
          <span>업종</span>
          <span className={rowValueStyle}>{category.label}</span>
        </div>
        <div className={rowStyle}>
          <span>희망일</span>
          <span className={rowValueStyle}>{workOrder.desiredDate ?? "협의"}</span>
        </div>
        <div className={rowStyle}>
          <span>추천 발송</span>
          <span className={rowValueStyle} data-testid="workorder-target-count">
            PRO 마스터 {workOrder.targetCount}명
          </span>
        </div>
      </Card>

      <Card padding="md" data-testid="workorder-status-panel">
        <CardHeader title="처리 상태" />
        <p className={captionStyle}>
          작업이 끝났으면 「완료」, 더 이상 필요 없으면 「취소」로 닫습니다. 종결한 의뢰는 다시 열 수
          없습니다.
        </p>
        <div className={buttonRowStyle}>
          {WORK_ORDER_STATUS_TARGETS.map((target) => (
            <Button
              key={target}
              size="sm"
              variant={target === "CANCELLED" ? "ghost" : "secondary"}
              disabled={!canTransitionWorkOrder(workOrder.status, target) || changeStatus.isPending}
              onClick={() => submitStatus(target)}
              data-testid={`workorder-status-${target}`}
            >
              {WORK_ORDER_STATUS_META[target].label}
            </Button>
          ))}
        </div>
        {transitionError ? (
          <p className={cx(errorStyle, css({ mt: "3" }))} role="alert">
            {transitionError}
          </p>
        ) : null}
      </Card>

      {/* 견적 제안·수락은 T5.3 범위다 — 자리만 둔다 */}
      <Card padding="md" data-testid="workorder-quote-slot">
        <CardHeader title="받은 견적" aside={<Badge tone="neutral">{workOrder.quoteCount}</Badge>} />
        <p className={soonStyle}>
          마스터의 견적 제안과 수락(배정)은 T5.3에서 열립니다. 지금은 의뢰가 마스터에게 전달되는
          것까지 동작합니다.
        </p>
      </Card>
    </main>
  );
}
