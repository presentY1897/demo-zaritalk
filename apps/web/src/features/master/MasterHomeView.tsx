"use client";

/**
 * `/master` 마스터 홈 (T5.2) — 탭 2개.
 *
 * | 탭 | 무엇 | 누가 본다 |
 * |---|---|---|
 * | **추천받은 의뢰**(push) | 나에게 발송된 `WorkOrderTarget`, 최신 발송순 | 유료(PRO)만 |
 * | **전체 피드**(pull) | 내 업종 + 활동반경 안의 `REQUESTED` 의뢰, 거리순 | 전 마스터 |
 *
 * [D4](../../../../../docs/DECISIONS.md#-d4-마스터-매칭-방식--pull--push-하이브리드) 의 하이브리드를
 * 그대로 화면으로 옮긴 것이다 — **무료는 찾아가고, 유료는 받아본다.** 그래서 무료 계정의 추천 탭은
 * 빈 목록이 아니라 **업그레이드 안내**를 보여 준다(왜 비어 있는지가 화면에서 보여야 한다).
 *
 * 플랜 토글은 데모 시연용이다(결제 없음). 토글하면 두 캐시를 모두 비워 추천 탭이 그 자리에서 채워진다.
 */
import { Badge, Button, Card, CardHeader, useTrack } from "@zari/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { css, cx } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import {
  formatWorkOrderPlace,
  MASTER_CATEGORY_META,
  WORK_ORDER_STATUS_META,
} from "@/features/workorder/status";
import type {
  MasterFeedResult,
  MasterTargetsResult,
  MasterWorkOrderDto,
} from "@/features/workorder/types";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { useMasterFeed, useMasterTargets, useUpdateMasterPlan } from "./hooks";
import { MASTER_PLAN_META } from "./plan";

type TabKey = "recommended" | "feed";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const headerStyle = css({ display: "flex", flexDirection: "column", gap: "1" });
const titleRowStyle = css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const captionStyle = css({ textStyle: "caption", color: "text.muted" });
const tabRowStyle = css({
  display: "flex",
  gap: "1",
  p: "1",
  rounded: "pill",
  bg: "bg.subtle",
});
const tabStyle = css({
  flex: "1",
  px: "3",
  py: "2",
  rounded: "pill",
  borderWidth: "0",
  bg: "transparent",
  textStyle: "label",
  color: "text.muted",
  cursor: "pointer",
  _focusVisible: { outline: "2px solid", outlineColor: "border.focus", outlineOffset: "1px" },
});
const tabActiveStyle = css({ bg: "bg.card", color: "text", shadow: "card" });
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
const upgradeStyle = css({
  p: "5",
  rounded: "card",
  bg: "primary.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "primary.border",
  display: "flex",
  flexDirection: "column",
  gap: "3",
  textStyle: "body",
  color: "text",
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

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

/** 소수 1자리 km — 목록에서 거리 비교가 한눈에 되도록 */
function formatDistance(km: number): string {
  return `${km.toFixed(1)}km`;
}

function OrderCard({ workOrder }: { workOrder: MasterWorkOrderDto }) {
  const meta = WORK_ORDER_STATUS_META[workOrder.status];
  return (
    <Link
      href={`/master/orders/${workOrder.id}`}
      className={cardLinkStyle}
      data-testid="master-order-card"
      data-workorder-id={workOrder.id}
      data-recommended={workOrder.recommended ? "true" : "false"}
    >
      <Card padding="md" interactive>
        <CardHeader
          title={MASTER_CATEGORY_META[workOrder.category].label}
          aside={<Badge tone={meta.tone}>{meta.label}</Badge>}
        />
        <p className={bodyStyle}>{workOrder.description}</p>
        <p className={metaRowStyle}>
          <span>{formatWorkOrderPlace(workOrder.place)}</span>
          <span>· {formatDistance(workOrder.distanceKm)}</span>
          <span>· {workOrder.landlordName}</span>
          <span>· {formatDay(workOrder.sentAt ?? workOrder.createdAt)}</span>
          {workOrder.recommended ? (
            <Badge tone="brand" size="sm">
              추천
            </Badge>
          ) : null}
        </p>
      </Card>
    </Link>
  );
}

export function MasterHomeView({
  initialFeed,
  initialTargets,
}: {
  initialFeed: MasterFeedResult;
  initialTargets: MasterTargetsResult;
}) {
  const router = useRouter();
  const { track } = useTrack();
  const [tab, setTab] = useState<TabKey>("recommended");

  const feed = useMasterFeed(initialFeed);
  const targets = useMasterTargets(initialTargets);
  const changePlan = useUpdateMasterPlan();

  const master = targets.data?.master ?? feed.data?.master ?? initialFeed.master;
  const feedOrders = feed.data?.workOrders ?? [];
  const targetOrders = targets.data?.workOrders ?? [];
  const upgradeRequired = targets.data?.upgradeRequired ?? true;
  const planMeta = MASTER_PLAN_META[master.plan];

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track(TRACK_EVENTS.MASTER_FEED_VIEW, {
      plan: master.plan,
      feedCount: feedOrders.length,
      targetCount: targetOrders.length,
    });
  }, [track, master.plan, feedOrders.length, targetOrders.length]);

  function selectTab(next: TabKey) {
    if (next === tab) return;
    setTab(next);
    track(TRACK_EVENTS.MASTER_FEED_TAB_CHANGE, { tab: next });
  }

  async function togglePlan() {
    if (changePlan.isPending) return;
    const from = master.plan;
    const to = from === "PRO" ? "FREE" : "PRO";
    try {
      await changePlan.mutateAsync({ plan: to });
      track(TRACK_EVENTS.MASTER_PLAN_CHANGE, { from, to });
      // 서버 컴포넌트가 그린 초기 데이터도 맞춰 둔다
      router.refresh();
    } catch {
      /* 실패 문구는 아래 errorMessage 로 표시된다 */
    }
  }

  return (
    <main className={pageStyle}>
      <header className={headerStyle}>
        <div className={titleRowStyle}>
          <h1 className={titleStyle}>의뢰 피드</h1>
          <Badge tone={planMeta.tone} data-testid="master-plan-badge">
            {planMeta.label}
          </Badge>
        </div>
        <p className={captionStyle}>
          {master.companyName} · {master.categories.map((c) => MASTER_CATEGORY_META[c].label).join("·")}{" "}
          · 반경 {master.radiusKm}km
        </p>
        <p className={captionStyle}>{planMeta.description}</p>
      </header>

      <div className={tabRowStyle} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "recommended"}
          className={cx(tabStyle, tab === "recommended" && tabActiveStyle)}
          onClick={() => selectTab("recommended")}
          data-testid="master-tab-recommended"
        >
          추천받은 의뢰 {targetOrders.length}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "feed"}
          className={cx(tabStyle, tab === "feed" && tabActiveStyle)}
          onClick={() => selectTab("feed")}
          data-testid="master-tab-feed"
        >
          전체 피드 {feedOrders.length}
        </button>
      </div>

      {tab === "recommended" ? (
        <section data-testid="master-recommended-panel">
          {upgradeRequired ? (
            <div className={upgradeStyle} data-testid="master-upgrade">
              <strong>PRO로 바꾸면 맞는 의뢰를 먼저 받아봅니다.</strong>
              <span className={captionStyle}>
                지금은 무료 플랜이라 추천이 오지 않습니다. 전체 피드에서 내 업종·활동반경의 의뢰를
                직접 찾아 견적을 낼 수 있습니다.
              </span>
              <Button
                loading={changePlan.isPending}
                onClick={togglePlan}
                data-testid="master-plan-toggle"
              >
                PRO로 전환 (데모)
              </Button>
            </div>
          ) : targetOrders.length === 0 ? (
            <p className={emptyStyle} data-testid="master-target-empty">
              아직 추천받은 의뢰가 없습니다.
              <br />
              조건에 맞는 의뢰가 들어오면 바로 여기에 꽂힙니다.
            </p>
          ) : (
            <div className={listStyle}>
              {targetOrders.map((workOrder) => (
                <OrderCard key={workOrder.id} workOrder={workOrder} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section data-testid="master-feed-panel">
          {feedOrders.length === 0 ? (
            <p className={emptyStyle} data-testid="master-feed-empty">
              내 업종·활동반경 안에 요청 중인 의뢰가 없습니다.
            </p>
          ) : (
            <div className={listStyle}>
              {feedOrders.map((workOrder) => (
                <OrderCard key={workOrder.id} workOrder={workOrder} />
              ))}
            </div>
          )}
        </section>
      )}

      {!upgradeRequired ? (
        <Card padding="md" data-testid="master-plan-panel">
          <CardHeader title="플랜" aside={<Badge tone={planMeta.tone}>{planMeta.label}</Badge>} />
          <p className={captionStyle}>
            데모라 결제 없이 전환할 수 있습니다. 무료로 바꾸면 추천이 오지 않고 전체 피드만 남습니다.
          </p>
          <div className={css({ mt: "3" })}>
            <Button
              size="sm"
              variant="secondary"
              loading={changePlan.isPending}
              onClick={togglePlan}
              data-testid="master-plan-toggle"
            >
              무료로 전환 (데모)
            </Button>
          </div>
        </Card>
      ) : null}

      {changePlan.error ? (
        <p className={errorStyle} role="alert">
          {errorMessage(changePlan.error)}
        </p>
      ) : null}
    </main>
  );
}
