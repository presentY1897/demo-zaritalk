/**
 * 이벤트 네이밍 규약과 미리 정의된 이벤트 이름(T0.7).
 *
 * ## 규약 — `<domain>_<object>_<action>`
 *
 * - 소문자·숫자만, 마디는 `_` 로 구분한다. 2~4마디(`page_view` ~ `payment_toss_confirm_success`).
 * - `<domain>` 은 화면이 아니라 **도메인**(notice·signup·payment·refund…)으로 적는다.
 * - `<object>` 는 생략할 수 있다 — 대상이 도메인 자체면 `signup_start` 처럼 2마디로 쓴다.
 * - `<action>` 은 과거형이 아니라 현재형 동사(`click`·`view`·`start`·`complete`·`submit`).
 * - 같은 규약을 서버도 강제한다 — `POST /api/track` 이 정규식으로 검증하고 어긋나면 400.
 *
 * 새 이벤트를 심을 때는 **여기 상수를 먼저 추가**하고 그 상수를 쓴다. 문자열 리터럴을
 * 화면에 직접 적으면 오타가 그대로 지표가 된다.
 *
 * 이름 타입(`TrackEventName`)은 `@zari/ui` 가 소유한다 — `useTrack()` 시그니처가 그 타입을 쓰고,
 * 여기서는 타입만 빌려와(`import type`, 런타임 의존 없음) 상수가 규약을 벗어나면 컴파일이 깨지게 한다.
 */
import type { KnownTrackEventName } from "@zari/ui";

/**
 * 미리 정의한 이벤트.
 *
 * `PAGE_VIEW` 는 라우트 전환마다 자동 수집되고(`TrackingProvider`), 나머지 4개는
 * [D2](../../../../../docs/DECISIONS.md#-d2-ab-실험-소재-1개-실운영) 의 A/B 퍼널이다:
 * `notice_view → notice_cta_click → signup_start → signup_complete`.
 */
export const TRACK_EVENTS = {
  /** 라우트 전환 — 자동 수집. 직접 부를 일은 없다. */
  PAGE_VIEW: "page_view",
  /** 공개 고지서 페이지 노출 (T1.8) */
  NOTICE_VIEW: "notice_view",
  /** 고지서 하단 가입 CTA 클릭 — A/B 변형(variant)을 props 에 담는다 (T1.8) */
  NOTICE_CTA_CLICK: "notice_cta_click",
  /** 가입 시작 — 전화번호 입력·인증 요청 (T0.4) */
  SIGNUP_START: "signup_start",
  /** 가입 완료 — 계정 생성 성공 (T0.4) */
  SIGNUP_COMPLETE: "signup_complete",
} as const satisfies Record<string, KnownTrackEventName>;

export type TrackEventKey = keyof typeof TRACK_EVENTS;
