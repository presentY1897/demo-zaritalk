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
 * | `ListingCommuteButton` | 「내 근무지까지」 — 시트에서 근무지별 통근시간을 조회한다([T3.5](../../../../docs/tasks/t3.5-commute.md)) |
 */
import { Badge, Button, Sheet, useTrack } from "@zari/ui";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { css } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { lookupCommute } from "@/features/commute/api";
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
  flexDirection: "column",
  gap: "2",
  px: "3",
  py: "2.5",
  rounded: "field",
  bg: "bg.subtle",
  textStyle: "body",
  color: "text",
});
const itemHeadStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  minH: "32px",
});
const itemLabelStyle = css({ minW: "0", wordBreak: "break-word" });
const badgeRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "1.5" });
const itemNoteStyle = css({ textStyle: "caption", color: "text.muted" });
const itemErrorStyle = css({ textStyle: "caption", color: "danger.text" });
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
  /** 캐시 키의 한쪽 — `POST /api/commute` 가 (호실, 근무지) 쌍으로 저장한다 (T3.5) */
  unitId: string;
  loggedIn: boolean;
  /** 로그인 세입자의 근무지(T3.4). 비로그인·세입자 아님이면 빈 배열 */
  workplaces: WorkplaceDto[];
  /** `CommuteCache` 에 **이미 있는 값**. 여기 없는 근무지는 시트에서 조회한다 */
  commutes: ListingCommuteDto[];
};

/** 조회한 시각을 "9월 3일 기준" 으로. 시트는 열린 뒤에만 렌더돼 하이드레이션 불일치가 없다 */
function fetchedAtLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}월 ${date.getDate()}일 기준`;
}

/**
 * 「내 근무지까지」 (T3.3 자리 · T3.5 가 실제 조회를 붙였다).
 *
 * | 상태 | 버튼이 하는 일 |
 * |---|---|
 * | 비로그인 | `/login` 으로 (통근시간을 보려면 근무지가 필요하고 근무지는 계정에 붙는다) |
 * | 로그인·근무지 0곳 | `/tenant/workplaces` 로 (T3.4 화면) |
 * | 로그인·근무지 있음 | 시트를 열어 근무지별 값을 보여 주고, 없으면 **행마다 「조회」** |
 *
 * ## 왜 시트를 열 때 한꺼번에 조회하지 않나
 *
 * 조회 한 번이 **외부 API 호출**이다(자동차는 카카오모빌리티 실호출). 근무지가 5곳이면 시트를
 * 여는 것만으로 5번이 나간다. 그래서 **사용자가 누른 근무지만** 부른다 — 대부분 근무지가
 * 한 곳이라 클릭 한 번이고, 한 번 조회한 값은 `CommuteCache` 에 남아 목록 배지로 재사용된다.
 *
 * ## 실패해도 시트는 살아 있다
 *
 * 한쪽 이동수단만 실패하면 나머지 값이 그대로 뜨고(`transitMinutes`·`drivingMinutes` 각각 null
 * 허용), 둘 다 실패하면 그 행에만 문구가 붙는다. 다른 근무지 행과 화면 전체는 그대로다.
 */
export function ListingCommuteButton({
  listingId,
  unitId,
  loggedIn,
  workplaces,
  commutes,
}: ListingCommuteButtonProps) {
  const { track } = useTrack();
  const [open, setOpen] = useState(false);
  /** 서버가 준 캐시 + 이 시트에서 새로 조회한 값 */
  const [results, setResults] = useState<Record<string, ListingCommuteDto>>(() =>
    Object.fromEntries(commutes.map((commute) => [commute.workplaceId, commute])),
  );
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const state = !loggedIn ? "anonymous" : workplaces.length === 0 ? "no-workplace" : "ready";

  const request = useCallback(
    async (workplaceId: string) => {
      setPending((prev) => ({ ...prev, [workplaceId]: true }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[workplaceId];
        return next;
      });

      try {
        const response = await lookupCommute({ unitId, workplaceId });
        setResults((prev) => ({ ...prev, [workplaceId]: response.commute }));
        track(TRACK_EVENTS.COMMUTE_LOOKUP_COMPLETE, {
          unitId,
          workplaceId,
          transitMinutes: response.commute.transitMinutes,
          drivingMinutes: response.commute.drivingMinutes,
          cached: response.cached,
          mocked: response.commute.mockModes,
        });
      } catch (error) {
        const message =
          error instanceof ApiError ? error.message : "통근시간을 불러오지 못했습니다.";
        setErrors((prev) => ({ ...prev, [workplaceId]: message }));
        track(TRACK_EVENTS.COMMUTE_LOOKUP_FAIL, {
          unitId,
          workplaceId,
          code: error instanceof ApiError ? error.code : "NETWORK",
        });
      } finally {
        setPending((prev) => ({ ...prev, [workplaceId]: false }));
      }
    },
    [track, unitId],
  );

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
            const commute = results[workplace.id];
            const loading = pending[workplace.id] === true;
            const error = errors[workplace.id];
            const transitMocked = commute?.mockModes.includes("transit") ?? false;

            return (
              <div
                key={workplace.id}
                className={itemStyle}
                data-testid="listing-commute-workplace"
                data-workplace-id={workplace.id}
                data-commute-loaded={commute ? "true" : "false"}
              >
                <div className={itemHeadStyle}>
                  <span className={itemLabelStyle}>{workplace.label}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={loading}
                    onClick={() => void request(workplace.id)}
                    data-testid="listing-commute-fetch"
                  >
                    {commute ? "다시 조회" : "조회"}
                  </Button>
                </div>

                {commute ? (
                  <>
                    <div className={badgeRowStyle} data-testid="listing-commute-result">
                      {commute.transitMinutes === null ? (
                        <Badge tone="neutral">대중교통 조회 실패</Badge>
                      ) : (
                        <Badge tone="info" data-testid="listing-commute-transit">
                          대중교통 {commute.transitMinutes}분
                        </Badge>
                      )}
                      {commute.drivingMinutes === null ? (
                        <Badge tone="neutral">자동차 조회 실패</Badge>
                      ) : (
                        <Badge tone="info" data-testid="listing-commute-driving">
                          자동차 {commute.drivingMinutes}분
                        </Badge>
                      )}
                      {transitMocked ? (
                        <Badge tone="warning" data-testid="listing-commute-mock">
                          대중교통 모의값
                        </Badge>
                      ) : null}
                    </div>
                    <p className={itemNoteStyle}>{fetchedAtLabel(commute.fetchedAt)}</p>
                  </>
                ) : null}

                {error ? (
                  <p className={itemErrorStyle} role="alert" data-testid="listing-commute-error">
                    {error}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        <p className={noteStyle}>
          자동차는 카카오모빌리티 실시간 경로, 대중교통은 거리 기반 모의 추정값입니다(ODsay 미연동).
          조회한 값은 저장돼 매물 목록의 통근 배지로도 쓰입니다.
        </p>
      </Sheet>
    </>
  );
}
