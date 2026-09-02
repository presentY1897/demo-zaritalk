"use client";

/**
 * `/deals` 실거래가 화면 (T4.4) — 시군구 선택 · 매매/전세/월세 탭 · 단지 검색 · 추이 차트 · 알림 구독.
 *
 * 첫 페이지는 서버 컴포넌트가 `initialPage` 로 넘겨주고, 이후 페이지는 `useInfiniteQuery` 가
 * 서버가 준 `nextCursor` 로 이어 읽는다. **지역·유형·검색어·단지는 쿼리 키의 일부**라 바꾸면
 * 커서가 통째로 버려진다(다른 지역·탭의 커서를 보내면 서버가 400 이다 — `./cursor.ts`).
 *
 * 지역·유형·검색은 `history.replaceState` 로 주소에만 반영한다 — 네비게이션을 일으키지 않아
 * 스크롤 위치와 이미 읽은 페이지가 유지된다. 새로고침·공유하면 서버가 그 값으로 첫 페이지를 그린다.
 *
 * 다음 페이지는 목록 끝의 `IntersectionObserver` 가 자동으로 읽고 **「더 보기」 버튼도 함께 둔다**
 * — 키보드·스크린리더 사용자와 E2E 가 쓰는 확실한 경로다(T4.1 과 같은 판단).
 *
 * 색은 전부 semantic 토큰, 상태는 `Badge` 의 `tone` 으로만 구분한다(T0.6 — 하드코딩 색상 0).
 */
import { Badge, Button, Card, Input, useTrack } from "@zari/ui";
import { useEffect, useRef, useState } from "react";
import { css, cx } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { DealAlertSheet } from "./DealAlertSheet";
import { DealTrendChart } from "./DealTrendChart";
import { useDealList } from "./hooks";
import {
  DEAL_TYPE_META,
  DEAL_TYPE_TABS,
  formatDealAmount,
  formatDealArea,
  formatDealDate,
  formatFloor,
} from "./labels";
import type { DealListResult, DealRegionDto, RealDealDto, RealDealTypeValue } from "./types";

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
const captionStyle = css({ textStyle: "caption", color: "text.muted" });
const selectStyle = css({
  w: "full",
  h: "44px",
  px: "3",
  rounded: "field",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  textStyle: "body",
  color: "text",
  _focusVisible: { outline: "2px solid", outlineColor: "border.focus", outlineOffset: "1px" },
});
const tabRowStyle = css({ display: "flex", gap: "1", p: "1", rounded: "pill", bg: "bg.subtle" });
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
const searchRowStyle = css({ display: "flex", gap: "2", alignItems: "flex-start" });
const searchFieldStyle = css({ flex: "1", minW: 0 });
const listStyle = css({ display: "flex", flexDirection: "column", gap: "2" });
const cardTopStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexWrap: "wrap",
});
const aptButtonStyle = css({
  border: "none",
  bg: "transparent",
  p: 0,
  textAlign: "left",
  textStyle: "bodyStrong",
  color: "text",
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: "3px",
  _focusVisible: { outline: "2px solid", outlineColor: "border.focus", outlineOffset: "2px" },
});
const amountStyle = css({
  mt: "1.5",
  textStyle: "subtitle",
  color: "text",
  fontFamily: "numeric",
  fontVariantNumeric: "tabular-nums",
});
const metaRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  mt: "1",
  flexWrap: "wrap",
  textStyle: "caption",
  color: "text.muted",
});
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
const focusRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  flexWrap: "wrap",
});
const sentinelStyle = css({ h: "1px" });

/** 온디맨드 수집 결과 안내 — 화면이 왜 비어 있는지(또는 방금 무엇을 했는지) 설명한다 */
const SYNC_NOTICE: Record<DealListResult["sync"]["reason"], string | null> = {
  CACHE_HIT: null,
  SYNCED: null,
  COOLDOWN: "방금 수집을 시도했습니다. 잠시 후 다시 열어 주세요.",
  NO_KEY: "실거래가 수집 키가 설정되지 않아 최신 자료를 받아오지 못했습니다.",
  FAILED: "국토부 실거래가 서버에서 자료를 받지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "목록을 불러오지 못했습니다.";
}

function DealCard({ deal, onFocusApt }: { deal: RealDealDto; onFocusApt: (name: string) => void }) {
  const meta = DEAL_TYPE_META[deal.dealType];
  return (
    <Card padding="md" data-testid="deals-card" data-deal-id={deal.id}>
      <div className={cardTopStyle}>
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <button
          type="button"
          className={aptButtonStyle}
          onClick={() => onFocusApt(deal.aptName)}
          title={`${deal.aptName} 추이 보기`}
          data-testid="deals-card-apt"
        >
          {deal.aptName}
        </button>
      </div>
      <p className={amountStyle} data-testid="deals-card-amount">
        {formatDealAmount(deal)}
      </p>
      <div className={metaRowStyle}>
        <span>{formatDealArea(deal.areaM2)}</span>
        <span aria-hidden>·</span>
        <span>{formatFloor(deal.floor)}</span>
        <span aria-hidden>·</span>
        <span data-testid="deals-card-date">{formatDealDate(deal.dealDate)} 거래</span>
        {deal.builtYear !== null ? (
          <>
            <span aria-hidden>·</span>
            <span>{deal.builtYear}년 준공</span>
          </>
        ) : null}
      </div>
    </Card>
  );
}

export type DealsViewProps = {
  regions: DealRegionDto[];
  initialRegionCode: string;
  initialDealType: RealDealTypeValue;
  initialQuery: string;
  initialApt: string | null;
  initialPage: DealListResult;
  loggedIn: boolean;
};

export function DealsView({
  regions,
  initialRegionCode,
  initialDealType,
  initialQuery,
  initialApt,
  initialPage,
  loggedIn,
}: DealsViewProps) {
  const { track } = useTrack();
  const [lawdCd, setLawdCd] = useState(initialRegionCode);
  const [dealType, setDealType] = useState<RealDealTypeValue>(initialDealType);
  const [query, setQuery] = useState(initialQuery);
  const [draft, setDraft] = useState(initialQuery);
  const [apt, setApt] = useState<string | null>(initialApt);
  const [alertOpen, setAlertOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const isInitialKey =
    lawdCd === initialRegionCode &&
    dealType === initialDealType &&
    query === initialQuery &&
    apt === initialApt;

  const list = useDealList({
    lawdCd,
    dealType,
    q: query || null,
    apt,
    initialPage: isInitialKey ? initialPage : undefined,
  });

  const pages = list.data?.pages ?? [];
  const deals = pages.flatMap((page) => page.deals);
  const head = pages[0];
  const region = head?.region ?? regions.find((item) => item.code === lawdCd) ?? regions[0]!;
  const apartments = head?.apartments ?? [];
  const trend = head?.trend ?? { apartmentName: apt, points: [] };
  const syncNotice = head ? SYNC_NOTICE[head.sync.reason] : null;

  useEffect(() => {
    track(TRACK_EVENTS.DEALS_LIST_VIEW, {
      lawdCd,
      dealType,
      count: deals.length,
      synced: head?.sync.reason ?? "CACHE_HIT",
    });
    // 지역·유형·단지가 바뀔 때 한 번씩 — 목록 길이 변화로는 다시 쏘지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lawdCd, dealType, apt, query]);

  useEffect(() => {
    if (trend.apartmentName === null) return;
    track(TRACK_EVENTS.DEALS_TREND_VIEW, {
      aptName: trend.apartmentName,
      points: trend.points.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trend.apartmentName, trend.points.length]);

  /** 주소만 바꾼다(네비게이션 없음) — 새로고침·공유하면 서버가 이 값으로 첫 페이지를 그린다 */
  function syncUrl(next: {
    lawdCd: string;
    dealType: RealDealTypeValue;
    query: string;
    apt: string | null;
  }) {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("lawdCd", next.lawdCd);
    url.searchParams.set("type", next.dealType);
    if (next.query) url.searchParams.set("q", next.query);
    else url.searchParams.delete("q");
    if (next.apt) url.searchParams.set("apt", next.apt);
    else url.searchParams.delete("apt");
    window.history.replaceState(null, "", url.toString());
  }

  function changeRegion(next: string) {
    if (next === lawdCd) return;
    track(TRACK_EVENTS.DEALS_REGION_CHANGE, { from: lawdCd, to: next });
    setLawdCd(next);
    // 지역이 바뀌면 그 지역에 없는 단지·검색어는 의미가 없다
    setApt(null);
    setQuery("");
    setDraft("");
    syncUrl({ lawdCd: next, dealType, query: "", apt: null });
  }

  function changeType(next: RealDealTypeValue) {
    if (next === dealType) return;
    track(TRACK_EVENTS.DEALS_TYPE_CHANGE, { dealType: next });
    setDealType(next);
    syncUrl({ lawdCd, dealType: next, query, apt });
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const next = draft.trim();
    track(TRACK_EVENTS.DEALS_APT_SEARCH, { query: next, count: deals.length });
    setQuery(next);
    setApt(null);
    syncUrl({ lawdCd, dealType, query: next, apt: null });
  }

  function focusApt(name: string) {
    setApt(name);
    setQuery("");
    setDraft("");
    syncUrl({ lawdCd, dealType, query: "", apt: name });
  }

  function clearFocus() {
    setApt(null);
    setQuery("");
    setDraft("");
    syncUrl({ lawdCd, dealType, query: "", apt: null });
  }

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <main className={pageStyle}>
      <div className={headerStyle}>
        <div>
          <h1 className={titleStyle}>실거래가</h1>
          <p className={captionStyle}>국토교통부 아파트 실거래 자료 · {region.label}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setAlertOpen(true)}
          data-testid="deals-alert-open"
        >
          알림 설정
        </Button>
      </div>

      <select
        className={selectStyle}
        aria-label="지역 선택"
        value={lawdCd}
        onChange={(event) => changeRegion(event.target.value)}
        data-testid="deals-region-select"
      >
        {regions.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>

      <div className={tabRowStyle} role="tablist" aria-label="거래 유형">
        {DEAL_TYPE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={dealType === tab.key}
            className={cx(tabStyle, dealType === tab.key && tabActiveStyle)}
            onClick={() => changeType(tab.key)}
            data-testid={`deals-tab-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form className={searchRowStyle} onSubmit={submitSearch} role="search">
        <div className={searchFieldStyle}>
          <Input
            aria-label="단지 검색"
            placeholder="단지 이름으로 검색"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            data-testid="deals-search-input"
          />
        </div>
        <Button type="submit" variant="secondary" data-testid="deals-search-submit">
          검색
        </Button>
      </form>

      {apt || query ? (
        <div className={focusRowStyle}>
          <span className={captionStyle} data-testid="deals-filter-label">
            {apt ? `${apt} 거래만 보는 중` : `“${query}” 검색 결과`}
          </span>
          <Button variant="ghost" size="sm" onClick={clearFocus} data-testid="deals-filter-clear">
            전체 보기
          </Button>
        </div>
      ) : null}

      <Card padding="md">
        <DealTrendChart trend={trend} dealType={dealType} regionLabel={region.label} />
      </Card>

      {syncNotice ? (
        <p className={noticeStyle} role="status" data-testid="deals-sync-notice">
          {syncNotice}
        </p>
      ) : null}

      {list.isError ? (
        <p className={errorStyle} role="alert">
          {errorMessage(list.error)}
        </p>
      ) : null}

      {deals.length === 0 && !list.isPending ? (
        <p className={emptyStyle} data-testid="deals-empty">
          조건에 맞는 실거래가 자료가 아직 없습니다.
        </p>
      ) : (
        <div className={listStyle} data-testid="deals-list">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} onFocusApt={focusApt} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className={sentinelStyle} aria-hidden />

      {hasNextPage ? (
        <Button
          variant="secondary"
          fullWidth
          loading={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
          data-testid="deals-load-more"
        >
          더 보기
        </Button>
      ) : null}

      <DealAlertSheet
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        region={region}
        dealType={dealType}
        apartments={apartments}
        loggedIn={loggedIn}
      />
    </main>
  );
}
