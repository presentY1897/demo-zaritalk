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
  /** 임대인 홈 대시보드 노출 — props: `{ overdueCount, expiringCount, inboxCount }` (T1.9) */
  LANDLORD_HOME_VIEW: "landlord_home_view",
  /** 홈의 연체 청구 행 클릭 — props: `{ leaseId, chargeId, outstanding }` (T1.9) */
  LANDLORD_OVERDUE_CLICK: "landlord_overdue_click",
  /** 홈의 만기 임박 계약 행 클릭 — props: `{ leaseId, daysLeft }` (T1.9) */
  LANDLORD_EXPIRY_CLICK: "landlord_expiry_click",
  /** 세입자 계약 수락 화면 노출 — props: `{ pendingCount }` (T1.3) */
  TENANT_LEASE_ACCEPT_VIEW: "tenant_lease_accept_view",
  /** 대기 계약 수락 성공 — props: `{ leaseId, chargeCreated }` (T1.3) */
  TENANT_LEASE_ACCEPT_COMPLETE: "tenant_lease_accept_complete",
  /** 대기 계약 거절 성공 — props: `{ leaseId, removedCharges }` (T1.3) */
  TENANT_LEASE_DECLINE_COMPLETE: "tenant_lease_decline_complete",
  /** 세입자 홈 노출 — props: `{ leaseCount, pendingCount, outstanding }` (T1.3) */
  TENANT_HOME_VIEW: "tenant_home_view",
  /** 환급 계산기 계산 실행 성공 — props: `{ grossSalary, monthlyRent, months, years, creditAmount, creditRatePercent }` (T2.3) */
  REFUND_CALC_SUBMIT: "refund_calc_submit",
  /** 환급 계산기 「신청하기」 CTA 클릭 — props: `{ source, loggedIn, creditAmount, years }` (T2.3) */
  REFUND_CTA_CLICK: "refund_cta_click",
  /** 환급 신청서 화면 노출 — props: `{ prefilled, hasDraft, leaseCount }` (T2.4) */
  REFUND_APPLY_VIEW: "refund_apply_view",
  /** 신청 서류 업로드 성공 — props: `{ applicationId, slot, size, stage }` (T2.4) */
  REFUND_DOC_UPLOAD: "refund_doc_upload",
  /** 환급 신청 제출 성공 — props: `{ applicationId, expectedAmount, documentCount, resubmit }` (T2.4) */
  REFUND_APPLY_SUBMIT: "refund_apply_submit",
  /** 환급 상태 화면 노출 — props: `{ applicationId, status }` (T2.4) */
  REFUND_STATUS_VIEW: "refund_status_view",
  /** 민원 접수 성공 — props: `{ complaintId, leaseId }` (T2.6) */
  COMPLAINT_CREATE_COMPLETE: "complaint_create_complete",
  /** 민원 스레드 노출 — props: `{ complaintId, status, role }` (T2.6) */
  COMPLAINT_THREAD_VIEW: "complaint_thread_view",
  /** 스레드 메시지 전송 성공 — props: `{ complaintId, role }` (T2.6) */
  COMPLAINT_MESSAGE_SEND: "complaint_message_send",
  /** 임대인 상태 변경 성공 — props: `{ complaintId, from, to }` (T2.6) */
  COMPLAINT_STATUS_CHANGE: "complaint_status_change",
  /** 자리페이 결제 화면 노출 — props: `{ chargeId, amount, status }` (T2.2) */
  PAY_CHECKOUT_VIEW: "pay_checkout_view",
  /** 토스 위젯 결제 요청(결제창 호출) — props: `{ chargeId, orderId, amount }` (T2.2) */
  PAY_REQUEST_START: "pay_request_start",
  /** 결제 승인 성공 — props: `{ chargeId, orderId, amount, chargeStatus }` (T2.1·T2.2) */
  PAY_CONFIRM_COMPLETE: "pay_confirm_complete",
  /** 결제 승인 실패·중단 — props: `{ orderId, code, reason }` (T2.1·T2.2) */
  PAY_CONFIRM_FAIL: "pay_confirm_fail",
  /** 세입자 납부 이력 노출 — props: `{ count, cardCount }` (T2.2) */
  PAY_HISTORY_VIEW: "pay_history_view",
  /** 작업 의뢰 등록 성공 — props: `{ workOrderId, category, source, dispatchedCount }` (T5.1) */
  WORK_ORDER_CREATE_COMPLETE: "work_order_create_complete",
  /** 민원 → 작업 의뢰 전환 성공 — props: `{ complaintId, workOrderId, category, dispatchedCount }` (T5.1) */
  WORK_ORDER_CONVERT_COMPLETE: "work_order_convert_complete",
  /** 의뢰 완료·취소 성공 — props: `{ workOrderId, from, to }` (T5.1) */
  WORK_ORDER_STATUS_CHANGE: "work_order_status_change",
  /** 마스터 홈 노출 — props: `{ plan, feedCount, targetCount }` (T5.2) */
  MASTER_FEED_VIEW: "master_feed_view",
  /** 마스터 홈 탭 전환 — props: `{ tab }` (recommended | feed) (T5.2) */
  MASTER_FEED_TAB_CHANGE: "master_feed_tab_change",
  /** 마스터 의뢰 상세 노출 — props: `{ workOrderId, recommended, distanceKm }` (T5.2) */
  MASTER_ORDER_VIEW: "master_order_view",
  /** 데모용 플랜 전환 성공 — props: `{ from, to }` (T5.2) */
  MASTER_PLAN_CHANGE: "master_plan_change",
  /** 마스터 견적 제안 성공 — props: `{ workOrderId, quoteId, amount, source }` (T5.3) */
  QUOTE_SUBMIT_COMPLETE: "quote_submit_complete",
  /** 임대인 견적 수락 성공 — props: `{ workOrderId, quoteId, amount, source, rejectedCount }` (T5.3) */
  QUOTE_ACCEPT_COMPLETE: "quote_accept_complete",
  /** 마스터 「내 견적」 목록 노출 — props: `{ total, proposed, accepted, rejected, pushed, pulled }` (T5.3) */
  MASTER_QUOTE_LIST_VIEW: "master_quote_list_view",
  /** 지역 보드 노출 — props: `{ regionCode, sort, count }` (T4.1) */
  COMMUNITY_BOARD_VIEW: "community_board_view",
  /** 보드의 시군구 변경 — props: `{ from, to }` (T4.1) */
  COMMUNITY_REGION_CHANGE: "community_region_change",
  /** 최신·인기 탭 전환 — props: `{ sort }` (T4.1) */
  COMMUNITY_SORT_CHANGE: "community_sort_change",
  /** 글 작성 성공 — props: `{ postId, regionCode, profileType }` (T4.1) */
  COMMUNITY_POST_CREATE: "community_post_create",
  /** 글 상세 노출 — props: `{ postId, regionCode, moderation }` (T4.1) */
  COMMUNITY_POST_VIEW: "community_post_view",
  /** 좋아요 토글 성공 — props: `{ postId, liked, likeCount }` (T4.1) */
  COMMUNITY_LIKE_TOGGLE: "community_like_toggle",
  /** 댓글 작성 성공 — props: `{ postId }` (T4.1) */
  COMMUNITY_COMMENT_CREATE: "community_comment_create",
  /** 신고 접수 성공 — props: `{ targetType, targetId, duplicated }` (T4.2) */
  COMMUNITY_REPORT_SUBMIT: "community_report_submit",
  /** 매물 등록 성공 — props: `{ unitId, listingId, dealType, role }` (T3.1) */
  LISTING_CREATE_COMPLETE: "listing_create_complete",
  /** 매물 수정 성공(상태 변경 제외) — props: `{ listingId, dealType }` (T3.1) */
  LISTING_UPDATE_COMPLETE: "listing_update_complete",
  /** 매물 상태 변경 성공 — props: `{ listingId, from, to }` (T3.1) */
  LISTING_STATUS_CHANGE: "listing_status_change",
  /** 근무지 등록 성공 — props: `{ workplaceId, total }` (T3.4) */
  WORKPLACE_CREATE_COMPLETE: "workplace_create_complete",
  /** 근무지 삭제 성공 — props: `{ workplaceId, total }` (T3.4) */
  WORKPLACE_DELETE_COMPLETE: "workplace_delete_complete",
  /** 실거래가 목록 노출 — props: `{ lawdCd, dealType, count, synced }` (T4.4) */
  DEALS_LIST_VIEW: "deals_list_view",
  /** 실거래가 시군구 변경 — props: `{ from, to }` (T4.4) */
  DEALS_REGION_CHANGE: "deals_region_change",
  /** 매매·전세·월세 탭 전환 — props: `{ dealType }` (T4.4) */
  DEALS_TYPE_CHANGE: "deals_type_change",
  /** 단지 검색 실행 — props: `{ query, count }` (T4.4) */
  DEALS_APT_SEARCH: "deals_apt_search",
  /** 단지 추이 차트 노출 — props: `{ aptName, points }` (T4.4) */
  DEALS_TREND_VIEW: "deals_trend_view",
  /** 알림 구독 성공 — props: `{ lawdCd, dealType, hasApt, duplicated }` (T4.4) */
  DEALS_ALERT_CREATE: "deals_alert_create",
  /** 알림 구독 해제 성공 — props: `{ alertId }` (T4.4) */
  DEALS_ALERT_DELETE: "deals_alert_delete",
} as const satisfies Record<string, KnownTrackEventName>;

export type TrackEventKey = keyof typeof TRACK_EVENTS;
