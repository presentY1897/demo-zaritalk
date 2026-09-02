/**
 * 환급 신청 API 테스트 픽스처 (T2.4·T2.5) — **테스트에서만 import 한다**(앱 코드에서 쓰지 않는다).
 *
 * 계정·건물·호실은 T1.1 `features/landlord/testing.ts`, 계약은 T1.2 `features/lease/testing.ts`,
 * 세입자는 T1.3 `features/tenant/testing.ts` 를 재사용하고 — 여기서는 **신청서와 서류**만 더한다.
 *
 * 업로드는 실제 Blob 을 타지 않는다: 테스트 DB(`zari_test…`)를 보고 있으면
 * `features/refund/storage.ts` 가 메모리 드라이버로 떨어진다(그 파일 주석 참고).
 */
import { LeaseStatus, prisma, ProfileType, type RefundStatus } from "@zari/db";
import { createLandlordWithUnit } from "@/features/lease/testing";
import { createPendingLease, createTenant } from "@/features/tenant/testing";
import { formatDateOnly } from "@/features/lease/rules";
import { kstToday } from "@/lib/rent";
import type { RefundDocumentMeta, RefundDocumentSlot } from "./documents";
import { buildDocumentsEnvelope, type RefundStoredCalc } from "./queries";
import { buildApplicationWrite } from "./service";

/** 시드 세입자(박세입)와 같은 번호 */
export const REFUND_TENANT_PHONE = "01022222222";
/** 시드 임대인(김임대)과 같은 번호 */
export const REFUND_LANDLORD_PHONE = "01011111111";
/** 시드 관리자와 같은 번호 */
export const REFUND_ADMIN_PHONE = "01000000000";

/** 계산 입력 기본값 — 작년 한 해(언제 돌려도 소급 5년 창 안이고 미래가 아니다) */
export function defaultCalcInput() {
  const lastYear = kstToday().getUTCFullYear() - 1;
  return {
    grossSalary: 48_000_000,
    monthlyRent: 500_000,
    startDate: `${lastYear}-01-01`,
    endDate: `${lastYear}-12-31`,
  };
}

export type RefundScene = Awaited<ReturnType<typeof createRefundScene>>;

/** 공통 무대 — 임대인 + 건물/호실 + 연결된 ACTIVE 계약 + 세입자 */
export async function createRefundScene(
  options: {
    landlordPhone?: string;
    tenantPhone?: string;
    tenantName?: string;
    unitLabel?: string;
  } = {},
) {
  const landlord = await createLandlordWithUnit(options.landlordPhone ?? REFUND_LANDLORD_PHONE, [
    options.unitLabel ?? "201호",
  ]);
  const tenant = await createTenant(
    options.tenantPhone ?? REFUND_TENANT_PHONE,
    options.tenantName ?? "박세입",
  );
  const lease = await createPendingLease(landlord.unit.id, {
    tenantPhone: options.tenantPhone ?? REFUND_TENANT_PHONE,
    tenantName: options.tenantName ?? "박세입",
    tenantProfileId: tenant.profile.id,
    status: LeaseStatus.ACTIVE,
  });
  return { landlord, tenant, lease };
}

/** 겹치지 않는 두 번째 무대 — "남의 신청 403" 검증용 */
export function createOtherRefundScene() {
  return createRefundScene({
    landlordPhone: "01099999999",
    tenantPhone: "01066666666",
    tenantName: "이세입",
    unitLabel: "401호",
  });
}

/** 관리자 계정 (`isAdmin: true`) — 심사 API 가 유일하게 인정하는 신분 */
export async function createAdmin(phone = REFUND_ADMIN_PHONE, name = "관리자") {
  return prisma.user.create({ data: { phone, name, isAdmin: true } });
}

/** 어드민이 아닌 일반 계정 — 「비어드민 403」 검증용 */
export async function createNonAdmin(phone = "01077777777", name = "일반") {
  return prisma.user.create({
    data: { phone, name, profiles: { create: { type: ProfileType.TENANT } } },
    include: { profiles: true },
  });
}

/** 서류 메타 1건 — 실제 파일 없이 `documents` 봉투만 채운다(제출 검증용) */
export function docMeta(
  slot: RefundDocumentSlot,
  overrides: Partial<RefundDocumentMeta> = {},
): RefundDocumentMeta {
  const id = overrides.id ?? `doc${Math.random().toString(36).slice(2, 10)}`;
  return {
    id,
    slot,
    name: `${slot}.pdf`,
    contentType: "application/pdf",
    size: 1024,
    pathname: `refunds/test/${id}.pdf`,
    url: `memory://zari-demo-docs/refunds/test/${id}.pdf`,
    uploadedAt: new Date().toISOString(),
    stage: "INITIAL",
    ...overrides,
  };
}

/** 필수 서류(계약서·등본) 2장 */
export function requiredDocs(): RefundDocumentMeta[] {
  return [docMeta("LEASE_CONTRACT"), docMeta("RESIDENT_REGISTRATION")];
}

/** 신청 1건 — 상태·서류·심사 필드를 직접 세워 두고 전이만 테스트할 수 있게 한다 */
export async function createApplication(
  scene: { tenant: { profile: { id: string } }; lease?: { id: string } },
  overrides: {
    status?: RefundStatus;
    documents?: RefundDocumentMeta[];
    leaseId?: string | null;
    submittedAt?: Date | null;
    decidedAt?: Date | null;
    reviewNote?: string | null;
    reviewedById?: string | null;
    calc?: Partial<RefundStoredCalc>;
  } = {},
) {
  const input = defaultCalcInput();
  const asOf = kstToday();
  const write = buildApplicationWrite(
    { ...input, leaseId: overrides.leaseId ?? null },
    asOf,
    overrides.documents ?? [],
  );

  const stored: RefundStoredCalc = {
    monthlyRent: input.monthlyRent,
    startDate: input.startDate,
    endDate: input.endDate,
    asOf: formatDateOnly(asOf),
    ...overrides.calc,
  };

  return prisma.refundApplication.create({
    data: {
      tenantProfileId: scene.tenant.profile.id,
      annualIncome: write.annualIncome,
      startYear: write.startYear,
      endYear: write.endYear,
      expectedAmount: write.expectedAmount,
      leaseId: overrides.leaseId ?? null,
      status: overrides.status ?? "DRAFT",
      submittedAt: overrides.submittedAt ?? null,
      decidedAt: overrides.decidedAt ?? null,
      reviewNote: overrides.reviewNote ?? null,
      reviewedById: overrides.reviewedById ?? null,
      documents: buildDocumentsEnvelope(overrides.documents ?? [], stored) as never,
    },
  });
}

/** 업로드 테스트용 파일 — 내용은 아무 바이트나 채운다 */
export function fakeFile(name: string, type: string, bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

/** `multipart/form-data` 업로드 요청 */
export function uploadRequest(fields: {
  applicationId?: string;
  slot?: string;
  file?: File;
}): Request {
  const form = new FormData();
  if (fields.applicationId !== undefined) form.set("applicationId", fields.applicationId);
  if (fields.slot !== undefined) form.set("slot", fields.slot);
  if (fields.file) form.set("file", fields.file);
  return new Request("http://localhost/api/uploads", { method: "POST", body: form });
}
