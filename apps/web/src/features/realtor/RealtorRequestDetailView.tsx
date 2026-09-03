"use client";

/**
 * `/realtor/requests/[id]` 중개 요청 상세 (T3.7) — **열람 표시 · 수락 · 거절**.
 *
 * ## 화면을 열면 열람(`VIEWED`)이 된다
 *
 * 마운트 직후 `POST /api/brokerage-targets/[id]/respond {"status":"VIEWED"}` 를 한 번 보낸다.
 * 열람 표시는 **멱등**이라 이미 열어봤거나 응답을 마친 요청에 다시 보내도 200 이고
 * 아무 것도 바뀌지 않는다(전이표는 `features/brokerage/status.ts`).
 *
 * 서버 컴포넌트 렌더 중에 표시하지 않은 이유: 링크 프리페치만으로도 "열람" 이 찍힐 수 있어
 * 임대인이 보는 「열람 n」 이 거짓말이 된다. **사람이 실제로 연 순간**에만 찍히도록 클라이언트에서 보낸다.
 *
 * ## 수락하면 그 자리에서 매물 등록이 열린다
 *
 * 수락은 타겟을 `ACCEPTED` 로 옮기고(+`respondedAt`), 첫 수락이면 요청을 `MATCHED` 로 올리며,
 * 임대인에게 알림톡 시뮬을 남긴다. 그 순간 T3.1 의 권한 판정(`hasAcceptedBrokerage`)이
 * **코드 변경 없이** 통과해 `/landlord/units/[id]/listing` 에서 매물을 올릴 수 있다 —
 * 그래서 「매물 등록」 버튼도 그 화면으로 보낸다(중개인 전용 화면을 새로 만들지 않았다).
 */
import { Badge, Button, Card, CardHeader, useTrack } from "@zari/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { css } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { formatManwon } from "@/features/landlord/format";
import { useRespondBrokerageTarget } from "@/features/brokerage/hooks";
import {
  BROKERAGE_TARGET_STATUS_META,
  formatBrokeragePlace,
  formatDistanceKm,
  isRespondedTarget,
} from "@/features/brokerage/status";
import { LISTING_STATUS_META } from "@/features/listing/status";
import type { RealtorInboxItemDto } from "@/features/brokerage/types";
import { TRACK_EVENTS } from "@/lib/tracking/events";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const backStyle = css({ textStyle: "caption", color: "text.brand", textDecoration: "none" });
const titleRowStyle = css({ display: "flex", alignItems: "center", gap: "2", flexWrap: "wrap" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const captionStyle = css({ textStyle: "caption", color: "text.muted" });
const rowStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "3",
  py: "2",
  textStyle: "body",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  _last: { borderBottomWidth: "0" },
});
const keyStyle = css({ color: "text.muted" });
const valueStyle = css({ color: "text" });
const messageStyle = css({ textStyle: "body", color: "text", whiteSpace: "pre-wrap" });
const actionRowStyle = css({ display: "flex", gap: "2" });
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
  bg: "success.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "success.border",
  rounded: "field",
  p: "3",
  textStyle: "caption",
  color: "text",
});
const hintStyle = css({ textStyle: "caption", color: "text.muted", mt: "2" });
const phoneLinkStyle = css({ color: "text.brand", textDecoration: "none" });

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

export function RealtorRequestDetailView({ initialItem }: { initialItem: RealtorInboxItemDto }) {
  const router = useRouter();
  const { track } = useTrack();
  const respond = useRespondBrokerageTarget();
  const [item, setItem] = useState(initialItem);

  const meta = BROKERAGE_TARGET_STATUS_META[item.status];
  const responded = isRespondedTarget(item.status);

  // 화면을 연 순간에만 열람을 표시한다(프리페치로는 찍히지 않는다). 멱등이라 실패해도 조용히 넘어간다
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;

    track(TRACK_EVENTS.BROKERAGE_REQUEST_VIEW, {
      targetId: initialItem.targetId,
      requestId: initialItem.requestId,
      status: initialItem.status,
      distanceKm: initialItem.distanceKm,
    });

    if (initialItem.status !== "SENT") return;
    respond
      .mutateAsync({ targetId: initialItem.targetId, input: { status: "VIEWED" } })
      .then((result) => {
        setItem(result.target);
        router.refresh();
      })
      .catch(() => {
        /* 열람 표시는 화면의 본질이 아니다 — 실패해도 상세는 그대로 읽힌다 */
      });
    // 마운트 1회만 — 의존성에 mutation 을 넣으면 매 렌더마다 다시 돈다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(status: "ACCEPTED" | "DECLINED") {
    if (respond.isPending) return;
    try {
      const result = await respond.mutateAsync({ targetId: item.targetId, input: { status } });
      setItem(result.target);
      track(TRACK_EVENTS.BROKERAGE_RESPOND_COMPLETE, {
        targetId: item.targetId,
        requestId: item.requestId,
        status,
        matched: result.matched,
      });
      router.refresh();
    } catch {
      /* 실패 문구는 아래 errorMessage 로 표시된다 */
    }
  }

  return (
    <main className={pageStyle}>
      <Link href="/realtor" className={backStyle}>
        ← 중개 요청
      </Link>

      <header>
        <div className={titleRowStyle}>
          <h1 className={titleStyle}>{formatBrokeragePlace(item.place)}</h1>
          <Badge tone={meta.tone} size="md" data-testid="realtor-request-status">
            {meta.label}
          </Badge>
        </div>
        <p className={captionStyle}>{item.place.buildingAddress}</p>
      </header>

      <Card padding="md" data-testid="realtor-request-detail">
        <CardHeader title="요청 내용" />
        {item.message ? (
          <p className={messageStyle}>{item.message}</p>
        ) : (
          <p className={captionStyle}>남긴 메시지가 없습니다.</p>
        )}
        <div className={css({ mt: "3" })}>
          <div className={rowStyle}>
            <span className={keyStyle}>사무소에서</span>
            <span className={valueStyle} data-testid="realtor-request-distance">
              {formatDistanceKm(item.distanceKm)}
            </span>
          </div>
          <div className={rowStyle}>
            <span className={keyStyle}>호실</span>
            <span className={valueStyle}>
              {[
                item.place.unitLabel,
                item.place.floor != null ? `${item.place.floor}층` : null,
                item.place.areaM2 != null ? `${item.place.areaM2}㎡` : null,
                item.place.rooms != null ? `방 ${item.place.rooms}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <div className={rowStyle}>
            <span className={keyStyle}>임대인</span>
            <span className={valueStyle}>
              {item.landlord.name}
              {item.landlord.phone ? (
                <>
                  {" · "}
                  <a
                    href={`tel:${item.landlord.phone}`}
                    className={phoneLinkStyle}
                    data-testid="realtor-landlord-phone"
                  >
                    {item.landlord.phone}
                  </a>
                </>
              ) : null}
            </span>
          </div>
        </div>
        {!item.landlord.phone ? (
          <p className={hintStyle}>수락하면 임대인 연락처가 열립니다.</p>
        ) : null}
      </Card>

      {responded ? (
        <p className={noticeStyle} role="status" data-testid="realtor-responded">
          {item.status === "ACCEPTED"
            ? "수락했습니다. 임대인에게 알림이 갔고, 이 호실 매물을 올릴 수 있습니다."
            : "거절했습니다. 이 요청은 더 이상 응답할 수 없습니다."}
        </p>
      ) : (
        <div className={actionRowStyle}>
          <Button
            fullWidth
            loading={respond.isPending}
            onClick={() => send("ACCEPTED")}
            data-testid="realtor-accept"
          >
            수락
          </Button>
          <Button
            fullWidth
            variant="secondary"
            loading={respond.isPending}
            onClick={() => send("DECLINED")}
            data-testid="realtor-decline"
          >
            거절
          </Button>
        </div>
      )}

      {item.status === "ACCEPTED" ? (
        <Card padding="md" data-testid="realtor-listing-slot">
          <CardHeader
            title="매물"
            aside={
              item.listing ? (
                <Badge tone={LISTING_STATUS_META[item.listing.status].tone}>
                  {LISTING_STATUS_META[item.listing.status].label}
                </Badge>
              ) : null
            }
          />
          {item.listing ? (
            <>
              <div className={rowStyle}>
                <span className={keyStyle}>
                  {item.listing.dealType === "JEONSE" ? "전세" : "월세"}
                </span>
                <span className={valueStyle}>
                  보증금 {formatManwon(item.listing.deposit)}
                  {item.listing.monthlyRent > 0
                    ? ` / 월 ${formatManwon(item.listing.monthlyRent)}`
                    : ""}
                </span>
              </div>
              <p className={hintStyle}>
                {item.listing.mine ? "내가 올린 매물입니다." : `등록: ${item.listing.listedByName}`}
              </p>
            </>
          ) : (
            <p className={captionStyle}>
              {item.canCreateListing
                ? "아직 올라간 매물이 없습니다. 조건을 적어 바로 등록할 수 있습니다."
                : item.listingBlockedReason}
            </p>
          )}
          <div className={css({ mt: "3" })}>
            <Link href={`/landlord/units/${item.place.unitId}/listing`}>
              <Button
                fullWidth
                variant={item.listing ? "secondary" : "primary"}
                disabled={!item.canCreateListing && !item.listing?.mine}
                data-testid="realtor-listing-manage"
              >
                {item.listing?.mine ? "매물 관리" : "매물 등록"}
              </Button>
            </Link>
          </div>
        </Card>
      ) : null}

      {respond.error ? (
        <p className={errorStyle} role="alert">
          {errorMessage(respond.error)}
        </p>
      ) : null}
    </main>
  );
}
