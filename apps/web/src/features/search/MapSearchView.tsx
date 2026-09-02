"use client";

/**
 * `/search` 지도 탐색 (T3.2) — 상단 카카오맵(가격 핀) + 하단 스냅 시트 리스트.
 *
 * ## 지도와 리스트를 어떻게 붙여 놨나
 *
 * 절대 위치 오버레이 대신 **`position: sticky` 지도 + 그 아래로 흐르는 시트**다.
 * 480px 셸(D5)은 탭바가 있을 때와 없을 때 높이가 달라서(비로그인은 탭바가 없다) 화면 전체를
 * 절대 좌표로 잡으면 두 경우 중 하나가 반드시 어긋난다. sticky 는 문서 흐름 그대로라
 * 두 경우 모두 자연스럽고, iOS 주소창이 접히며 `dvh` 가 변해도 깨지지 않는다.
 *
 * 스냅은 **지도 높이 3단**이다(`SNAP_HEIGHTS`). 시트 손잡이를 누르거나 위아래로 끌면 바뀐다.
 * 시트 머리는 지도 바로 아래에 sticky 로 붙어 있어 목록을 스크롤해도 손잡이가 따라온다.
 *
 * ## 지도 이동 → 재조회를 줄이는 4겹
 *
 * 1. 카카오 **`idle`** 이벤트만 듣는다 — 끌기가 끝난 뒤 한 번 (`KakaoMap`)
 * 2. **350ms 디바운스** — 연속으로 멈췄다 다시 끄는 동작을 한 번으로 접는다 (이 파일)
 * 3. **이미 받아 온 영역 안이면 서버에 묻지 않는다** — `needsRefetch`. 화면에 보이는 것만
 *    `withinBounds` 로 골라 낸다 (`features/search/bounds.ts`)
 * 4. 그래도 물어야 하면 **화면보다 넓게**(`expandBounds`) 받아 다음 팬을 미리 덮는다.
 *    좌표는 소수 4자리로 끊어(`roundBounds`) 손 떨림 수준의 이동이 같은 캐시 키가 되게 한다
 *
 * 그 결과 "지도를 조금 움직였다" 로는 네트워크가 나가지 않고, 실제로 새 영역에 들어갔을 때만 나간다.
 */
import { Badge, Button, Card, useTrack } from "@zari/ui";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { css, cx } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import {
  formatArea,
  formatAvailableFrom,
  formatFloor,
  formatRooms,
} from "@/features/listing/price";
import type { WorkplaceDto } from "@/features/workplace/types";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import {
  boundsOfPoints,
  centerOfBounds,
  expandBounds,
  formatBounds,
  needsRefetch,
  roundBounds,
  withinBounds,
  type Bounds,
  type LatLng,
} from "./bounds";
import { activeFilterCount, filtersToParams, filterSummary, type SearchFilters } from "./filters";
import { useListingSearch } from "./hooks";
import { KakaoMap, type MapMarker } from "./KakaoMap";
import { SearchFilterSheet } from "./SearchFilterSheet";
import type { ListingSummaryDto, ListingSearchResult } from "./types";

/* ------------------------------------------------------------------ */
/* 스냅                                                                */
/* ------------------------------------------------------------------ */

/** 시트가 얼마나 올라와 있는가 = 지도 높이가 얼마인가 */
const SNAP_ORDER = ["peek", "half", "full"] as const;
type Snap = (typeof SNAP_ORDER)[number];

/** 지도 높이. `full` 은 지도를 완전히 접고 목록만 본다 */
const SNAP_HEIGHTS: Record<Snap, string> = {
  peek: "60dvh",
  half: "42dvh",
  full: "0px",
};

const SNAP_LABEL: Record<Snap, string> = {
  peek: "목록 더 보기",
  half: "목록 더 보기",
  full: "지도 보기",
};

/** 손잡이를 누르면 다음 단계로. `full` 다음은 다시 `peek`(지도로 돌아온다) */
function nextSnap(snap: Snap): Snap {
  const index = SNAP_ORDER.indexOf(snap);
  return SNAP_ORDER[(index + 1) % SNAP_ORDER.length] as Snap;
}

/** 끌기 방향 — 위로 끌면 목록이 커지고(다음), 아래로 끌면 지도가 커진다(이전) */
function snapByDrag(snap: Snap, deltaY: number): Snap {
  const index = SNAP_ORDER.indexOf(snap);
  const moved = deltaY < 0 ? index + 1 : index - 1;
  return SNAP_ORDER[Math.min(SNAP_ORDER.length - 1, Math.max(0, moved))] as Snap;
}

const DEBOUNCE_MS = 350;
const DRAG_THRESHOLD = 24;

/**
 * 헤더 높이. 지도와 시트 손잡이가 이 값만큼 아래에 달라붙는다.
 * 값을 추측하지 않도록 헤더에 `minH` 로 **강제**한다 — 상수와 실제 높이가 어긋날 수 없다.
 */
const HEADER_HEIGHT = "61px";

/* ------------------------------------------------------------------ */
/* 스타일                                                              */
/* ------------------------------------------------------------------ */

const pageStyle = css({ display: "flex", flexDirection: "column", minH: "100dvh" });
const headerStyle = css({
  position: "sticky",
  top: "0",
  zIndex: "sticky",
  display: "flex",
  alignItems: "center",
  gap: "2",
  px: "gutter",
  py: "3",
  // 아래 HEADER_HEIGHT 와 같은 값 — 지도·손잡이가 이 높이만큼 아래에 붙는다
  minH: "61px",
  boxSizing: "border-box",
  bg: "bg.page",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
});
const titleStyle = css({ textStyle: "subtitle", color: "text", mr: "auto" });
const mapWrapStyle = css({ position: "sticky", zIndex: "0" });
const sheetStyle = css({
  position: "relative",
  // 지도 위로 16px 올라타 시트가 "덮고 있다" 는 인상을 준다(둥근 모서리가 지도 위에 걸친다)
  mt: "-16px",
  bg: "bg.card",
  roundedTop: "sheet",
  borderTopWidth: "hairline",
  borderTopStyle: "solid",
  borderTopColor: "border",
  shadow: "sheet",
  minH: "40dvh",
  pb: "section",
});
const handleWrapStyle = css({
  position: "sticky",
  zIndex: "sticky",
  bg: "bg.card",
  roundedTop: "sheet",
  pt: "2",
  px: "gutter",
  pb: "2",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  touchAction: "none",
});
const handleButtonStyle = css({
  display: "block",
  w: "full",
  py: "1.5",
  borderWidth: "0",
  bg: "transparent",
  cursor: "grab",
  _focusVisible: { outline: "2px solid", outlineColor: "border.focus", outlineOffset: "2px" },
});
const grabberStyle = css({ w: "40px", h: "4px", rounded: "pill", bg: "border.strong", mx: "auto" });
const handleTextStyle = css({
  display: "block",
  mt: "1.5",
  textStyle: "caption",
  color: "text.muted",
  textAlign: "center",
});
const summaryRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  px: "gutter",
  py: "3",
});
const countStyle = css({ textStyle: "bodyStrong", color: "text" });
const summaryTextStyle = css({ textStyle: "caption", color: "text.muted", ml: "auto" });
const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  px: "gutter",
  pt: "1",
});
const cardLinkStyle = css({ textDecoration: "none", color: "inherit", display: "block" });
const cardRowStyle = css({ display: "flex", gap: "3" });
const thumbStyle = css({
  w: "84px",
  h: "84px",
  flexShrink: 0,
  rounded: "field",
  objectFit: "cover",
  bg: "bg.subtle",
});
const thumbEmptyStyle = css({
  w: "84px",
  h: "84px",
  flexShrink: 0,
  rounded: "field",
  bg: "bg.subtle",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textStyle: "caption",
  color: "text.muted",
});
const cardBodyStyle = css({ minW: "0", flex: "1" });
const priceStyle = css({ textStyle: "subtitle", color: "text", fontFamily: "numeric" });
const addressStyle = css({
  textStyle: "caption",
  color: "text.muted",
  mt: "0.5",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const specRowStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "1.5",
  mt: "1.5",
  textStyle: "caption",
  color: "text.muted",
});
const badgeRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "1.5", mt: "2" });
const emptyStyle = css({
  mx: "gutter",
  p: "6",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "dashed",
  borderColor: "border",
  textAlign: "center",
  textStyle: "body",
  color: "text.muted",
  display: "flex",
  flexDirection: "column",
  gap: "3",
  alignItems: "center",
});
const noticeStyle = css({
  mx: "gutter",
  mb: "2",
  px: "3",
  py: "2",
  rounded: "field",
  bg: "warning.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "warning.border",
  textStyle: "caption",
  color: "warning.text",
});
const errorStyle = css({
  mx: "gutter",
  mb: "2",
  px: "3",
  py: "2",
  rounded: "field",
  bg: "danger.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "danger.border",
  textStyle: "caption",
  color: "danger.text",
});
const commuteRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  px: "gutter",
  pb: "2",
  textStyle: "caption",
  color: "text.muted",
});
const selectStyle = css({
  h: "32px",
  px: "2",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  textStyle: "caption",
  color: "text",
  _focusVisible: { outline: "2px solid", outlineColor: "border.focus", outlineOffset: "1px" },
});

/* ------------------------------------------------------------------ */

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "매물을 불러오지 못했습니다.";
}

/** 통근 배지 — **T3.5 가 채운다.** 캐시 히트분만 켜지고, 그 전에는 자리만 지킨다 */
function CommuteBadge({ listing }: { listing: ListingSummaryDto }) {
  const commute = listing.commute;
  if (!commute) return null;

  const minutes = commute.transitMinutes ?? commute.drivingMinutes;
  if (minutes === null) return null;

  const mode = commute.transitMinutes !== null ? "대중교통" : "자동차";
  return (
    <Badge tone="info" data-testid="listing-commute-badge">
      {commute.workplaceLabel}까지 {mode} {minutes}분
    </Badge>
  );
}

function ListingCard({
  listing,
  selected,
  onSelect,
  commuteRequested,
}: {
  listing: ListingSummaryDto;
  selected: boolean;
  onSelect: (id: string) => void;
  commuteRequested: boolean;
}) {
  const specs = [
    formatRooms(listing.unit.rooms),
    formatArea(listing.unit.areaM2),
    formatFloor(listing.unit.floor),
  ].filter((spec): spec is string => Boolean(spec));

  return (
    <Link
      href={`/listings/${listing.id}`}
      className={cardLinkStyle}
      data-testid="listing-card"
      data-listing-id={listing.id}
      data-selected={selected ? "true" : "false"}
      onClick={() => onSelect(listing.id)}
    >
      <Card padding="md" interactive>
        <div className={cardRowStyle}>
          {listing.photo ? (
            /* 사진은 외부 URL(T3.1 이 URL 입력이다)이라 `next/image` 를 쓰지 않는다 —
               도메인을 알 수 없어 `images.remotePatterns` 를 적을 수 없고,
               `next.config.ts` 는 이 task 소유가 아니다. */
            <img className={thumbStyle} src={listing.photo} alt="" loading="lazy" />
          ) : (
            <div className={thumbEmptyStyle} aria-hidden>
              사진 없음
            </div>
          )}
          <div className={cardBodyStyle}>
            <p className={priceStyle} data-testid="listing-card-price">
              {listing.priceLabel}
            </p>
            <p className={addressStyle}>
              {listing.building.name} {listing.unit.label} ·{" "}
              {listing.building.roadAddress ?? listing.building.address}
            </p>
            {specs.length > 0 ? (
              <p className={specRowStyle}>
                {specs.map((spec) => (
                  <span key={spec}>{spec}</span>
                ))}
              </p>
            ) : null}
            <div className={badgeRowStyle}>
              <Badge tone={listing.dealType === "JEONSE" ? "brand" : "info"}>
                {listing.dealType === "JEONSE" ? "전세" : "월세"}
              </Badge>
              <Badge tone="neutral">{formatAvailableFrom(listing.availableFrom)}</Badge>
              <CommuteBadge listing={listing} />
              {commuteRequested && !listing.commute ? (
                <Badge tone="neutral" data-testid="listing-commute-empty">
                  통근시간 미조회
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

/* ------------------------------------------------------------------ */

export type MapSearchViewProps = {
  /** 서버 컴포넌트가 읽어 온 첫 결과 */
  initialResult: ListingSearchResult;
  /** 첫 결과의 캐시 키(서버·클라이언트가 같은 규칙으로 만든다) */
  initialKey: string;
  initialFilters: SearchFilters;
  initialBounds: Bounds | null;
  /** 로그인 세입자의 근무지 목록. 비로그인·세입자 아님이면 빈 배열 (T3.5 자리) */
  workplaces: WorkplaceDto[];
  loggedIn: boolean;
};

export function MapSearchView({
  initialResult,
  initialKey,
  initialFilters,
  initialBounds,
  workplaces,
  loggedIn,
}: MapSearchViewProps) {
  const { track } = useTrack();

  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [queryBounds, setQueryBounds] = useState<Bounds | null>(initialBounds);
  const [viewport, setViewport] = useState<Bounds | null>(initialBounds);
  const [workplaceId, setWorkplaceId] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snap>("half");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<LatLng | null>(null);

  const queryInput = useMemo(
    () => ({ bounds: queryBounds, filters, limit: initialResult.limit, workplaceId }),
    [queryBounds, filters, initialResult.limit, workplaceId],
  );
  const query = useListingSearch(queryInput, { initialKey, initialData: initialResult });
  const result = query.data ?? initialResult;

  /** 화면에 실제로 보이는 매물 — 서버에서 받은 것 중 지금 영역 안의 것만 */
  const visible = useMemo(() => {
    if (!viewport) return result.listings;
    return result.listings.filter((listing) => withinBounds(viewport, listing.building));
  }, [result.listings, viewport]);

  // 재조회 판정에 쓰는 최신값들 — effect 의존성을 늘리지 않으려고 ref 로 든다
  const fetchedRef = useRef<{ bounds: Bounds | null; truncated: boolean }>({
    bounds: initialBounds,
    truncated: initialResult.truncated,
  });
  fetchedRef.current = { bounds: queryBounds, truncated: result.truncated };
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  /** 지도가 멈췄다 — 350ms 뒤에 한 번만 반영한다 */
  const handleIdle = useCallback(
    (raw: Bounds) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const next = roundBounds(raw);
        setViewport((prev) =>
          prev && formatBounds(prev) === formatBounds(next) ? prev : next,
        );

        const refetch = needsRefetch({
          fetchedBounds: fetchedRef.current.bounds,
          truncated: fetchedRef.current.truncated,
          viewport: next,
          filtersChanged: false,
        });
        if (refetch) setQueryBounds(expandBounds(next));

        track(TRACK_EVENTS.LISTING_MAP_MOVE, {
          refetched: refetch,
          truncated: fetchedRef.current.truncated,
          count: visibleRef.current.length,
        });
      }, DEBOUNCE_MS);
    },
    [track],
  );

  /** 필터는 지금 보고 있는 영역 그대로 다시 묻는다 */
  const applyFilters = useCallback(
    (next: SearchFilters) => {
      setFilters(next);
      setQueryBounds(viewport ? expandBounds(viewport) : null);
      track(TRACK_EVENTS.LISTING_FILTER_CHANGE, {
        dealType: next.dealType,
        depositMax: next.depositMax,
        rentMax: next.rentMax,
        count: visible.length,
      });
    },
    [track, viewport, visible.length],
  );

  /** 필터·영역을 주소창에만 반영한다 — 네비게이션을 일으키지 않아 지도가 다시 그려지지 않는다 */
  useEffect(() => {
    const params = new URLSearchParams(filtersToParams(filters));
    if (viewport) params.set("bounds", formatBounds(viewport));
    const search = params.toString();
    window.history.replaceState(null, "", search ? `/search?${search}` : "/search");
  }, [filters, viewport]);

  // 화면 노출 1회
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    track(TRACK_EVENTS.LISTING_SEARCH_VIEW, {
      count: initialResult.count,
      dealType: initialFilters.dealType,
      filtered: activeFilterCount(initialFilters) > 0,
      loggedIn,
    });
  }, [track, initialResult.count, initialFilters, loggedIn]);

  const markers = useMemo<MapMarker[]>(
    () =>
      visible.map((listing) => ({
        id: listing.id,
        lat: listing.building.lat,
        lng: listing.building.lng,
        label: listing.pinLabel,
        active: listing.id === selectedId,
      })),
    [visible, selectedId],
  );

  /** 지도 첫 중심 — 영역이 있으면 그 중심, 없으면 받아 온 매물 전체가 보이게 */
  const initialFit = useMemo(
    () =>
      initialBounds ??
      boundsOfPoints(initialResult.listings.map((listing) => listing.building)),
    [initialBounds, initialResult.listings],
  );
  const mapCenter = useMemo<LatLng>(
    // 매물이 하나도 없을 때의 기본 중심은 데모 시드 건물(행당해피빌) 근처다
    () => (initialFit ? centerOfBounds(initialFit) : { lat: 37.56152, lng: 127.03648 }),
    [initialFit],
  );

  const handleMarkerClick = useCallback(
    (id: string) => {
      setSelectedId(id);
      setSnap("half");
      // 핀 버튼에도 같은 `data-listing-id` 가 있으므로 **카드만** 집어야 한다
      const card = document.querySelector<HTMLElement>(
        `[data-testid="listing-card"][data-listing-id="${id}"]`,
      );
      card?.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    [],
  );

  const handleCardSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      const listing = visibleRef.current.find((item) => item.id === id);
      if (listing) setFocusPoint({ lat: listing.building.lat, lng: listing.building.lng });
      track(TRACK_EVENTS.LISTING_CARD_CLICK, { listingId: id, source: "list" });
    },
    [track],
  );

  // 손잡이 끌기
  const dragRef = useRef<{ startY: number } | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    dragRef.current = { startY: event.clientY };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 포인터 캡처를 못 잡아도 클릭 동작(다음 단계)은 그대로 된다
    }
  };
  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const deltaY = event.clientY - drag.startY;
    // 끌지 않고 눌렀으면(임계값 미만) 다음 단계로 — 클릭·키보드와 같은 동작
    setSnap((prev) => (Math.abs(deltaY) < DRAG_THRESHOLD ? nextSnap(prev) : snapByDrag(prev, deltaY)));
  };

  const filterCount = activeFilterCount(filters);
  const commuteRequested = Boolean(workplaceId && result.commuteWorkplaceId);

  /**
   * **공개 매물이 하나도 없는 상태**인가 — 영역·필터 없이 물었는데 0건이었다면 DB 자체가 비었다.
   * 이때 "지도를 움직여 보세요" 는 거짓말이다(어디로 움직여도 없다). 시드에 매물이 없는
   * 데모 첫 방문이 정확히 이 경우라(문서 마지막 절) 무엇을 하면 되는지로 문구를 바꾼다.
   */
  const datasetEmpty =
    initialBounds === null && activeFilterCount(initialFilters) === 0 && initialResult.count === 0;

  return (
    <div className={pageStyle} data-testid="search-page" data-snap={snap}>
      <header className={headerStyle}>
        <h1 className={titleStyle}>매물 찾기</h1>
        <Button
          size="sm"
          variant={filterCount > 0 ? "primary" : "secondary"}
          onClick={() => setFilterOpen(true)}
          data-testid="search-filter-open"
        >
          필터{filterCount > 0 ? ` ${filterCount}` : ""}
        </Button>
      </header>

      <div className={mapWrapStyle} style={{ top: HEADER_HEIGHT }}>
        <KakaoMap
          center={mapCenter}
          fitBounds={initialFit}
          focusPoint={focusPoint}
          markers={markers}
          onIdle={handleIdle}
          onMarkerClick={handleMarkerClick}
          height={SNAP_HEIGHTS[snap]}
          testId="search-map"
        />
      </div>

      <section className={sheetStyle} aria-label="매물 목록">
        {/* 손잡이는 지도 바로 아래에 붙는다 — 헤더 + 지도 높이만큼 내려온다 */}
        <div
          className={handleWrapStyle}
          style={{ top: `calc(${HEADER_HEIGHT} + ${SNAP_HEIGHTS[snap]})` }}
        >
          <button
            type="button"
            className={handleButtonStyle}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSnap(nextSnap);
              }
            }}
            data-testid="search-sheet-handle"
            aria-label={`매물 목록 시트 — ${SNAP_LABEL[snap]}`}
          >
            <span className={grabberStyle} aria-hidden />
            <span className={handleTextStyle}>{SNAP_LABEL[snap]}</span>
          </button>
        </div>

        <div className={summaryRowStyle}>
          <span className={countStyle} data-testid="search-result-count">
            {visible.length}개 매물
          </span>
          <span className={summaryTextStyle}>{filterSummary(filters)}</span>
        </div>

        {workplaces.length > 0 ? (
          <div className={commuteRowStyle}>
            <label htmlFor="search-commute-workplace">통근 기준</label>
            <select
              id="search-commute-workplace"
              className={selectStyle}
              value={workplaceId ?? ""}
              onChange={(event) => setWorkplaceId(event.target.value || null)}
              data-testid="search-commute-workplace"
            >
              <option value="">선택 안 함</option>
              {workplaces.map((workplace) => (
                <option key={workplace.id} value={workplace.id}>
                  {workplace.label}
                </option>
              ))}
            </select>
            <span>통근시간 계산은 T3.5에서 붙습니다(지금은 저장된 값만 표시).</span>
          </div>
        ) : null}

        {result.truncated ? (
          <p className={noticeStyle} data-testid="search-truncated">
            이 영역에 매물이 {result.limit}개보다 많습니다. 지도를 확대하면 빠짐없이 볼 수 있어요.
          </p>
        ) : null}

        {query.isError ? (
          <p className={errorStyle} role="alert">
            {errorMessage(query.error)}
          </p>
        ) : null}

        {visible.length === 0 ? (
          <div className={emptyStyle} data-testid="search-empty" data-empty-kind={datasetEmpty ? "dataset" : "area"}>
            {datasetEmpty ? (
              <span>
                아직 등록된 매물이 없습니다.
                <br />
                임대인 계정으로 공실 호실에 매물을 올리면 여기에 바로 나타납니다.
              </span>
            ) : (
              <span>
                이 지역에 공개 중인 매물이 없습니다.
                <br />
                지도를 움직이거나 필터를 넓혀 보세요.
              </span>
            )}
            {filterCount > 0 ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  applyFilters({
                    dealType: null,
                    depositMin: null,
                    depositMax: null,
                    rentMin: null,
                    rentMax: null,
                  })
                }
              >
                필터 초기화
              </Button>
            ) : null}
          </div>
        ) : (
          <div className={listStyle}>
            {visible.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                selected={listing.id === selectedId}
                onSelect={handleCardSelect}
                commuteRequested={commuteRequested}
              />
            ))}
          </div>
        )}
      </section>

      <SearchFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={filters}
        onApply={applyFilters}
      />
    </div>
  );
}
