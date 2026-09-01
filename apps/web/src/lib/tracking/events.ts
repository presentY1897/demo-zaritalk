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
  /** 마이페이지에서 프로필 전환 시트를 열었을 때 (T0.5) */
  PROFILE_SWITCH_OPEN: "profile_switch_open",
  /** 프로필 전환 성공 — props: `{ from, to }` (프로필 유형) (T0.5) */
  PROFILE_SWITCH_COMPLETE: "profile_switch_complete",
  /** 건물 등록 성공 — props: `{ unitCount }` 는 없다(등록 직후엔 호실 0) (T1.1) */
  BUILDING_CREATE_COMPLETE: "building_create_complete",
  /** 호실 등록 성공 — props: `{ buildingId }` (T1.1) */
  UNIT_CREATE_COMPLETE: "unit_create_complete",
  /** 임대장부에서 연도·건물 필터를 바꿨을 때 — props: `{ year, buildingId }` (T1.6) */
  LEDGER_FILTER_CHANGE: "ledger_filter_change",
  /** 계약 등록 성공 — props: `{ unitId, chargeCreated }` (T1.2) */
  LEASE_CREATE_COMPLETE: "lease_create_complete",
  /** 계약 종료 처리 성공 — props: `{ leaseId, removedCharges, remainingUnpaid }` (T1.2) */
  LEASE_END_COMPLETE: "lease_end_complete",
  /** 청구 상세 시트 열기 — props: `{ month, status }` (T1.5) */
  CHARGE_SHEET_OPEN: "charge_sheet_open",
  /** 납부 기록 성공(받음 체크·가상 입금) — props: `{ method, amount, status }` (T1.5) */
  PAYMENT_RECORD_COMPLETE: "payment_record_complete",
  /** 납부 기록 취소(오기록 되돌리기) — props: `{ method, amount }` (T1.5) */
  PAYMENT_CANCEL_COMPLETE: "payment_cancel_complete",
} as const satisfies Record<string, KnownTrackEventName>;

export type TrackEventKey = keyof typeof TRACK_EVENTS;
