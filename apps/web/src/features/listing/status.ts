/**
 * 매물 상태 규칙 (T3.1) — 라벨·tone·**전이 규칙**의 단일 출처.
 *
 * `@zari/db` 를 import 하지 않는 순수 모듈이라 클라이언트 폼과 라우트 핸들러가 함께 쓴다.
 *
 * ## 전이 규칙
 *
 * | 현재 | 갈 수 있는 곳 | 비고 |
 * |---|---|---|
 * | `OPEN` 공개 중 | `RESERVED` · `CLOSED` | |
 * | `RESERVED` 예약 | `OPEN` · `CLOSED` | **`OPEN` 으로 되돌리려면 호실이 공실이어야 한다** |
 * | `CLOSED` 종료 | 없음 | 종료는 되돌릴 수 없다 — 다시 올리려면 새로 등록한다 |
 *
 * - 같은 상태로의 전이(`OPEN` → `OPEN`)는 **허용**한다(멱등). 화면에서 이미 그 상태인 버튼을
 *   눌러도 409 가 나지 않는다.
 * - `CLOSED` 를 종료 상태로 둔 이유: 계약이 잡혀 내려간 매물을 조건 그대로 되살리면
 *   "언제 어떤 조건으로 올렸던 매물인가" 이력이 뭉개진다. 이력은 남기고 새 매물을 만든다.
 * - `RESERVED → OPEN` 에만 공실 조건을 다시 거는 이유: 예약 사이 계약이 성립했을 수 있다.
 *   계약중 호실이 `/search` 목록에 다시 뜨는 일을 막는다.
 */
import type { ListingStatusValue } from "./types";

export type ListingStatusTone = "info" | "warning" | "neutral";

export type ListingStatusMeta = {
  label: string;
  tone: ListingStatusTone;
  description: string;
};

/** 색만으로 뜻을 전하지 않도록 배지에 라벨을 함께 넣는다(T0.6) */
export const LISTING_STATUS_META: Record<ListingStatusValue, ListingStatusMeta> = {
  OPEN: { label: "공개 중", tone: "info", description: "매물 탐색에 노출됩니다" },
  RESERVED: { label: "예약", tone: "warning", description: "가계약·계약 예정" },
  CLOSED: { label: "종료", tone: "neutral", description: "내려간 매물 — 되돌릴 수 없습니다" },
};

/** 화면 버튼 노출 순서 */
export const LISTING_STATUS_ORDER: readonly ListingStatusValue[] = ["OPEN", "RESERVED", "CLOSED"];

/** 상태별 갈 수 있는 다음 상태 (자기 자신 제외) */
const NEXT_STATUSES: Record<ListingStatusValue, readonly ListingStatusValue[]> = {
  OPEN: ["RESERVED", "CLOSED"],
  RESERVED: ["OPEN", "CLOSED"],
  CLOSED: [],
};

export type StatusTransitionInput = {
  from: ListingStatusValue;
  to: ListingStatusValue;
  /** 호실에 진행 중(ACTIVE·PENDING_TENANT) 계약이 있는가 */
  unitOccupied: boolean;
};

export type StatusTransitionResult = { ok: true } | { ok: false; reason: string };

/** 전이 가능 여부 + 불가 사유. 라우트 핸들러(409)와 화면(버튼 비활성)이 같은 답을 쓴다. */
export function checkStatusTransition(input: StatusTransitionInput): StatusTransitionResult {
  const { from, to, unitOccupied } = input;
  if (from === to) return { ok: true };

  if (!NEXT_STATUSES[from].includes(to)) {
    return {
      ok: false,
      reason:
        from === "CLOSED"
          ? "종료한 매물은 되돌릴 수 없습니다. 새로 등록해 주세요."
          : `${LISTING_STATUS_META[from].label} 상태에서는 ${LISTING_STATUS_META[to].label}(으)로 바꿀 수 없습니다.`,
    };
  }

  if (to === "OPEN" && unitOccupied) {
    return { ok: false, reason: "계약이 있는 호실은 다시 공개할 수 없습니다." };
  }
  return { ok: true };
}

/** 아직 살아 있는 매물인가 — 호실당 1건만 허용하는 판정에 쓴다 */
export function isLiveListing(status: ListingStatusValue): boolean {
  return status !== "CLOSED";
}
