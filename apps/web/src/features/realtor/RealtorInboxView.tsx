"use client";

/**
 * `/realtor` 중개인 홈 = **수신함** (T3.7). T0.5 가 배정한 탭 목적지의 플레이스홀더를 대체한다.
 *
 * 반경 안에서 받은 공실 중개 요청을 **새 요청 / 응답함** 두 묶음으로 보여 준다.
 * 카드는 호실·거리·메시지까지만 담는다 — **임대인 연락처는 수락한 뒤에** 상세에서 열린다.
 *
 * 거리는 지금 다시 계산한 값이 아니라 **발송 시점에 굳은 값**이다(사무소를 옮겨도
 * "그때 이 거리라서 받았다" 가 남는다). 규칙은 `features/brokerage/queries.ts` 주석 참고.
 */
import { Badge, Card, CardHeader, useTrack } from "@zari/ui";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { css } from "styled-system/css";
import {
  BROKERAGE_TARGET_STATUS_META,
  formatBrokeragePlace,
  formatDistanceKm,
  isRespondedTarget,
} from "@/features/brokerage/status";
import type { RealtorInboxItemDto, RealtorInboxResult } from "@/features/brokerage/types";
import { useRealtorInbox } from "@/features/brokerage/hooks";
import { TRACK_EVENTS } from "@/lib/tracking/events";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const headerStyle = css({ display: "flex", flexDirection: "column", gap: "1" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const captionStyle = css({ textStyle: "caption", color: "text.muted" });
const sectionTitleStyle = css({ textStyle: "subtitle", color: "text", mb: "2" });
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
const bodyStyle = css({
  mt: "2",
  textStyle: "body",
  color: "text",
  overflow: "hidden",
  display: "-webkit-box",
  lineClamp: 2,
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

function formatDay(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

export function InboxCard({ item }: { item: RealtorInboxItemDto }) {
  const meta = BROKERAGE_TARGET_STATUS_META[item.status];
  return (
    <Link
      href={`/realtor/requests/${item.targetId}`}
      className={cardLinkStyle}
      data-testid="realtor-request-card"
      data-target-id={item.targetId}
      data-target-status={item.status}
      data-unit-label={item.place.unitLabel}
    >
      <Card padding="md" interactive>
        <CardHeader
          title={formatBrokeragePlace(item.place)}
          aside={<Badge tone={meta.tone}>{meta.label}</Badge>}
        />
        {item.message ? <p className={bodyStyle}>{item.message}</p> : null}
        <p className={metaRowStyle}>
          <span data-testid="realtor-request-distance">{formatDistanceKm(item.distanceKm)}</span>
          <span>· {item.place.buildingAddress}</span>
          <span>· {item.landlord.name}</span>
          <span>· {formatDay(item.createdAt)}</span>
        </p>
      </Card>
    </Link>
  );
}

export function RealtorInboxView({ initialData }: { initialData: RealtorInboxResult }) {
  const { track } = useTrack();
  const { data = initialData } = useRealtorInbox(initialData);

  const fresh = data.requests.filter((item) => !isRespondedTarget(item.status));
  const responded = data.requests.filter((item) => isRespondedTarget(item.status));

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track(TRACK_EVENTS.BROKERAGE_INBOX_VIEW, {
      total: data.requests.length,
      pending: fresh.length,
      accepted: responded.filter((item) => item.status === "ACCEPTED").length,
    });
  }, [track, data.requests.length, fresh.length, responded]);

  return (
    <main className={pageStyle}>
      <header className={headerStyle}>
        <h1 className={titleStyle}>중개 요청</h1>
        <p className={captionStyle}>
          {data.realtor.officeName} · {data.realtor.address} · 반경 {data.realtor.radiusKm}km
        </p>
        <p className={captionStyle}>
          사무소에서 활동반경 안에 있는 공실 요청이 거리순으로 들어옵니다.
        </p>
      </header>

      <section>
        <h2 className={sectionTitleStyle} data-testid="realtor-inbox-new">
          새 요청 {fresh.length}
        </h2>
        {fresh.length === 0 ? (
          <p className={emptyStyle} data-testid="realtor-inbox-empty">
            아직 받은 중개 요청이 없습니다.
            <br />
            활동반경 안에 공실이 나오면 바로 여기에 꽂힙니다.
          </p>
        ) : (
          <div className={listStyle}>
            {fresh.map((item) => (
              <InboxCard key={item.targetId} item={item} />
            ))}
          </div>
        )}
      </section>

      {responded.length > 0 ? (
        <section>
          <h2 className={sectionTitleStyle} data-testid="realtor-inbox-responded">
            응답함 {responded.length}
          </h2>
          <div className={listStyle}>
            {responded.map((item) => (
              <InboxCard key={item.targetId} item={item} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
