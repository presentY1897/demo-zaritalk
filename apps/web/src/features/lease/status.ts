/**
 * 계약·청구 상태 라벨과 배지 tone (T1.2·T1.5) — 표시 규칙의 단일 출처.
 *
 * 색만으로 뜻을 전하지 않도록 배지에는 **항상 라벨을 함께** 넣는다(T0.6 원칙).
 * tone 값은 `@zari/ui` `Badge` 의 `tone` prop 그대로다 — 하드코딩 색상 0.
 *
 * `@zari/db` 를 import 하지 않는 순수 모듈이라 클라이언트 컴포넌트에서도 그대로 쓴다.
 */
import type { ChargeStatusValue, LeaseStatusValue, PaymentMethodValue } from "./types";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export type StatusMeta = { label: string; tone: StatusTone };

/** 계약 상태 — 세입자 연결 전(PENDING_TENANT)은 "대기"(warning) */
export const LEASE_STATUS_META: Record<LeaseStatusValue, StatusMeta> = {
  ACTIVE: { label: "계약중", tone: "success" },
  PENDING_TENANT: { label: "세입자 연결 대기", tone: "warning" },
  ENDED: { label: "종료", tone: "neutral" },
  CANCELLED: { label: "취소", tone: "neutral" },
};

/**
 * 청구 상태 — 시드 6~9월의 4개 상태가 이 네 가지다.
 * 우선순위(PAID > PARTIALLY_PAID > OVERDUE > SCHEDULED)는 원장 엔진이 판정한다.
 */
export const CHARGE_STATUS_META: Record<ChargeStatusValue, StatusMeta> = {
  PAID: { label: "완납", tone: "success" },
  PARTIALLY_PAID: { label: "부분납", tone: "warning" },
  OVERDUE: { label: "연체", tone: "danger" },
  SCHEDULED: { label: "예정", tone: "neutral" },
};

/** 납부 수단 — `CARD` 는 T2.2(자리페이)가 만든다 */
export const PAYMENT_METHOD_LABEL: Record<PaymentMethodValue, string> = {
  MANUAL_CHECK: "받음 체크",
  VIRTUAL_TRANSFER: "가상 입금",
  CARD: "자리페이",
};
