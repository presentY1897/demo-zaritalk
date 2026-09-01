/**
 * `POST /api/leases/[id]/accept` — 세입자가 대기 계약을 수락한다 (T1.3).
 *
 * **계약이 `PENDING_TENANT` → `ACTIVE` 로 넘어가는 유일한 경로다.**
 * `PATCH /api/leases/[id]`(T1.2)는 `status: "ACTIVE"` 를 일부러 받지 않는다 —
 * 임대인이 혼자 계약을 성립시키면 안 되기 때문이다.
 *
 * 수락하면 세 값을 한 번에 기록한다: `tenantProfileId`(내 프로필) · `tenantAcceptedAt`(지금) · `status = ACTIVE`.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 세입자 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 계약 | 404 `NOT_FOUND` |
 * | **내 번호로 등록된 계약이 아님** | 403 `FORBIDDEN` |
 * | **이미 ACTIVE**·종료·취소, 또는 **다른 사람이 먼저 수락** | 409 `CONFLICT` |
 *
 * ## 왜 수락하면서 이번 달 청구를 확보하는가
 * 크론(T1.4)은 **ACTIVE 계약만** 훑고 **당월만** 만든다. 계약 등록 시점(T1.2)에 만들어 둔 첫 청구는
 * 그때의 당월이라, 세입자가 한 달 뒤에 수락하면 크론이 도는 새벽까지 세입자 홈에 이번 달 청구가
 * 비어 보인다. 그래서 수락 순간에 **크론과 같은 규칙**(`resolveInitialChargeMonth` + `buildChargeDraft`,
 * 전월 잔액 이월 포함)으로 이번 달 청구를 확보한다 — 크론이 하룻밤 뒤 할 일을 앞당길 뿐이라
 * 금액이 달라지지 않고, `@@unique([leaseId, year, month])` 가 중복을 막는다.
 */
import { LeaseStatus, prisma } from "@zari/db";
import { toChargeDto } from "@/features/lease/queries";
import { resolveInitialChargeMonth } from "@/features/lease/rules";
import { requireMatchedLease, requireTenant, type MatchedLease } from "@/features/tenant/ownership";
import { getTenantLease } from "@/features/tenant/queries";
import { fail, ok } from "@/lib/api/response";
import { buildChargeDraft, kstToday, previousMonth } from "@/lib/rent";

type Context = { params: Promise<{ id: string }> };

/** 유니크 위반(P2002) — 같은 계약을 동시에 수락해도 청구가 두 번 생기지 않게 흡수한다. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

/**
 * 이번 달 청구를 확보한다(이미 있으면 그대로 쓴다). 계약 기간 밖이면 만들지 않는다.
 * 금액은 한 줄도 직접 계산하지 않는다 — `buildChargeDraft` 가 만든 draft 를 그대로 저장한다.
 */
async function ensureCurrentCharge(lease: MatchedLease, asOf: Date): Promise<string | null> {
  const month = resolveInitialChargeMonth(
    { startDate: lease.startDate, endDate: lease.endDate },
    asOf,
  );
  if (!month) return null;

  const existing = await prisma.rentCharge.findUnique({
    where: { leaseId_year_month: { leaseId: lease.id, year: month.year, month: month.month } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const before = previousMonth(month);
  const previousCharge = await prisma.rentCharge.findUnique({
    where: { leaseId_year_month: { leaseId: lease.id, year: before.year, month: before.month } },
    select: { dueDate: true, totalDue: true, paidAmount: true },
  });

  const draft = buildChargeDraft({
    lease: {
      monthlyRent: lease.monthlyRent,
      maintenanceFee: lease.maintenanceFee,
      paymentDay: lease.paymentDay,
      lateFeeRatePct: lease.lateFeeRatePct,
    },
    year: month.year,
    month: month.month,
    previousCharge,
    asOf,
  });

  try {
    const charge = await prisma.rentCharge.create({ data: { leaseId: lease.id, ...draft } });
    return charge.id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // 동시 수락으로 방금 다른 요청이 만들었다 — 그 청구를 쓴다
    const created = await prisma.rentCharge.findUnique({
      where: { leaseId_year_month: { leaseId: lease.id, year: month.year, month: month.month } },
      select: { id: true },
    });
    return created?.id ?? null;
  }
}

export async function POST(_request: Request, context: Context): Promise<Response> {
  const tenant = await requireTenant();
  if (tenant.response) return tenant.response;

  const { id } = await context.params;
  const matched = await requireMatchedLease(tenant.data, id);
  if (matched.response) return matched.response;
  const lease = matched.data;

  if (lease.status !== LeaseStatus.PENDING_TENANT || lease.tenantProfileId) {
    return fail(
      "CONFLICT",
      lease.tenantProfileId && lease.tenantProfileId !== tenant.data.profile.id
        ? "이미 다른 계정에 연결된 계약입니다."
        : "이미 처리된 계약입니다.",
    );
  }

  // 상태·연결을 조건에 넣은 단일 UPDATE — 두 요청이 겹쳐도 한쪽만 성공한다(count 0 → 409)
  const accepted = await prisma.lease.updateMany({
    where: { id, status: LeaseStatus.PENDING_TENANT, tenantProfileId: null },
    data: {
      status: LeaseStatus.ACTIVE,
      tenantProfileId: tenant.data.profile.id,
      tenantAcceptedAt: new Date(),
    },
  });
  if (accepted.count === 0) return fail("CONFLICT", "이미 처리된 계약입니다.");

  const asOf = kstToday();
  const chargeId = await ensureCurrentCharge(lease, asOf);

  const updated = await getTenantLease(id);
  if (!updated) return fail("INTERNAL_ERROR", "계약을 저장하지 못했습니다.");

  const chargeRow = chargeId
    ? await prisma.rentCharge.findUnique({
        where: { id: chargeId },
        include: { payments: { orderBy: [{ paidAt: "asc" }, { id: "asc" }] } },
      })
    : null;

  return ok({ lease: updated, charge: chargeRow ? toChargeDto(chargeRow, asOf) : null });
}
