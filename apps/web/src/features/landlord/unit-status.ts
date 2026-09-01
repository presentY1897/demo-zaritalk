/**
 * 호실 상태 판정 (T1.1) — 그리드 색의 **단일 출처**.
 *
 * 상태는 DB 컬럼이 아니라 계약(+청구)에서 파생한다:
 *
 * | 상태 | 판정 | 배지 tone |
 * |---|---|---|
 * | `OVERDUE` 연체 | ACTIVE 계약 + 미납(OVERDUE) 청구가 1건 이상 | danger |
 * | `OCCUPIED` 계약중 | ACTIVE 계약 | success |
 * | `PENDING` 대기 | PENDING_TENANT 계약(세입자 미연결) | warning |
 * | `VACANT` 공실 | 진행 중인 계약 없음(ENDED·CANCELLED 만 있어도 공실) | neutral |
 *
 * 위에서부터 먼저 맞는 것을 쓴다 — 연체가 계약중을 덮어쓴다.
 *
 * ⚠️ **연체 판정은 임시 구현이다.** 지금은 `RentCharge.status === 'OVERDUE'` 행이 있는지만
 * 본다. 금액 계산(미납·이월·연체료)은 **T1.4 월세 원장 엔진** 소유라 여기서 만들지 않는다.
 * T1.4 머지 후 `hasOverdueCharge` 를 원장 엔진의 연체 판정 함수 호출로 교체한다
 * (호출부는 `features/landlord/queries.ts` 한 곳뿐이다).
 *
 * `@zari/db` 를 import 하지 않는 순수 모듈이라 클라이언트 컴포넌트에서도 그대로 쓴다.
 */
import type { UnitStatus } from "./types";

export type UnitStatusInput = {
  /** ACTIVE 계약이 있는가 */
  hasActiveLease: boolean;
  /** PENDING_TENANT 계약이 있는가 */
  hasPendingLease: boolean;
  /** 현재 계약에 OVERDUE 청구가 있는가 (T1.4 머지 후 원장 엔진으로 교체) */
  hasOverdueCharge: boolean;
};

export function deriveUnitStatus(input: UnitStatusInput): UnitStatus {
  if (input.hasActiveLease) return input.hasOverdueCharge ? "OVERDUE" : "OCCUPIED";
  if (input.hasPendingLease) return "PENDING";
  return "VACANT";
}

/** 배지 tone — `@zari/ui` Badge 의 tone 값과 같다(하드코딩 색상 없음) */
export type UnitStatusTone = "success" | "warning" | "danger" | "neutral";

export type UnitStatusMeta = {
  label: string;
  tone: UnitStatusTone;
  /** 목록 요약 문구용 짧은 설명 */
  description: string;
};

export const UNIT_STATUS_META: Record<UnitStatus, UnitStatusMeta> = {
  OCCUPIED: { label: "계약중", tone: "success", description: "임대 중인 호실" },
  PENDING: { label: "대기", tone: "warning", description: "세입자 연결 대기" },
  OVERDUE: { label: "연체", tone: "danger", description: "미납 청구가 있는 호실" },
  VACANT: { label: "공실", tone: "neutral", description: "계약이 없는 호실" },
};

/** 요약 배지·그리드 범례에서 쓰는 노출 순서 */
export const UNIT_STATUS_ORDER: readonly UnitStatus[] = [
  "OCCUPIED",
  "PENDING",
  "OVERDUE",
  "VACANT",
];

/** 상태별 0으로 채운 카운터 — 목록 요약 집계의 시작값 */
export function emptyStatusCounts(): Record<UnitStatus, number> {
  return { OCCUPIED: 0, PENDING: 0, OVERDUE: 0, VACANT: 0 };
}
