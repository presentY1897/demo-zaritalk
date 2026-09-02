/**
 * 환급 신청 서버 조회·DTO 매핑 (T2.4·T2.5) — **라우트 핸들러와 서버 컴포넌트가 같은 함수를 쓴다**
 * (T1.3·T2.6 과 같은 구조). 여기서만 `@zari/db` 를 만지고, 화면은 DTO 만 본다.
 *
 * ## `documents` Json 에 무엇이 들어가나 — 스키마를 못 늘려서 한 선택
 *
 * `RefundApplication` 에는 **월세·임차기간·기준일을 담을 컬럼이 없다**(있는 것은
 * `annualIncome`·`startYear`·`endYear`·`expectedAmount` 넷뿐). 그런데 어드민 심사 화면은
 * "산출 내역"(연도별 개월·지급 월세·공제액)을 보여 줘야 하고, 그러려면 **계산 입력 전부**가 필요하다.
 * 컬럼을 늘리려면 마이그레이션이 필요한데 지금 스키마는 Phase 5 가 잡고 있어 건드릴 수 없다.
 *
 * 그래서 `documents`(`Json?`) 를 **봉투(envelope)** 로 쓴다:
 *
 * ```jsonc
 * {
 *   "version": 1,
 *   "files": [ { "id": "...", "slot": "LEASE_CONTRACT", ... } ],   // 서류 메타 배열(원래 용도)
 *   "calc":  { "monthlyRent": 550000, "startDate": "2024-07-01",
 *              "endDate": "2025-06-30", "asOf": "2026-09-02" }      // 산출 내역 재현용
 * }
 * ```
 *
 * - `asOf` 를 함께 굳혀 두는 것이 핵심이다. 소급 5년 창은 해가 바뀌면 밀리므로, 기준일을 저장하지
 *   않으면 **같은 신청이 내년에 다른 금액**을 보여 준다. 저장해 두면 `expectedAmount` 와
 *   재계산 결과가 언제 봐도 일치한다.
 * - 읽기는 **관대하게** 한다 — 배열이 그대로 들어 있어도(다른 도구가 쓴 경우) 서류 목록으로 읽는다.
 * - 제대로 하려면 `monthlyRent Int` · `startDate`/`endDate` · `asOf` 컬럼(또는 `calcSnapshot Json`)이
 *   맞다. 스키마를 열 수 있게 되면 옮기고 이 봉투는 지운다.
 */
import { prisma } from "@zari/db";
import { formatDateOnly, parseDateOnly } from "@/features/lease/rules";
import { kstToday } from "@/lib/rent";
import { calculateRefund, type RefundCalcInput, type RefundCalcResult } from "./calc";
import {
  missingRequiredSlots,
  REFUND_SLOT_META,
  type RefundDocumentMeta,
  type RefundDocumentSlot,
} from "./documents";
import {
  REFUND_APPLICATION_INCLUDE,
  type RefundApplicationRow,
  type RefundLeaseRow,
} from "./ownership";
import {
  availableReviewActions,
  isEditableStatus,
  isUploadableStatus,
  REFUND_STATUS_META,
  submitTargetFor,
  type RefundStatusValue,
} from "./status";
import type {
  RefundApplicationDto,
  RefundDocumentDto,
  RefundLeaseOptionDto,
  RefundReviewItemDto,
} from "./types";

/** `documents` 컬럼에 저장하는 봉투. 위 주석 참고. */
export type RefundDocumentsEnvelope = {
  version: 1;
  files: RefundDocumentMeta[];
  calc: RefundStoredCalc;
};

export type RefundStoredCalc = {
  monthlyRent: number;
  startDate: string;
  endDate: string;
  /** 금액을 굳힌 기준일 — 재계산이 언제나 같은 값을 내게 한다 */
  asOf: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toDocumentMeta(value: unknown): RefundDocumentMeta | null {
  if (!isRecord(value)) return null;
  const { id, slot, name, contentType, size, pathname, url, uploadedAt, stage } = value;
  if (typeof id !== "string" || typeof slot !== "string" || typeof pathname !== "string") {
    return null;
  }
  if (!(slot in REFUND_SLOT_META)) return null;
  return {
    id,
    slot: slot as RefundDocumentSlot,
    name: typeof name === "string" ? name : id,
    contentType: typeof contentType === "string" ? contentType : "application/octet-stream",
    size: typeof size === "number" ? size : 0,
    pathname,
    url: typeof url === "string" ? url : "",
    uploadedAt: typeof uploadedAt === "string" ? uploadedAt : new Date(0).toISOString(),
    stage: stage === "SUPPLEMENT" ? "SUPPLEMENT" : "INITIAL",
  };
}

/** 저장된 Json → 서류 목록. 봉투도, (다른 도구가 남긴) 맨 배열도 읽는다. */
export function readDocuments(raw: unknown): RefundDocumentMeta[] {
  const list = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.files) ? raw.files : [];
  return list
    .map(toDocumentMeta)
    .filter((doc): doc is RefundDocumentMeta => doc !== null)
    .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
}

/** 저장된 Json → 계산 입력. 없으면 계약·연도 컬럼으로 최대한 복원한다(방어용). */
export function readStoredCalc(row: RefundApplicationRow): RefundStoredCalc {
  const raw = row.documents as unknown;
  if (isRecord(raw) && isRecord(raw.calc)) {
    const calc = raw.calc;
    if (
      typeof calc.monthlyRent === "number" &&
      typeof calc.startDate === "string" &&
      typeof calc.endDate === "string"
    ) {
      return {
        monthlyRent: calc.monthlyRent,
        startDate: calc.startDate,
        endDate: calc.endDate,
        asOf:
          typeof calc.asOf === "string"
            ? calc.asOf
            : formatDateOnly(row.submittedAt ?? row.createdAt),
      };
    }
  }

  // 봉투가 없을 때의 최선 — 계약이 붙어 있으면 계약에서, 아니면 저장된 연도 범위에서
  return {
    monthlyRent: row.lease?.monthlyRent ?? 0,
    startDate: row.lease ? formatDateOnly(row.lease.startDate) : `${row.startYear}-01-01`,
    endDate: row.lease ? formatDateOnly(row.lease.endDate) : `${row.endYear}-12-31`,
    asOf: formatDateOnly(row.submittedAt ?? row.createdAt),
  };
}

/** 봉투를 만든다 — 쓰기는 언제나 이 함수를 거친다 */
export function buildDocumentsEnvelope(
  files: readonly RefundDocumentMeta[],
  calc: RefundStoredCalc,
): RefundDocumentsEnvelope {
  return { version: 1, files: [...files], calc };
}

/** 저장된 입력으로 산출 내역을 되돌린다 — `expectedAmount` 와 언제나 같은 값이 나온다 */
export function deriveCalcResult(row: RefundApplicationRow): RefundCalcResult {
  const stored = readStoredCalc(row);
  const input: RefundCalcInput = {
    grossSalary: row.annualIncome,
    monthlyRent: stored.monthlyRent,
    startDate: stored.startDate,
    endDate: stored.endDate,
  };
  const asOf = parseDateOnly(stored.asOf) ?? kstToday();
  return calculateRefund(input, asOf);
}

/**
 * 계산 결과 → `RefundApplication` 컬럼 (T2.3 문서가 정한 매핑 그대로).
 * `years` 가 비면(소급 범위 밖·대상 외) 입력 연도를 그대로 쓴다.
 */
export function toApplicationColumns(
  input: RefundCalcInput,
  result: RefundCalcResult,
): { annualIncome: number; startYear: number; endYear: number; expectedAmount: number } {
  const first = result.years[0]?.year ?? Number(input.startDate.slice(0, 4));
  const last = result.years.at(-1)?.year ?? Number(input.endDate.slice(0, 4));
  return {
    annualIncome: input.grossSalary,
    startYear: first,
    endYear: last,
    expectedAmount: result.totals.creditAmount,
  };
}

function toLeaseOption(lease: RefundLeaseRow): RefundLeaseOptionDto {
  return {
    leaseId: lease.id,
    unitLabel: lease.unit.label,
    buildingName: lease.unit.building.name,
    landlordName: lease.unit.building.ownerProfile.user.name,
    monthlyRent: lease.monthlyRent,
    startDate: formatDateOnly(lease.startDate),
    endDate: formatDateOnly(lease.endDate),
  };
}

function toDocumentDto(applicationId: string, doc: RefundDocumentMeta): RefundDocumentDto {
  return {
    id: doc.id,
    slot: doc.slot,
    slotLabel: REFUND_SLOT_META[doc.slot].label,
    name: doc.name,
    contentType: doc.contentType,
    size: doc.size,
    uploadedAt: doc.uploadedAt,
    stage: doc.stage,
    // private 스토어의 Blob URL 은 **내보내지 않는다** — 서명·인증을 거치는 이 경로만 준다
    viewHref: `/api/refunds/${applicationId}/documents/${doc.id}`,
  };
}

/** 신청 1건 → 화면 DTO */
export function toApplicationDto(row: RefundApplicationRow): RefundApplicationDto {
  const status = row.status as RefundStatusValue;
  const documents = readDocuments(row.documents);
  const stored = readStoredCalc(row);
  const meta = REFUND_STATUS_META[status];

  return {
    id: row.id,
    status,
    statusLabel: meta.label,
    statusTone: meta.tone,
    statusDescription: meta.description,

    annualIncome: row.annualIncome,
    monthlyRent: stored.monthlyRent,
    startDate: stored.startDate,
    endDate: stored.endDate,
    asOf: stored.asOf,

    startYear: row.startYear,
    endYear: row.endYear,
    expectedAmount: row.expectedAmount,

    leaseId: row.leaseId,
    lease: row.lease ? toLeaseOption(row.lease) : null,

    documents: documents.map((doc) => toDocumentDto(row.id, doc)),
    missingSlots: missingRequiredSlots(documents),

    reviewNote: row.reviewNote,
    reviewedByName: row.reviewedBy?.name ?? null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),

    calc: deriveCalcResult(row),

    canEdit: isEditableStatus(status),
    canUpload: isUploadableStatus(status),
    canSubmit: submitTargetFor(status) !== null && missingRequiredSlots(documents).length === 0,
    availableActions: availableReviewActions(status).map((t) => ({
      action: t.action,
      label: t.label,
      targetStatus: t.to,
      requiresNote: t.requiresNote,
    })),
  };
}

/** 어드민 큐 행 — 신청 DTO + 신청자 */
export function toReviewItemDto(row: RefundApplicationRow): RefundReviewItemDto {
  return {
    ...toApplicationDto(row),
    tenantName: row.tenantProfile.user.name,
    tenantPhone: row.tenantProfile.user.phone,
    tenantProfileId: row.tenantProfileId,
  };
}

/** 내 신청 목록 — 최신순 */
export async function getMyApplications(tenantProfileId: string): Promise<RefundApplicationDto[]> {
  const rows = await prisma.refundApplication.findMany({
    where: { tenantProfileId },
    include: REFUND_APPLICATION_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toApplicationDto);
}

/** 내 작성중(DRAFT) 신청 — 신청서 화면이 이어서 쓰라고 집어 준다 */
export async function getMyDraft(tenantProfileId: string): Promise<RefundApplicationDto | null> {
  const row = await prisma.refundApplication.findFirst({
    where: { tenantProfileId, status: "DRAFT" },
    include: REFUND_APPLICATION_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return row ? toApplicationDto(row) : null;
}

/** 신청서 「내 계약 자동 채움」 선택지 */
export async function getLeaseOptions(tenantProfileId: string): Promise<RefundLeaseOptionDto[]> {
  const leases = await prisma.lease.findMany({
    where: { tenantProfileId },
    include: {
      unit: { include: { building: { include: { ownerProfile: { include: { user: true } } } } } },
    },
    orderBy: { startDate: "desc" },
  });
  return leases.map(toLeaseOption);
}

/** 어드민 심사 큐 — 상태 필터. 오래 기다린 순(제출 시각 오름차순)이 위로 온다. */
export async function getReviewQueue(
  statuses: readonly RefundStatusValue[],
): Promise<RefundReviewItemDto[]> {
  const rows = await prisma.refundApplication.findMany({
    where: { status: { in: [...statuses] } },
    include: REFUND_APPLICATION_INCLUDE,
    orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toReviewItemDto);
}

/** 상태별 건수 — 어드민 필터 탭의 뱃지 */
export async function getStatusCounts(): Promise<Record<RefundStatusValue, number>> {
  const grouped = await prisma.refundApplication.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const counts = {
    DRAFT: 0,
    SUBMITTED: 0,
    REVIEWING: 0,
    NEED_MORE_DOCS: 0,
    APPROVED: 0,
    REJECTED: 0,
    COMPLETED: 0,
  } satisfies Record<RefundStatusValue, number>;
  for (const row of grouped) {
    counts[row.status as RefundStatusValue] = row._count._all;
  }
  return counts;
}
