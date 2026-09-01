/**
 * 세입자 화면 DTO (T1.3).
 *
 * **`@zari/db` 를 import 하지 않는다** — 수락 화면·세입자 홈이 클라이언트 컴포넌트라
 * Prisma 타입을 끌어오면 클라이언트 번들이 깨진다(T1.1 `features/landlord/types.ts` 미러 패턴).
 *
 * 계약·청구 DTO 는 **T1.2·T1.5 가 만든 것을 그대로 쓴다** — 세입자 홈은 임대인이 보던 것과
 * 같은 데이터를 세입자 시점으로 보여 줄 뿐이라 모양을 새로 만들 이유가 없다.
 */
import type { ChargeDto, LeaseDetailDto } from "@/features/lease/types";

export type { ChargeDto, LeaseDetailDto };

/**
 * 세입자가 보는 계약 = 계약 상세(T1.2) + 임대인 이름.
 * 임대인 이름은 "이 계약을 누가 등록했는가" 를 수락 전에 확인시켜 주기 위한 것이다.
 */
export type TenantLeaseDto = LeaseDetailDto & { landlordName: string };

/** 수락 대기 계약 — 내 번호로 등록됐지만 아직 내 계정에 연결되지 않은 `PENDING_TENANT` 계약 */
export type PendingLeaseDto = TenantLeaseDto;

/** 세입자 홈의 계약 카드 1장 */
export type TenantLeaseCardDto = {
  lease: TenantLeaseDto;
  /** 이번 달(KST) 청구. 아직 없으면 null */
  currentCharge: ChargeDto | null;
  /** 최근 청구(최신 월부터, 최대 `TENANT_HOME_CHARGE_LIMIT` 개) */
  charges: ChargeDto[];
};

/** 세입자 홈 전체 — 숫자는 전부 서버가 원장 엔진으로 계산해 둔 값이다 */
export type TenantHomeDto = {
  /** 판정 기준일 `YYYY-MM-DD` (KST 오늘) */
  asOf: string;
  /** 이번 달 — `label` 은 "2026년 9월" */
  month: { year: number; month: number; label: string };
  /** 수락 대기 계약 수. 0 보다 크면 홈 상단에 수락 배너가 뜬다 */
  pendingCount: number;
  /** 내가 수락한 진행 중(ACTIVE) 계약. 보통 1건 */
  leases: TenantLeaseCardDto[];
  /** 미납 합계(계약 전체) — Σ `chargeSummary` */
  outstanding: { count: number; amount: number };
};

/** 거절 시 청구를 어떻게 정리했는지 */
export type DeclineSettlementDto = {
  /** 납부 기록도 발송 고지서도 없어 지운 청구 수 */
  removedCharges: number;
  /** 근거(납부·고지서)가 있어 남긴 청구 수 */
  keptCharges: number;
};

/** `POST /api/leases/[id]/accept` 응답 */
export type AcceptLeaseResult = {
  lease: TenantLeaseDto;
  /** 수락 시점에 확보한 이번 달 청구(이미 있었으면 그것). 계약 기간 밖이면 null */
  charge: ChargeDto | null;
};

/** `POST /api/leases/[id]/decline` 응답 */
export type DeclineLeaseResult = { lease: TenantLeaseDto; settlement: DeclineSettlementDto };
