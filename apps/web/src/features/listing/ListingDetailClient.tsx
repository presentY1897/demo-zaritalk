"use client";

/**
 * 매물 상세의 **클라이언트 조각들** (T3.3).
 *
 * 상세 화면 본체는 서버 컴포넌트다 — 검색 크롤러와 카카오톡 링크 미리보기가 JS 없이 읽어야 하고
 * (T1.8 공개 고지서와 같은 판단), `generateMetadata` 는 서버 컴포넌트에서만 쓸 수 있다.
 * 그래서 **상호작용이 필요한 세 조각만** 클라이언트로 내렸다:
 *
 * | 조각 | 하는 일 |
 * |---|---|
 * | `ListingDetailTracker` | 화면 노출 1회 `listing_detail_view` |
 * | `ListingInquiryButton` | 문의 시트(더미) — 실제 발송은 없다 |
 * | `ListingCommuteButton` | 「내 근무지까지」 — **[T3.5](../../../../docs/tasks/t3.5-commute.md) 자리** |
 */
import { Badge, Button, Sheet, useTrack } from "@zari/ui";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { css } from "styled-system/css";
import type { WorkplaceDto } from "@/features/workplace/types";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import type { DealTypeValue, ListingCommuteDto, ListingStatusValue } from "./types";

const rowStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "2",
  py: "2",
  textStyle: "body",
  color: "text.muted",
});
const rowValueStyle = css({ color: "text", fontFamily: "numeric" });
const noteStyle = css({ textStyle: "caption", color: "text.muted", mt: "2" });
const warnStyle = css({ textStyle: "caption", color: "warning.text", mt: "3" });
const listStyle = css({ display: "flex", flexDirection: "column", gap: "2" });
const itemStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  px: "3",
  py: "2.5",
  rounded: "field",
  bg: "bg.subtle",
  textStyle: "body",
  color: "text",
});
const linkButtonStyle = css({ textDecoration: "none", display: "block" });

/* ------------------------------------------------------------------ */

export function ListingDetailTracker({
  listingId,
  status,
  dealType,
  loggedIn,
}: {
  listingId: string;
  status: ListingStatusValue;
  dealType: DealTypeValue;
  loggedIn: boolean;
}) {
  const { track } = useTrack();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track(TRACK_EVENTS.LISTING_DETAIL_VIEW, { listingId, status, dealType, loggedIn });
  }, [track, listingId, status, dealType, loggedIn]);

  return null;
}

/* ------------------------------------------------------------------ */

export type ListingInquiryButtonProps = {
  listingId: string;
  dealType: DealTypeValue;
  /** 임대인 직접 등록인지 중개인 등록인지 — 문구만 바뀐다(이름은 담지 않는다) */
  role: "LANDLORD" | "REALTOR";
  priceLabel: string;
  title: string;
};

/**
 * 문의 — **더미다.** 실제 메시지·전화는 나가지 않는다.
 *
 * 진짜 문의 채널을 붙이려면 임대인·중개인 연락처를 공개 화면에 실어야 하는데, 그건
 * 개인정보이고 이 페이지는 색인 대상이다. 데모에서는 "문의가 어떻게 생겼는가" 까지만 보여 주고
 * 실제 연결은 T3.6(중개 요청)·T3.7(중개인 수신함) 쪽 채널로 넘긴다.
 */
export function ListingInquiryButton({
  listingId,
  dealType,
  role,
  priceLabel,
  title,
}: ListingInquiryButtonProps) {
  const { track } = useTrack();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        fullWidth
        size="lg"
        onClick={() => {
          setOpen(true);
          track(TRACK_EVENTS.LISTING_INQUIRY_CLICK, { listingId, dealType });
        }}
        data-testid="listing-inquiry"
      >
        문의하기
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="매물 문의"
        description={title}
        footer={
          // 라벨을 "닫기" 로 두면 시트 헤더의 × 버튼(aria-label "닫기")과 이름이 겹친다
          <Button fullWidth variant="secondary" onClick={() => setOpen(false)}>
            확인
          </Button>
        }
      >
        <p className={rowStyle}>
          <span>조건</span>
          <span className={rowValueStyle}>{priceLabel}</span>
        </p>
        <p className={rowStyle}>
          <span>등록</span>
          <span className={rowValueStyle}>
            {role === "REALTOR" ? "중개인 등록 매물" : "임대인 직접 등록"}
          </span>
        </p>
        <p className={rowStyle}>
          <span>연락 방법</span>
          <span className={rowValueStyle}>앱 내 메시지(준비 중)</span>
        </p>
        <p className={warnStyle} data-testid="listing-inquiry-dummy">
          데모 화면입니다. 문의는 실제로 전송되지 않고 연락처도 공개되지 않습니다.
        </p>
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------------ */

export type ListingCommuteButtonProps = {
  listingId: string;
  loggedIn: boolean;
  /** 로그인 세입자의 근무지(T3.4). 비로그인·세입자 아님이면 빈 배열 */
  workplaces: WorkplaceDto[];
  /** `CommuteCache` 에 이미 있는 값만. 지금은 언제나 비어 있다(T3.5 가 채운다) */
  commutes: ListingCommuteDto[];
};

/**
 * 「내 근무지까지」 — **T3.5 가 실제 조회를 붙일 자리**다.
 *
 * 지금 하는 일은 세 갈래뿐이다.
 *
 * | 상태 | 버튼이 하는 일 |
 * |---|---|
 * | 비로그인 | `/login` 으로 (통근시간을 보려면 근무지가 필요하고 근무지는 계정에 붙는다) |
 * | 로그인·근무지 0곳 | `/tenant/workplaces` 로 (T3.4 화면) |
 * | 로그인·근무지 있음 | 시트를 열어 근무지별 **캐시된 값**을 보여 준다 |
 *
 * **외부 API 를 부르지 않는다.** T3.5 가 `POST /api/commute` 를 붙이면 시트의
 * 「조회하기」 자리(지금은 안내 문구)가 그 호출로 바뀌고, 결과는 같은 `ListingCommuteDto`
 * 모양으로 이 컴포넌트에 그대로 들어온다.
 */
export function ListingCommuteButton({
  listingId,
  loggedIn,
  workplaces,
  commutes,
}: ListingCommuteButtonProps) {
  const { track } = useTrack();
  const [open, setOpen] = useState(false);

  const state = !loggedIn ? "anonymous" : workplaces.length === 0 ? "no-workplace" : "ready";
  const byWorkplace = new Map(commutes.map((commute) => [commute.workplaceId, commute]));

  if (state !== "ready") {
    const href =
      state === "anonymous"
        ? `/login?from=listing&listing=${encodeURIComponent(listingId)}`
        : "/tenant/workplaces";

    return (
      <Link
        href={href}
        className={linkButtonStyle}
        data-testid="listing-commute-cta"
        data-commute-state={state}
        onClick={() => track(TRACK_EVENTS.LISTING_COMMUTE_CLICK, { listingId, state })}
      >
        <Button fullWidth variant="secondary" size="lg" type="button">
          {state === "anonymous" ? "로그인하고 내 근무지까지 보기" : "근무지 등록하고 통근시간 보기"}
        </Button>
      </Link>
    );
  }

  return (
    <>
      <Button
        fullWidth
        variant="secondary"
        size="lg"
        data-testid="listing-commute-cta"
        data-commute-state={state}
        onClick={() => {
          setOpen(true);
          track(TRACK_EVENTS.LISTING_COMMUTE_CLICK, { listingId, state });
        }}
      >
        내 근무지까지 얼마나 걸릴까요?
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="내 근무지까지"
        description="등록한 근무지 기준입니다."
        footer={
          // 라벨을 "닫기" 로 두면 시트 헤더의 × 버튼(aria-label "닫기")과 이름이 겹친다
          <Button fullWidth variant="secondary" onClick={() => setOpen(false)}>
            확인
          </Button>
        }
      >
        <div className={listStyle}>
          {workplaces.map((workplace) => {
            const commute = byWorkplace.get(workplace.id);
            const minutes = commute?.transitMinutes ?? commute?.drivingMinutes ?? null;
            return (
              <div
                key={workplace.id}
                className={itemStyle}
                data-testid="listing-commute-workplace"
                data-workplace-id={workplace.id}
              >
                <span>{workplace.label}</span>
                {minutes === null ? (
                  <Badge tone="neutral">아직 조회 전</Badge>
                ) : (
                  <Badge tone="info">
                    {commute?.transitMinutes !== null && commute?.transitMinutes !== undefined
                      ? "대중교통"
                      : "자동차"}{" "}
                    {minutes}분
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
        <p className={noteStyle}>
          통근시간 조회는 T3.5에서 붙습니다. 지금은 이미 저장된 값만 보여 줍니다.
        </p>
      </Sheet>
    </>
  );
}
