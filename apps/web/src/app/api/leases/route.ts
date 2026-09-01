/**
 * `GET·POST /api/leases` — 내 계약 목록·등록 (T1.2).
 *
 * 등록하면 계약은 곧바로 `PENDING_TENANT`(세입자 미연결)로 만들어지고
 * **당월 청구(RentCharge)가 함께 생성**된다. 청구 금액·납부기한은 한 줄도 직접 계산하지 않고
 * 원장 엔진(T1.4)의 `buildChargeDraft` 가 만든 draft 를 그대로 저장한다
 * (`draft.dueDate` 가 곧 계약의 납부일 — 말일 보정까지 끝난 값).
 *
 * 크론은 `ACTIVE` 계약만 훑으므로(T1.4), 연결 전 계약의 첫 청구는 여기서만 생긴다.
 */
import { LeaseStatus, prisma } from "@zari/db";
import { requireLandlord, requireOwnedUnit } from "@/features/landlord/ownership";
import { getLeaseDetail, listLeases, toChargeDto } from "@/features/lease/queries";
import { createLeaseSchema, listLeasesQuerySchema } from "@/features/lease/schema";
import { findOverlappingLease, parseDateOnly, resolveInitialChargeMonth } from "@/features/lease/rules";
import { created, fail, ok, parseJson, parseQuery } from "@/lib/api/response";
import { buildChargeDraft, kstToday } from "@/lib/rent";

export async function GET(request: Request): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const query = parseQuery(request, listLeasesQuerySchema);
  if (query.response) return query.response;

  const leases = await listLeases(landlord.data.profile.id, query.data);
  return ok({ leases });
}

export async function POST(request: Request): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const parsed = await parseJson(request, createLeaseSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  const owned = await requireOwnedUnit(landlord.data, input.unitId);
  if (owned.response) return owned.response;

  // 스키마가 형식(YYYY-MM-DD)과 순서(시작일 ≤ 종료일)는 이미 막았다.
  // 여기서 걸리는 것은 "2026-02-31" 처럼 형식은 맞지만 존재하지 않는 날짜다.
  const startDate = parseDateOnly(input.startDate);
  const endDate = parseDateOnly(input.endDate);
  if (!startDate || !endDate) {
    return fail("VALIDATION_ERROR", "존재하지 않는 날짜입니다.");
  }

  // 같은 호실 기간 중복 → 409 (판정은 `rules.ts` 순수 함수)
  const siblings = await prisma.lease.findMany({
    where: { unitId: input.unitId },
    select: { id: true, status: true, startDate: true, endDate: true, tenantName: true },
  });
  const conflict = findOverlappingLease({ startDate, endDate }, siblings);
  if (conflict) {
    return fail(
      "CONFLICT",
      `이미 ${conflict.startDate.toISOString().slice(0, 10)} ~ ${conflict.endDate
        .toISOString()
        .slice(0, 10)} 기간의 계약이 있습니다.`,
    );
  }

  const terms = {
    monthlyRent: input.monthlyRent,
    maintenanceFee: input.maintenanceFee ?? 0,
    paymentDay: input.paymentDay,
    lateFeeRatePct: input.lateFeeRatePct ?? null,
  };

  const asOf = kstToday();
  const chargeMonth = resolveInitialChargeMonth({ startDate, endDate }, asOf);

  const { leaseId, chargeId } = await prisma.$transaction(async (tx) => {
    const lease = await tx.lease.create({
      data: {
        unitId: input.unitId,
        tenantName: input.tenantName,
        tenantPhone: input.tenantPhone,
        deposit: input.deposit,
        ...terms,
        startDate,
        endDate,
        status: LeaseStatus.PENDING_TENANT,
      },
    });

    if (!chargeMonth) return { leaseId: lease.id, chargeId: null as string | null };

    // 신규 계약이라 전월 청구가 없다 → 이월·연체료 0. 총액·상태는 엔진이 정한다
    const draft = buildChargeDraft({
      lease: terms,
      year: chargeMonth.year,
      month: chargeMonth.month,
      previousCharge: null,
      asOf,
    });
    const charge = await tx.rentCharge.create({ data: { leaseId: lease.id, ...draft } });
    return { leaseId: lease.id, chargeId: charge.id };
  });

  const lease = await getLeaseDetail(leaseId);
  if (!lease) return fail("INTERNAL_ERROR", "계약을 저장하지 못했습니다.");

  const chargeRow = chargeId
    ? await prisma.rentCharge.findUnique({
        where: { id: chargeId },
        include: { payments: true },
      })
    : null;

  return created({ lease, charge: chargeRow ? toChargeDto(chargeRow, asOf) : null });
}
