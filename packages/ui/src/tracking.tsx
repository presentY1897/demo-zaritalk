"use client";

/**
 * 트래킹 코어 — 클라이언트 쪽(T0.7).
 *
 * 하는 일 3가지:
 * 1. `TrackingProvider` — 이벤트 큐 + 배치 전송(sendBeacon 우선, fetch keepalive 폴백)
 * 2. `useTrack()` — 화면에서 이벤트를 심는 훅
 * 3. `usePageViewTracking(path)` — 경로가 바뀔 때마다 `page_view` 자동 수집
 *
 * **라우터 의존이 없는 이유**: `@zari/ui` 는 `next` 를 의존성으로 갖지 않는다(웹·어드민 공용
 * 프리젠테이션 패키지). 그래서 `usePathname`/`useSearchParams` 는 앱 쪽 어댑터
 * (`apps/web/src/lib/tracking/page-view.tsx`)가 읽어서 경로 문자열로 넘겨준다.
 *
 * 이벤트 이름 규약과 미리 정의된 상수는 `apps/web/src/lib/tracking/events.ts` 참고.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

/** 기본 수집 엔드포인트 — `POST /api/track` */
const DEFAULT_ENDPOINT = "/api/track";
/** 배치 창(ms) — 이 시간 안에 쌓인 이벤트를 한 번에 보낸다. */
const DEFAULT_BATCH_MS = 400;
/** 한 번에 보낼 최대 이벤트 수 — 서버 스키마 상한과 같다. */
const MAX_BATCH = 50;
/** 탭 단위 세션 id 를 담는 sessionStorage 키 */
const SESSION_STORAGE_KEY = "zari_track_session";

/**
 * 코드베이스가 실제로 쓰는 이벤트 이름.
 * `page_view` 는 자동 수집, 그다음 넷은 D2 의 A/B 퍼널이다.
 * 새 이벤트는 여기와 앱의 `TRACK_EVENTS` 에 함께 추가한다.
 */
export type KnownTrackEventName =
  | "page_view"
  | "notice_view"
  | "notice_cta_click"
  | "signup_start"
  | "signup_complete"
  | "profile_switch_open"
  | "profile_switch_complete"
  | "building_create_complete"
  | "unit_create_complete";

/**
 * 이벤트 이름 — `<domain>_<object>_<action>`.
 *
 * 아는 이름은 자동완성으로 뜨고(오타 방지), 새 이름도 그대로 받는다(`string & {}`).
 * 규약을 어긴 이름은 서버가 400 으로 막는다.
 */
export type TrackEventName = KnownTrackEventName | (string & {});

export type TrackProps = Record<string, unknown>;

/** 서버로 보내는 이벤트 한 건 — `POST /api/track` 스키마와 같은 모양. */
export type TrackEventPayload = {
  name: TrackEventName;
  props?: TrackProps;
  path?: string;
  sessionId?: string;
};

export type TrackApi = {
  /** 이벤트를 큐에 넣는다. 실제 전송은 배치로 묶여 나간다. */
  track: (name: TrackEventName, props?: TrackProps) => void;
  /** 큐에 남은 이벤트를 즉시 보낸다. 전체 페이지 이동 직전 등에 쓴다. */
  flush: () => void;
};

const NOOP_TRACK_API: TrackApi = { track: () => {}, flush: () => {} };

const TrackingContext = createContext<TrackApi | null>(null);

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replaceAll("-", "");
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

/** 탭 단위 세션 id. 프라이빗 모드 등으로 접근이 막히면 조용히 포기한다. */
function readSessionId(): string | undefined {
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const created = randomId();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return undefined;
  }
}

function currentPath(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * 이벤트 배치 전송.
 *
 * `navigator.sendBeacon` 이 1순위 — 페이지가 사라지는 중에도 브라우저가 대신 보내주고,
 * 응답을 기다리지 않아 이탈을 늦추지 않는다. 큐가 꽉 차면 `false` 를 돌려주므로 그때는
 * `fetch(keepalive)` 로 폴백한다. 트래킹 실패가 화면을 깨뜨려선 안 되므로 에러는 삼킨다.
 */
function send(endpoint: string, events: TrackEventPayload[]): void {
  const body = JSON.stringify(events);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(endpoint, blob)) return;
    } catch {
      // 폴백으로 넘어간다
    }
  }

  try {
    void fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
      // anonId·세션 쿠키를 함께 보낸다(같은 출처라 기본값이지만 의도를 명시).
      credentials: "same-origin",
    }).catch(() => {});
  } catch {
    // 트래킹은 실패해도 조용히 넘어간다
  }
}

export type TrackingProviderProps = {
  children: ReactNode;
  /** 수집 엔드포인트. 기본 `/api/track` */
  endpoint?: string;
  /** 배치 창(ms). 기본 400 */
  batchMs?: number;
};

/**
 * 트래킹 컨텍스트. 앱 최상단(providers)에 한 번만 꽂는다.
 * 큐는 provider 인스턴스가 들고 있어 클라이언트 라우팅 중에도 유지된다.
 */
export function TrackingProvider({
  children,
  endpoint = DEFAULT_ENDPOINT,
  batchMs = DEFAULT_BATCH_MS,
}: TrackingProviderProps) {
  const queueRef = useRef<TrackEventPayload[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = queueRef.current;
    if (pending.length === 0) return;
    queueRef.current = [];
    send(endpoint, pending);
  }, [endpoint]);

  const track = useCallback(
    (name: TrackEventName, props?: TrackProps) => {
      // SSR·프리렌더 중에는 큐에 쌓지 않는다(브라우저에서만 의미가 있다).
      if (typeof window === "undefined") return;

      const path = currentPath();
      const sessionId = readSessionId();
      queueRef.current.push({
        name,
        ...(props ? { props } : {}),
        ...(path ? { path } : {}),
        ...(sessionId ? { sessionId } : {}),
      });

      if (queueRef.current.length >= MAX_BATCH) {
        flush();
        return;
      }
      // 배치 창은 "처음 쌓인 시점부터 batchMs" — 이벤트가 계속 들어와도 전송이 밀리지 않는다.
      if (timerRef.current === null) timerRef.current = setTimeout(flush, batchMs);
    },
    [batchMs, flush],
  );

  useEffect(() => {
    // 탭을 숨기거나 페이지를 떠날 때 남은 큐를 비운다.
    // `unload` 는 bfcache 를 깨뜨려 쓰지 않는다 — visibilitychange/pagehide 가 권장 조합.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onPageHide = () => flush();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      flush();
    };
  }, [flush]);

  const api = useMemo<TrackApi>(() => ({ track, flush }), [track, flush]);

  return <TrackingContext.Provider value={api}>{children}</TrackingContext.Provider>;
}

/**
 * 이벤트를 심는 훅.
 *
 * ```tsx
 * const { track } = useTrack();
 * <Button onClick={() => track(TRACK_EVENTS.NOTICE_CTA_CLICK, { variant })}>가입하고 확인</Button>
 * ```
 *
 * Provider 밖에서 불러도 던지지 않고 no-op 이다 — 트래킹 때문에 화면이 죽으면 안 된다.
 */
export function useTrack(): TrackApi {
  return useContext(TrackingContext) ?? NOOP_TRACK_API;
}

/**
 * 경로가 바뀔 때마다 `page_view` 를 보낸다.
 *
 * 라우터에 묶이지 않도록 "현재 경로 문자열"을 인자로 받는다. Next 앱에서는
 * `apps/web/src/lib/tracking/page-view.tsx` 가 `usePathname()`+`useSearchParams()` 를 읽어 넘긴다.
 * 같은 경로로 리렌더돼도 중복 전송하지 않는다.
 */
export function usePageViewTracking(path: string | null | undefined): void {
  const { track } = useTrack();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!path || lastPathRef.current === path) return;
    const from = lastPathRef.current;
    lastPathRef.current = path;
    // path 는 track() 이 window.location 에서 채운다. props 의 from 은 퍼널 이탈 분석용.
    track("page_view", from ? { from } : undefined);
  }, [path, track]);
}
