/**
 * `GET·PATCH /api/leases/[id]` — 계약 상세·수정·종료 (T1.2).
 *
 * ## 계약 종료(ENDED) 규칙
 *
 * | 항목 | 규칙 |
 * |---|---|
 * | 종료일 | `endDate` 를 함께 보내면 그 날로, 생략하면 **오늘(KST)** 로 당긴다(시작일보다 이르면 시작일) |
 * | 종료일 **이후** 청구 | `dueDate > endDate` 이고 **납부 기록이 하나도 없는** 청구는 삭제한다 — 받을 근거가 없는 달이다 |
 * | 종료일 **이내** 미납 청구 | **그대로 남긴다.** 계약이 끝나도 채권은 남는다(보증금 정산·환급 T2.3 이 이 청구를 본다) |
 * | 이후 청구 생성 | 크론은 `ACTIVE` 만 훑으므로 종료 뒤에는 새 청구가 생기지 않는다(T1.4) |
 *
 * 응답의 `settlement` 가 "몇 건을 지웠고 미납 몇 건·얼마가 남았는지"를 알려 준다 —
 * 화면이 "미납 1건 1,015,500원이 남아 있습니다" 를 그대로 보여 준다.
 *
 * `status` 로는 `ENDED` 만 받는다. `ACTIVE` 전환(세입자 수락)은 T1.3 소유다.
 */
import { LeaseStatus, prisma } from "@zari/db";
import { requireLandlord } from "@/features/landlord/ownership";
import { requireOwnedLease } from "@/features/lease/ownership";
import { getLeaseDetail } from "@/features/lease/queries";
import { findOverlappingLease, isValidPeriod, parseDateOnly } from "@/features/lease/rules";
import { updateLeaseSchema } from "@/features/lease/schema";
import { fail, ok, parseJson } from "@/lib/api/response";
import { calcOutstanding, kstToday } from "@/lib/rent";
import type { LeaseEndSettlementDto } from "@/features/lease/types";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const { id } = await context.params;
  const owned = await requireOwnedLease(landlord.data, id);
  if (owned.response) return owned.response;

  const lease = await getLeaseDetail(id);
  if (!lease) return fail("NOT_FOUND", "계약을 찾을 수 없습니다.");
  return ok({ lease });
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const { id } = await context.params;
  const owned = await requireOwnedLease(landlord.data, id);
  if (owned.response) return owned.response;
  const current = owned.data;

  const parsed = await parseJson(request, updateLeaseSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  const ending = input.status === "ENDED";
  if (ending && current.status !== LeaseStatus.PENDING_TENANT && current.status !== LeaseStatus.ACTIVE) {
    return fail("CONFLICT", "이미 종료된 계약입니다.");
  }

  const startDate = input.startDate ? parseDateOnly(input.startDate) : current.startDate;
  const requestedEnd = input.endDate ? parseDateOnly(input.endDate) : current.endDate;
  if (!startDate || !requestedEnd) return fail("VALIDATION_ERROR", "존재하지 않는 날짜입니다.");

  // 종료일을 따로 주지 않은 "지금 종료"는 오늘로 당긴다(계약 시작 전이면 시작일)
  const today = kstToday();
  const endDate =
    ending && !input.endDate
      ? today.getTime() < startDate.getTime()
        ? startDate
        : today
      : requestedEnd;

  if (!isValidPeriod({ startDate, endDate })) {
    return fail("VALIDATION_ERROR", "계약 종료일은 시작일보다 빠를 수 없습니다.");
  }

  // 기간이 바뀌면 같은 호실의 다른 진행 중 계약과 겹치는지 다시 본다(자기 자신은 제외)
  const periodChanged =
    startDate.getTime() !== current.startDate.getTime() ||
    endDate.getTime() !== current.endDate.getTime();
  if (periodChanged && !ending) {
    const siblings = await prisma.lease.findMany({
      where: { unitId: current.unitId },
      select: { id: true, status: true, startDate: true, endDate: true },
    });
    const conflict = findOverlappingLease({ startDate, endDate }, siblings, { excludeLeaseId: id });
    if (conflict) {
      return fail(
        "CONFLICT",
        `이미 ${conflict.startDate.toISOString().slice(0, 10)} ~ ${conflict.endDate
          .toISOString()
          .slice(0, 10)} 기간의 계약이 있습니다.`,
      );
    }
  }

  let settlement: LeaseEndSettlementDto | undefined;

  await prisma.$transaction(async (tx) => {
    await tx.lease.update({
      where: { id },
      data: {
        ...(input.tenantName === undefined ? {} : { tenantName: input.tenantName }),
        ...(input.tenantPhone === undefined ? {} : { tenantPhone: input.tenantPhone }),
        ...(input.deposit === undefined ? {} : { deposit: input.deposit }),
        ...(input.monthlyRent === undefined ? {} : { monthlyRent: input.monthlyRent }),
        ...(input.maintenanceFee === undefined ? {} : { maintenanceFee: input.maintenanceFee }),
        ...(input.paymentDay === undefined ? {} : { paymentDay: input.paymentDay }),
        ...(input.lateFeeRatePct === undefined ? {} : { lateFeeRatePct: input.lateFeeRatePct }),
        startDate,
        endDate,
        ...(ending ? { status: LeaseStatus.ENDED } : {}),
      },
    });

    if (!ending) return;

    const charges = await tx.rentCharge.findMany({
      where: { leaseId: id },
      select: {
        id: true,
        dueDate: true,
        totalDue: true,
        paidAmount: true,
        _count: { select: { payments: true, messageLogs: true } },
      },
    });

    /**
     * 종료일 이후의 달은 받을 근거가 없다. 단 두 가지는 지우지 않는다:
     * - **납부 기록이 있는 청구** — 받은 돈의 근거가 사라진다
     * - **고지서를 보낸 청구** — `MessageLog.chargeId` 는 optional FK 라 SetNull 이다.
     *   지우면 이미 세입자에게 나간 공개 고지서(T1.8)가 금액을 잃는다.
     */
    const removable = charges.filter(
      (charge) =>
        charge.dueDate.getTime() > endDate.getTime() &&
        charge._count.payments === 0 &&
        charge._count.messageLogs === 0,
    );
    if (removable.length > 0) {
      await tx.rentCharge.deleteMany({ where: { id: { in: removable.map((c) => c.id) } } });
    }

    const removableIds = new Set(removable.map((c) => c.id));
    const remaining = charges.filter((charge) => !removableIds.has(charge.id));
    const unpaid = remaining
      .map((charge) => calcOutstanding(charge.totalDue, charge.paidAmount))
      .filter((amount) => amount > 0);

    settlement = {
      removedScheduledCharges: removable.length,
      remainingUnpaidCount: unpaid.length,
      remainingUnpaidAmount: unpaid.reduce((sum, amount) => sum + amount, 0),
    };
  });

  const lease = await getLeaseDetail(id);
  if (!lease) return fail("NOT_FOUND", "계약을 찾을 수 없습니다.");
  return ok(settlement ? { lease, settlement } : { lease });
}
