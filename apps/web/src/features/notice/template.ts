/**
 * 고지서 템플릿 렌더링 (T1.7) — **순수 함수**. DB·React 를 모른다.
 *
 * 금액은 **한 줄도 직접 계산하지 않는다.** 항목별 금액·미납 잔액·연체일수·상태는 전부
 * 원장 엔진(`@/lib/rent`)의 `describeCharge` 가 돌려준 값을 문장으로 옮길 뿐이다
 * ([T1.4](../../../../../docs/tasks/t1.4-rent-engine.md)).
 *
 * 공개 고지서 링크는 **본문에 넣지 않는다** — 토큰은 발송 시점에 정해지고, 링크는
 * `noticeUrl(base, token)` 으로 어디서든 만들 수 있다. 본문(`MessageLog.body`)을 순수하게
 * 두면 공개 고지서 페이지가 그대로 "임대인이 보낸 안내"로 보여 줄 수 있고 스냅샷도 안정적이다.
 */
import {
  CHARGE_STATUS,
  daysBetween,
  daysUntilExpiry,
  describeCharge,
  type ChargeBreakdown,
  type DescribableCharge,
} from "@/lib/rent";
import { NOTICE_CHANNEL_NAME, type NoticeKind } from "./constants";

/** 템플릿에 넣을 청구 — 원장 엔진 입력 + 몇 월분인지 */
export type NoticeTemplateCharge = DescribableCharge & { year: number; month: number };

export type NoticeTemplateInput = {
  kind: NoticeKind;
  landlordName: string;
  tenantName: string;
  buildingName: string;
  unitLabel: string;
  lease: {
    monthlyRent: number;
    maintenanceFee: number;
    paymentDay: number;
    startDate: Date;
    endDate: Date;
  };
  /** 월세·연체 고지서는 필수, 만기 안내는 없어도 된다 */
  charge?: NoticeTemplateCharge | null;
  /** 상태·연체일수 판정 기준일 — 호출부에서 항상 `kstToday()` 를 넘긴다 */
  asOf: Date;
  bankAccount: { bankName: string; number: string; holder: string };
  /** 임대인이 직접 덧붙인 한마디(선택) */
  memo?: string | null;
};

export type RenderedNotice = { title: string; body: string };

const DIVIDER = "─────────────";

/** `Date` → "2026년 9월 25일". `@db.Date` 는 UTC 자정이라 ISO 앞 10자를 그대로 쓴다. */
export function formatKoreanDate(date: Date): string {
  const [year, month, day] = date.toISOString().slice(0, 10).split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

/** 1015500 → "1,015,500원" */
export function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** 공개 고지서 절대 URL. base 끝의 슬래시는 정리한다. */
export function noticeUrl(base: string, token: string): string {
  return `${base.replace(/\/+$/, "")}/notice/${token}`;
}

/** 0원 항목은 적지 않는다 — 전세(월세 0)·연체료 없음 같은 줄이 빈칸으로 남지 않게. */
function amountLines(breakdown: ChargeBreakdown): string[] {
  return breakdown.lines
    .filter((line) => line.amount > 0)
    .map((line) => `· ${line.label} ${formatWon(line.amount)}`);
}

function accountLines(input: NoticeTemplateInput): string[] {
  const { bankName, number, holder } = input.bankAccount;
  return ["입금 계좌", `${bankName} ${number} (예금주 ${holder})`];
}

function memoLines(memo?: string | null): string[] {
  const trimmed = memo?.trim();
  if (!trimmed) return [];
  return ["", "임대인 메시지", trimmed];
}

function requireCharge(input: NoticeTemplateInput): NoticeTemplateCharge {
  if (!input.charge) {
    throw new Error(`${input.kind} 템플릿에는 청구(charge)가 필요합니다.`);
  }
  return input.charge;
}

function renderRentNotice(input: NoticeTemplateInput): RenderedNotice {
  const charge = requireCharge(input);
  const view = describeCharge(charge, input.asOf);
  const remainingDays = daysBetween(input.asOf, view.dueDate);
  const dueSuffix =
    remainingDays > 0 ? ` (D-${remainingDays})` : remainingDays === 0 ? " (오늘까지)" : "";

  const paidLines =
    view.paidAmount > 0
      ? [`이미 납부 ${formatWon(view.paidAmount)}`, `남은 금액 ${formatWon(view.outstanding)}`]
      : [];

  const title = `${charge.year}년 ${charge.month}월 월세 고지서`;
  const body = [
    `[${NOTICE_CHANNEL_NAME}] ${title}`,
    "",
    `${input.tenantName}님, ${input.buildingName} ${input.unitLabel} ${charge.month}월분 월세를 안내드립니다.`,
    "",
    ...amountLines(view),
    DIVIDER,
    `납부하실 금액 ${formatWon(view.totalDue)}`,
    ...paidLines,
    `납부기한 ${formatKoreanDate(view.dueDate)}${dueSuffix}`,
    "",
    ...accountLines(input),
    ...memoLines(input.memo),
  ].join("\n");

  return { title, body };
}

function renderOverdueNotice(input: NoticeTemplateInput): RenderedNotice {
  const charge = requireCharge(input);
  const view = describeCharge(charge, input.asOf);
  const overdueLine =
    view.overdueDays > 0
      ? `${input.buildingName} ${input.unitLabel} ${charge.year}년 ${charge.month}월분 월세가 ${view.overdueDays}일째 미납 상태입니다.`
      : `${input.buildingName} ${input.unitLabel} ${charge.year}년 ${charge.month}월분 월세가 아직 미납 상태입니다.`;

  const title = `${charge.year}년 ${charge.month}월 월세 연체 안내`;
  const body = [
    `[${NOTICE_CHANNEL_NAME}] ${title}`,
    "",
    `${input.tenantName}님, ${overdueLine}`,
    "",
    ...amountLines(view),
    DIVIDER,
    `미납 금액 ${formatWon(view.outstanding)}`,
    `납부기한 ${formatKoreanDate(view.dueDate)} (${view.overdueDays}일 경과)`,
    "",
    ...accountLines(input),
    "",
    "이미 납부하셨다면 이 안내는 무시하셔도 됩니다.",
    ...memoLines(input.memo),
  ].join("\n");

  return { title, body };
}

function renderContractExpiry(input: NoticeTemplateInput): RenderedNotice {
  const { lease } = input;
  const remaining = daysUntilExpiry(lease.endDate, input.asOf);
  const remainingLine =
    remaining > 0
      ? `만기까지 ${remaining}일 남았습니다.`
      : remaining === 0
        ? "오늘이 만기일입니다."
        : `만기일이 ${Math.abs(remaining)}일 지났습니다.`;

  const title = `임대차 계약 만기 안내 (${formatKoreanDate(lease.endDate)})`;
  const body = [
    `[${NOTICE_CHANNEL_NAME}] 임대차 계약 만기 안내`,
    "",
    `${input.tenantName}님, ${input.buildingName} ${input.unitLabel} 임대차 계약 만기가 다가옵니다.`,
    "",
    `계약 기간 ${formatKoreanDate(lease.startDate)} ~ ${formatKoreanDate(lease.endDate)}`,
    remainingLine,
    "",
    `· 월세 ${formatWon(lease.monthlyRent)}`,
    `· 관리비 ${formatWon(lease.maintenanceFee)}`,
    `· 납부일 매월 ${lease.paymentDay}일`,
    "",
    "재계약 또는 이사 계획을 임대인에게 알려 주세요.",
    ...memoLines(input.memo),
  ].join("\n");

  return { title, body };
}

const RENDERERS: Record<NoticeKind, (input: NoticeTemplateInput) => RenderedNotice> = {
  RENT_NOTICE: renderRentNotice,
  OVERDUE_NOTICE: renderOverdueNotice,
  CONTRACT_EXPIRY: renderContractExpiry,
};

/** 종류별 템플릿 렌더 — 발송(API)과 미리보기(시트)가 **같은 함수**를 쓴다. */
export function renderNoticeTemplate(input: NoticeTemplateInput): RenderedNotice {
  return RENDERERS[input.kind](input);
}

/**
 * 연체 고지서를 보낼 만한 청구인가 — 시트가 기본 선택을 고를 때 쓴다.
 * 판정은 원장 엔진 결과(`describeCharge`)로만 한다.
 */
export function isOverdueLike(charge: NoticeTemplateCharge, asOf: Date): boolean {
  const view = describeCharge(charge, asOf);
  return view.outstanding > 0 && view.status !== CHARGE_STATUS.PAID && view.overdueDays > 0;
}
