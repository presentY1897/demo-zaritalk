/**
 * 장부 항목(줄) 표시 규칙 (T1.6) — 순수 모듈, 클라이언트에서도 쓴다.
 *
 * 라벨·표시 순서는 원장 엔진(T1.4)의 `CHARGE_LINE_LABELS`·`CHARGE_LINE_ORDER` 를 그대로
 * 재사용한다. 수납 화면(T1.5)과 장부가 같은 단어·같은 순서를 쓰게 하려는 것이다.
 * 장부에만 있는 줄은 `EXCESS`(초과 납부) 하나다 — 정상 흐름에서는 항상 0 이고,
 * `total` 이 실제 입금액과 어긋나지 않도록 담아 두기만 한다(집계 모듈 주석 ④ 참고).
 */
import { CHARGE_LINE_LABELS, CHARGE_LINE_ORDER, type ChargeLineKey } from "@/lib/rent";
import type { LedgerAmounts } from "./aggregate";

export type LedgerLineKey = ChargeLineKey | "EXCESS";

export const LEDGER_LINE_LABELS: Record<LedgerLineKey, string> = {
  ...CHARGE_LINE_LABELS,
  EXCESS: "초과 납부",
};

/** 표시 순서 — 월세 → 관리비 → 전월 이월 → 연체료 → (초과 납부) */
export const LEDGER_LINE_ORDER: readonly LedgerLineKey[] = [...CHARGE_LINE_ORDER, "EXCESS"];

/** 항상 보여 주는 4줄. `EXCESS` 는 값이 있을 때만 끼워 넣는다 */
export const LEDGER_BASE_LINES: readonly LedgerLineKey[] = CHARGE_LINE_ORDER;

/** 줄 → 금액 필드 */
export const LEDGER_LINE_FIELD: Record<LedgerLineKey, keyof LedgerAmounts> = {
  RENT: "rent",
  MAINTENANCE: "maintenance",
  CARRY_OVER: "carriedOver",
  LATE_FEE: "lateFee",
  EXCESS: "excess",
};

/** 그 버킷에서 실제로 보여 줄 줄 — 4줄 고정 + 초과 납부가 있을 때만 5번째 */
export function visibleLedgerLines(amounts: LedgerAmounts): LedgerLineKey[] {
  return amounts.excess > 0 ? [...LEDGER_LINE_ORDER] : [...LEDGER_BASE_LINES];
}

/** `2026` + `6` → `"6월"` */
export function monthLabel(month: number): string {
  return `${month}월`;
}
