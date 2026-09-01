/**
 * 고지서 DTO (T1.7 · T1.8) — **클라이언트용 미러 타입**.
 *
 * `@zari/db` 를 import 하지 않는다(T1.1 `features/landlord/types.ts` 와 같은 규칙).
 * 날짜는 전부 문자열이다 — `@db.Date` 는 `YYYY-MM-DD`, 타임스탬프는 ISO 8601.
 */
import type { ChargeStatus } from "@/lib/rent";
import type { NoticeKind } from "./constants";

export type ChargeStatusValue = ChargeStatus;

/** 청구 1건 — 발송 시트의 대상 선택과 공개 고지서 금액 내역이 같은 모양을 쓴다. */
export type NoticeChargeDto = {
  id: string;
  year: number;
  month: number;
  /** `YYYY-MM-DD` */
  dueDate: string;
  rentAmount: number;
  maintenanceAmount: number;
  carriedOverAmount: number;
  lateFeeAmount: number;
  totalDue: number;
  paidAmount: number;
  /** 저장된 상태가 아니라 **원장 엔진이 오늘 기준으로 다시 판정한** 상태다 */
  status: ChargeStatusValue;
  /** 미납 잔액 (`calcOutstanding`) */
  outstanding: number;
  /** 기한 경과 일수. 기한 전이면 0 */
  overdueDays: number;
};

/** 금액 내역 한 줄 (`describeCharge` 의 `lines`) */
export type NoticeChargeLineDto = {
  key: "RENT" | "MAINTENANCE" | "CARRY_OVER" | "LATE_FEE";
  label: string;
  amount: number;
  paid: number;
};

/**
 * 발송 시트가 필요한 계약 정보 — `GET /api/leases/[id]/notices` 응답.
 * 시트는 `leaseId` 만 받고 이 데이터를 스스로 읽는다(T1.2·T1.5 가 꽂기 쉽게).
 */
export type NoticeTargetDto = {
  leaseId: string;
  leaseStatus: "PENDING_TENANT" | "ACTIVE" | "ENDED" | "CANCELLED";
  tenantName: string;
  tenantPhone: string;
  /** 세입자가 아직 가입·연결 전이면 null — 공개 고지서가 특히 의미 있는 경우다 */
  tenantProfileId: string | null;
  landlordName: string;
  buildingName: string;
  buildingAddress: string;
  unitLabel: string;
  deposit: number;
  monthlyRent: number;
  maintenanceFee: number;
  paymentDay: number;
  /** `YYYY-MM-DD` */
  startDate: string;
  endDate: string;
  /** 최신 월 순서. 만기 안내는 청구가 없어도 보낼 수 있다 */
  charges: NoticeChargeDto[];
};

/** 발송 이력 한 줄 — `GET /api/landlord/messages` · `POST …/notices` 응답 */
export type MessageLogDto = {
  id: string;
  kind: string;
  title: string;
  body: string;
  /** 공개 고지서 토큰. null 이면 공개 페이지가 없는 발송(OTP 등) */
  token: string | null;
  toPhone: string;
  /** ISO 8601 */
  sentAt: string;
  /** 최초 열람 시각. 미열람이면 null */
  openedAt: string | null;
  leaseId: string | null;
  chargeId: string | null;
  tenantName: string | null;
  buildingName: string | null;
  unitLabel: string | null;
  /** 공개 고지서 경로(`/notice/<token>`). 토큰이 없으면 null */
  noticePath: string | null;
};

/** 공개 고지서 페이지 데이터 — `GET /api/notices/[token]` 응답의 `notice` */
export type PublicNoticeDto = {
  token: string;
  kind: NoticeKind | string;
  title: string;
  /** 임대인이 보낸 안내 문구 원문(줄바꿈 포함) */
  message: string;
  /** ISO 8601 */
  sentAt: string;
  openedAt: string | null;
  landlordName: string;
  /** 가운데를 가린 수신 번호(010-****-5555) — 링크만 알면 누구나 열 수 있는 페이지다 */
  tenantName: string;
  tenantPhoneMasked: string;
  buildingName: string;
  buildingAddress: string;
  unitLabel: string;
  lease: {
    deposit: number;
    monthlyRent: number;
    maintenanceFee: number;
    paymentDay: number;
    startDate: string;
    endDate: string;
    /** 만기까지 남은 일수(지났으면 음수) */
    daysUntilExpiry: number;
  };
  /** 만기 안내처럼 청구가 없는 고지서는 null */
  charge:
    | (NoticeChargeDto & {
        lines: NoticeChargeLineDto[];
        /** 납부기한까지 남은 일수(지났으면 음수) */
        daysUntilDue: number;
      })
    | null;
  bankAccount: { bankName: string; number: string; holder: string };
};
