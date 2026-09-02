"use client";

/**
 * 카카오맵 래퍼 (T3.2) — `/search` 와 `/listings/[id]` 가 함께 쓴다.
 *
 * ## SDK 를 어떻게 넣는가 — `next/script` + `autoload=false`
 *
 * ```
 * https://dapi.kakao.com/v2/maps/sdk.js?appkey=<JS 키>&autoload=false
 * ```
 *
 * 카카오 공식 문서(`apis.map.kakao.com/web/documentation/` → `kakao.maps.load`)가 못박은
 * 규칙이다: **비동기로 SDK 를 끼워 넣을 때는 `autoload=false` 를 붙이고 `kakao.maps.load(콜백)`
 * 안에서 객체를 만들어야 한다.** 스크립트가 다 내려오기 전에 `kakao.maps.Map` 을 만지면 에러가 난다.
 * Next 16 에서는 `next/script` 의 `onReady` 가 그 자리다 — 공식 Next 문서(`02-components/script.md`)
 * 의 Google Maps 예제가 정확히 같은 모양이고, `onLoad` 와 달리 **컴포넌트가 다시 마운트될 때마다**
 * 불려서 라우트 이동 후에도 지도가 다시 살아난다.
 *
 * `strategy` 는 기본값(`afterInteractive`)이다. 지도는 첫 페인트에 필요하지 않고(리스트가 먼저 뜬다)
 * `beforeInteractive` 는 루트 레이아웃에만 놓을 수 있는데 그 파일은 이 task 소유가 아니다.
 *
 * ## 키가 없거나 도메인이 등록되지 않았을 때
 *
 * JS 키는 **카카오 개발자센터에 등록한 도메인에서만** 동작한다. 그래서 이 컴포넌트는
 * 지도가 없어도 화면이 성립하도록 만들어져 있다:
 *
 * - `NEXT_PUBLIC_KAKAO_MAP_JS_KEY` 가 없으면 스크립트를 아예 붙이지 않고 안내 면을 그린다.
 * - 스크립트 로딩이 실패하면(`onError`) 같은 안내 면으로 떨어진다.
 * - **어느 경우에도 컨테이너와 `data-pin-count` 는 그대로 렌더된다.** 리스트·필터·상세 이동은
 *   지도 없이도 전부 동작한다. E2E 가 지도 타일을 단언하지 않는 이유가 이것이다
 *   (E2E 포트는 등록된 도메인이 아니다 — `e2e/search.spec.ts` 주석).
 *
 * ## 이벤트는 `idle` 하나만 쓴다
 *
 * `center_changed`·`dragend`·`zoom_changed` 는 끌기 도중에도 계속 불린다. `idle` 은
 * **움직임이 끝난 뒤 한 번**이라 재조회 횟수가 이동 횟수가 아니라 "멈춘 횟수" 가 된다.
 * 그 위에 화면 쪽에서 350ms 디바운스를 한 겹 더 건다(`MapSearchView`).
 */
import Script from "next/script";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { css, cx } from "styled-system/css";
import type { Bounds, LatLng } from "./bounds";

/* ------------------------------------------------------------------ */
/* SDK 최소 타입 — 카카오는 공식 타입 패키지를 주지 않는다               */
/* ------------------------------------------------------------------ */

type KakaoLatLng = { getLat: () => number; getLng: () => number };
type KakaoLatLngBounds = { getSouthWest: () => KakaoLatLng; getNorthEast: () => KakaoLatLng };

type KakaoMapInstance = {
  getBounds: () => KakaoLatLngBounds;
  setCenter: (latlng: KakaoLatLng) => void;
  setLevel: (level: number) => void;
  setBounds: (bounds: KakaoLatLngBounds) => void;
  relayout: () => void;
};

type KakaoOverlay = { setMap: (map: KakaoMapInstance | null) => void };

type KakaoMaps = {
  load: (callback: () => void) => void;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  LatLngBounds: new (sw: KakaoLatLng, ne: KakaoLatLng) => KakaoLatLngBounds;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; level?: number; draggable?: boolean; zoomable?: boolean },
  ) => KakaoMapInstance;
  CustomOverlay: new (options: {
    map?: KakaoMapInstance;
    position: KakaoLatLng;
    content: HTMLElement | string;
    clickable?: boolean;
    xAnchor?: number;
    yAnchor?: number;
    zIndex?: number;
  }) => KakaoOverlay;
  event: { addListener: (target: unknown, type: string, handler: () => void) => void };
};

declare global {
  /** SDK 가 전역에 심는 객체. `var` 여야 `globalThis.kakao` 로 읽힌다 */
  // eslint-disable-next-line no-var -- 전역 선언은 var 만 가능하다
  var kakao: { maps: KakaoMaps } | undefined;
}

/* ------------------------------------------------------------------ */
/* 스타일 — 색은 전부 semantic 토큰(T0.6). 하드코딩 색상 0             */
/* ------------------------------------------------------------------ */

const frameStyle = css({
  position: "relative",
  w: "full",
  bg: "bg.subtle",
  overflow: "hidden",
});
const canvasStyle = css({ position: "absolute", inset: "0" });
const noticeStyle = css({
  position: "absolute",
  inset: "0",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "1.5",
  px: "gutter",
  textAlign: "center",
  bg: "bg.subtle",
  color: "text.muted",
  textStyle: "caption",
});
const noticeTitleStyle = css({ textStyle: "label", color: "text" });
const overlayLayerStyle = css({ position: "absolute", inset: "0", pointerEvents: "none" });

/** 지도 위 가격 핀. `document.createElement` 로 만든 엘리먼트에 그대로 붙인다 —
 *  panda 가 정적으로 뽑아 둔 클래스라 React 밖에서도 스타일이 적용된다. */
const pinStyle = css({
  appearance: "none",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.card",
  color: "text",
  rounded: "pill",
  px: "2.5",
  py: "1",
  textStyle: "caption",
  fontWeight: "700",
  whiteSpace: "nowrap",
  shadow: "raised",
  cursor: "pointer",
  transform: "translateY(-6px)",
});
const pinActiveStyle = css({
  bg: "primary",
  color: "primary.fg",
  borderColor: "primary.border",
});

/* ------------------------------------------------------------------ */

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  /** 핀 위 가격 라벨 — 서버가 만든 `pinLabel` */
  label: string;
  active?: boolean;
};

export type KakaoMapProps = {
  center: LatLng;
  /** 카카오 확대 레벨(작을수록 확대). 기본 5 ≈ 동 단위 */
  level?: number;
  markers?: readonly MapMarker[];
  /** 움직임이 끝났을 때 보이는 영역 */
  onIdle?: (bounds: Bounds) => void;
  onMarkerClick?: (id: string) => void;
  /** 처음 한 번 이 영역이 다 보이도록 맞춘다(핀이 여러 개일 때) */
  fitBounds?: Bounds | null;
  /** 지도 중심을 이 점으로 옮긴다(카드를 고르면 그 매물로) */
  focusPoint?: LatLng | null;
  draggable?: boolean;
  zoomable?: boolean;
  /** CSS 높이 값 — 스냅 상태에 따라 바뀐다 */
  height: string;
  testId?: string;
  /** 지도 위에 얹을 것(안내 배너 등). 기본적으로 클릭을 통과시킨다 */
  children?: ReactNode;
};

type MapStatus = "loading" | "ready" | "no-key" | "error";

const SDK_ID = "kakao-maps-sdk";

export function KakaoMap({
  center,
  level = 5,
  markers = [],
  onIdle,
  onMarkerClick,
  fitBounds = null,
  focusPoint = null,
  draggable = true,
  zoomable = true,
  height,
  testId = "kakao-map",
  children,
}: KakaoMapProps) {
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMapInstance | null>(null);
  const overlaysRef = useRef<KakaoOverlay[]>([]);
  const [status, setStatus] = useState<MapStatus>(appKey ? "loading" : "no-key");

  // 콜백은 ref 로 들고 있는다 — 부모가 새 함수를 넘겨도 리스너를 다시 달지 않는다
  const onIdleRef = useRef(onIdle);
  const onMarkerClickRef = useRef(onMarkerClick);
  const fitBoundsRef = useRef(fitBounds);
  onIdleRef.current = onIdle;
  onMarkerClickRef.current = onMarkerClick;
  fitBoundsRef.current = fitBounds;

  const initMap = useCallback(() => {
    const maps = globalThis.kakao?.maps;
    const container = containerRef.current;
    if (!maps || !container || mapRef.current) return;

    const map = new maps.Map(container, {
      center: new maps.LatLng(center.lat, center.lng),
      level,
      draggable,
      zoomable,
    });
    mapRef.current = map;

    const emit = () => {
      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      onIdleRef.current?.({
        swLat: sw.getLat(),
        swLng: sw.getLng(),
        neLat: ne.getLat(),
        neLng: ne.getLng(),
      });
    };

    // 리스너를 **먼저** 달고 영역을 맞춘다 — 순서가 반대면 첫 이동을 놓친다
    maps.event.addListener(map, "idle", emit);

    const fit = fitBoundsRef.current;
    if (fit) {
      map.setBounds(
        new maps.LatLngBounds(
          new maps.LatLng(fit.swLat, fit.swLng),
          new maps.LatLng(fit.neLat, fit.neLng),
        ),
      );
    }
    // 생성 직후 `idle` 이 보장되지 않는다(문서에 명시가 없다) — 첫 영역은 직접 한 번 알린다.
    // 중복은 화면 쪽 디바운스가 접는다.
    emit();

    setStatus("ready");
  }, [center.lat, center.lng, level, draggable, zoomable]);

  /** `autoload=false` 로 받아 왔으므로 `kakao.maps.load` 안에서 만든다(공식 문서 규칙) */
  const handleReady = useCallback(() => {
    const kakao = globalThis.kakao;
    if (!kakao?.maps?.load) {
      setStatus("error");
      return;
    }
    kakao.maps.load(initMap);
  }, [initMap]);

  // 라우트 이동으로 다시 마운트됐는데 스크립트가 이미 로드돼 있으면 `onReady` 가
  // 불리지 않을 수 있다 — 그때를 위해 마운트 시 한 번 더 확인한다.
  useEffect(() => {
    if (!appKey) return;
    if (globalThis.kakao?.maps?.load) handleReady();
  }, [appKey, handleReady]);

  // 핀 다시 그리기
  useEffect(() => {
    const maps = globalThis.kakao?.maps;
    const map = mapRef.current;
    if (status !== "ready" || !maps || !map) return;

    const overlays = markers.map((marker) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = cx(pinStyle, marker.active ? pinActiveStyle : undefined);
      element.textContent = marker.label;
      element.dataset.listingId = marker.id;
      element.setAttribute("aria-label", `${marker.label} 매물 보기`);
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        onMarkerClickRef.current?.(marker.id);
      });

      return new maps.CustomOverlay({
        map,
        position: new maps.LatLng(marker.lat, marker.lng),
        content: element,
        clickable: true,
        xAnchor: 0.5,
        yAnchor: 1,
        zIndex: marker.active ? 3 : 1,
      });
    });
    overlaysRef.current = overlays;

    return () => {
      for (const overlay of overlays) overlay.setMap(null);
      overlaysRef.current = [];
    };
  }, [markers, status]);

  // 카드를 고르면 그 매물로 중심을 옮긴다
  useEffect(() => {
    const maps = globalThis.kakao?.maps;
    const map = mapRef.current;
    if (status !== "ready" || !maps || !map || !focusPoint) return;
    map.setCenter(new maps.LatLng(focusPoint.lat, focusPoint.lng));
  }, [focusPoint, status]);

  // 스냅 상태가 바뀌어 높이가 달라지면 지도에 알려 준다(안 하면 타일이 잘린 채 남는다)
  useEffect(() => {
    if (status !== "ready") return;
    mapRef.current?.relayout();
  }, [height, status]);

  return (
    <div
      className={frameStyle}
      style={{ height }}
      data-testid={testId}
      data-map-status={status}
      data-pin-count={markers.length}
    >
      <div className={canvasStyle} ref={containerRef} aria-hidden={status !== "ready"} />

      {status === "ready" ? null : (
        <div className={noticeStyle} role="status">
          <span className={noticeTitleStyle}>
            {status === "loading" ? "지도를 불러오는 중" : "지도를 표시할 수 없습니다"}
          </span>
          <span>
            {status === "no-key"
              ? "지도 키(NEXT_PUBLIC_KAKAO_MAP_JS_KEY)가 설정되지 않았습니다."
              : status === "error"
                ? "등록되지 않은 도메인이거나 네트워크가 막혀 있습니다."
                : "잠시만 기다려 주세요."}
          </span>
          <span>매물 목록과 상세는 지도 없이도 그대로 이용할 수 있습니다.</span>
        </div>
      )}

      {children ? <div className={overlayLayerStyle}>{children}</div> : null}

      {appKey ? (
        <Script
          id={SDK_ID}
          // `autoload=false` — 로딩이 끝난 뒤 `kakao.maps.load()` 로 직접 초기화한다(공식 문서)
          src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`}
          onReady={handleReady}
          onError={() => setStatus("error")}
        />
      ) : null}
    </div>
  );
}
