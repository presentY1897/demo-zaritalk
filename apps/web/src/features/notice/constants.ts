/**
 * 고지서 발송·공개 고지서 공통 상수 (T1.7 · T1.8).
 *
 * **순수 모듈이다** — `@zari/db` 를 import 하지 않으므로 클라이언트 컴포넌트에서도 쓴다.
 */
import type { ChargeStatus } from "@/lib/rent";

/** 임대인이 직접 보낼 수 있는 고지서 종류 3종. `MessageKind` 의 부분집합이다. */
export const NOTICE_KINDS = ["RENT_NOTICE", "OVERDUE_NOTICE", "CONTRACT_EXPIRY"] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

/** 발송 이력에 섞여 나올 수 있는 나머지 종류까지 포함한 라벨(어드민 T6.3 도 같은 이름을 쓴다). */
export const MESSAGE_KIND_LABELS: Record<string, string> = {
  RENT_NOTICE: "월세 고지서",
  OVERDUE_NOTICE: "연체 알림",
  CONTRACT_EXPIRY: "계약 만기",
  BROKERAGE_REQUEST: "중개 요청",
  WORK_ORDER_REQUEST: "작업 의뢰",
  OTP: "인증번호",
  ETC: "기타",
};

export function messageKindLabel(kind: string): string {
  return MESSAGE_KIND_LABELS[kind] ?? kind;
}

/** 발송 시트의 종류 선택 버튼 — 순서·설명이 화면 원본이다. */
export const NOTICE_KIND_OPTIONS: {
  kind: NoticeKind;
  label: string;
  description: string;
  /** 청구(RentCharge)를 반드시 지정해야 하는 종류인가 */
  requiresCharge: boolean;
}[] = [
  {
    kind: "RENT_NOTICE",
    label: "월세",
    description: "이번 달 청구 내역을 그대로 보냅니다.",
    requiresCharge: true,
  },
  {
    kind: "OVERDUE_NOTICE",
    label: "연체",
    description: "기한이 지난 청구의 미납액·연체료를 안내합니다.",
    requiresCharge: true,
  },
  {
    kind: "CONTRACT_EXPIRY",
    label: "만기",
    description: "계약 만기가 다가옴을 알립니다. 청구를 고르지 않습니다.",
    requiresCharge: false,
  },
];

export function noticeKindRequiresCharge(kind: NoticeKind): boolean {
  return NOTICE_KIND_OPTIONS.find((option) => option.kind === kind)?.requiresCharge ?? false;
}

/**
 * 납부 계좌 — **데모용 더미**다. 실제 계좌가 아니고 입금해도 아무 일도 일어나지 않는다.
 * 실서비스라면 임대인 프로필에 계좌를 두고 여기서 읽어야 한다(스키마에 계좌 필드가 없어
 * 이 task 에서는 상수로 둔다 — `docs/tasks/t1.7-notice-send.md` 의 "스키마" 참고).
 */
export const DEMO_BANK_ACCOUNT = {
  bankName: "자리은행",
  number: "1002-0917-2026",
  holderSuffix: "",
} as const;

export function demoBankAccount(landlordName: string) {
  return {
    bankName: DEMO_BANK_ACCOUNT.bankName,
    number: DEMO_BANK_ACCOUNT.number,
    holder: landlordName,
  };
}

/** 청구 상태 배지 — 색만으로 뜻을 전하지 않게 라벨을 함께 쓴다(T0.6 원칙). */
export const CHARGE_STATUS_META: Record<
  ChargeStatus,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  PAID: { label: "납부 완료", tone: "success" },
  PARTIALLY_PAID: { label: "부분 납부", tone: "warning" },
  OVERDUE: { label: "연체", tone: "danger" },
  SCHEDULED: { label: "납부 예정", tone: "neutral" },
};

/** 알림톡 채널명(시뮬레이터 말풍선 머리글) */
export const NOTICE_CHANNEL_NAME = "자리톡";
