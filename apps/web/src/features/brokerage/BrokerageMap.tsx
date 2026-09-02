"use client";

/**
 * 발송 전 미리보기 지도 (T3.6) — 공실 건물 한 점과 반경 안 중개인 사무소를 함께 찍는다.
 *
 * 카카오 지도 JS SDK 를 **필요할 때만** 동적으로 불러온다(`NEXT_PUBLIC_KAKAO_MAP_JS_KEY`).
 * 키가 없거나 스크립트가 막히면 **지도를 포기하고 목록만 남긴다** — 지도는 거들 뿐이고,
 * 대상 인원·목록은 지도 없이도 완전히 읽히기 때문이다(시트 안의 목록이 원본이다).
 *
 * ## E2E 에서 지도를 단언하지 않는 이유
 *
 * 카카오 JS 키는 **도메인 등록제**라 E2E 포트(`E2E_PORT`)가 등록돼 있지 않으면
 * SDK 가 조용히 거부된다. 그래서 통합 테스트는 **인원 수와 목록**으로만 검증하고
 * (`brokerage-preview-count`·`brokerage-preview-realtor`) 지도 렌더는 보지 않는다.
 * 이 컴포넌트가 실패해도 시트의 나머지가 그대로 동작해야 하는 이유이기도 하다.
 */
import { useEffect, useRef, useState } from "react";
import { css } from "styled-system/css";
import type { BrokeragePlaceDto, BrokerageRealtorPreviewDto } from "./types";

const SDK_ELEMENT_ID = "kakao-maps-sdk";

const mapBoxStyle = css({
  w: "full",
  h: "180px",
  rounded: "card",
  overflow: "hidden",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "border",
  bg: "bg.subtle",
});
const fallbackStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  h: "full",
  px: "4",
  textAlign: "center",
  textStyle: "caption",
  color: "text.muted",
});

/** SDK 는 문서에 한 번만 붙인다 — 시트를 여러 번 열어도 스크립트가 쌓이지 않게 */
function loadKakaoSdk(appKey: string): Promise<unknown> {
  const globalWindow = window as unknown as {
    kakao?: { maps?: { load: (cb: () => void) => void } };
  };
  if (globalWindow.kakao?.maps) {
    return new Promise((resolve) => globalWindow.kakao?.maps?.load(() => resolve(globalWindow.kakao)));
  }

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SDK_ELEMENT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    const onLoad = () => {
      const maps = (window as unknown as { kakao?: { maps?: { load: (cb: () => void) => void } } })
        .kakao?.maps;
      if (!maps) {
        reject(new Error("kakao maps sdk unavailable"));
        return;
      }
      maps.load(() => resolve((window as unknown as { kakao: unknown }).kakao));
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", () => reject(new Error("kakao maps sdk blocked")), {
      once: true,
    });

    if (!existing) {
      script.id = SDK_ELEMENT_ID;
      script.async = true;
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
      document.head.appendChild(script);
    }
  });
}

export function BrokerageMap({
  unit,
  realtors,
}: {
  unit: BrokeragePlaceDto;
  realtors: BrokerageRealtorPreviewDto[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY ?? "";

  useEffect(() => {
    if (!appKey || !containerRef.current) {
      setFailed(true);
      return;
    }

    let cancelled = false;
    loadKakaoSdk(appKey)
      .then((kakao) => {
        if (cancelled || !containerRef.current) return;
        // SDK 타입 패키지를 넣지 않았다(지도 한 곳에서만 쓴다) — 최소 형태만 좁혀 쓴다
        const maps = (kakao as { maps: KakaoMaps }).maps;
        const center = new maps.LatLng(unit.lat, unit.lng);
        const map = new maps.Map(containerRef.current, { center, level: 6 });

        new maps.Marker({ map, position: center, title: unit.buildingName });
        for (const realtor of realtors) {
          new maps.Marker({
            map,
            position: new maps.LatLng(realtor.lat, realtor.lng),
            title: realtor.officeName,
          });
        }

        // 중개인이 있으면 전부 보이게 맞춘다
        if (realtors.length > 0) {
          const bounds = new maps.LatLngBounds();
          bounds.extend(center);
          for (const realtor of realtors) {
            bounds.extend(new maps.LatLng(realtor.lat, realtor.lng));
          }
          map.setBounds(bounds);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [appKey, unit.lat, unit.lng, unit.buildingName, realtors]);

  return (
    <div className={mapBoxStyle} data-testid="brokerage-preview-map">
      {failed ? (
        <p className={fallbackStyle}>
          지도를 불러오지 못했습니다. 아래 목록으로 대상을 확인해 주세요.
        </p>
      ) : (
        <div ref={containerRef} className={css({ w: "full", h: "full" })} />
      )}
    </div>
  );
}

/** 카카오 지도 SDK 중 이 화면이 실제로 쓰는 부분만 (타입 패키지를 따로 넣지 않았다) */
type KakaoLatLng = object;
type KakaoBounds = { extend: (latLng: KakaoLatLng) => void };
type KakaoMap = { setBounds: (bounds: KakaoBounds) => void };
type KakaoMaps = {
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoBounds;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; level: number },
  ) => KakaoMap;
  Marker: new (options: { map: KakaoMap; position: KakaoLatLng; title?: string }) => unknown;
};
