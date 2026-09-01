/**
 * `POST /api/leases/[id]/decline` — 세입자가 대기 계약을 거절한다 (T1.3).
 *
 * ## 거절하면 계약을 어떤 상태로 두는가 — `CANCELLED`
 *
 * | 후보 | 판단 |
 * |---|---|
 * | 그대로 두고 세입자에게만 숨김 | **불가.** `Lease` 에 "숨김" 컬럼이 없어 스키마 변경이 필요하고, 이 task 는 스키마를 건드리지 않는다. 무엇보다 임대인 화면에는 계속 「세입자 연결 대기」로 남고 호실도 「대기」로 잠긴 채여서, 임대인이 **잘못 적은 번호를 영원히 모른다** |
 * | `ENDED` | 아니다. 성립한 적 없는 계약을 "종료" 로 남기면 임대장부(T1.6)·정산(T2.3)이 이력으로 읽는다 |
 * | **`CANCELLED`** | ✅ 임대인 화면에 「취소」 배지(T1.2 `LEASE_STATUS_META`)로 드러나고, 호실 그리드는 진행 중 계약이 없어져 **공실**로 돌아가며(`deriveUnitStatus`), 기간 중복 판정에서도 빠져(`BLOCKING_LEASE_STATUSES`) 임대인이 같은 기간으로 **바로 다시 등록**할 수 있다 |
 *
 * `tenantProfileId`·`tenantAcceptedAt` 은 **채우지 않는다** — 거절은 연결이 아니다.
 *
 * ## 청구 정리
 * 성립하지 않은 계약의 청구는 받을 근거가 없다. 다만 **납부 기록이 있거나 고지서를 보낸 청구는 남긴다**
 * (T1.2 계약 종료가 "이미 받은 돈의 근거는 지우지 않는다" 로 세운 원칙과 같다. 보낸 고지서는
 * 공개 페이지 T1.8 이 아직 참조한다). 지우지 않으면 임대인 홈(T1.9)이 성립하지도 않은 계약의
 * 청구를 **미납·연체로 계속 세게 된다** — 대시보드는 계약 상태를 가리지 않고 청구를 집계한다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 세입자 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 계약 | 404 `NOT_FOUND` |
 * | 내 번호로 등록된 계약이 아님 | 403 `FORBIDDEN` |
 * | 이미 수락(ACTIVE)·종료·취소된 계약 | 409 `CONFLICT` |
 */
import { LeaseStatus, prisma } from "@zari/db";
import { requireMatchedLease, requireTenant } from "@/features/tenant/ownership";
import { getTenantLease } from "@/features/tenant/queries";
import type { DeclineSettlementDto } from "@/features/tenant/types";
import { fail, ok } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

/** 근거(납부 기록·발송 고지서)가 없는 청구만 지운다. */
async function settleDeclinedCharges(leaseId: string): Promise<DeclineSettlementDto> {
  const charges = await prisma.rentCharge.findMany({
    where: { leaseId },
    select: { id: true, _count: { select: { payments: true, messageLogs: true } } },
  });

  const removable = charges.filter(
    (charge) => charge._count.payments === 0 && charge._count.messageLogs === 0,
  );
  if (removable.length > 0) {
    await prisma.rentCharge.deleteMany({ where: { id: { in: removable.map((c) => c.id) } } });
  }

  return {
    removedCharges: removable.length,
    keptCharges: charges.length - removable.length,
  };
}

export async function POST(_request: Request, context: Context): Promise<Response> {
  const tenant = await requireTenant();
  if (tenant.response) return tenant.response;

  const { id } = await context.params;
  const matched = await requireMatchedLease(tenant.data, id);
  if (matched.response) return matched.response;

  if (matched.data.status !== LeaseStatus.PENDING_TENANT || matched.data.tenantProfileId) {
    return fail("CONFLICT", "이미 처리된 계약입니다.");
  }

  const declined = await prisma.lease.updateMany({
    where: { id, status: LeaseStatus.PENDING_TENANT, tenantProfileId: null },
    data: { status: LeaseStatus.CANCELLED },
  });
  if (declined.count === 0) return fail("CONFLICT", "이미 처리된 계약입니다.");

  const settlement = await settleDeclinedCharges(id);

  const lease = await getTenantLease(id);
  if (!lease) return fail("INTERNAL_ERROR", "계약을 저장하지 못했습니다.");

  return ok({ lease, settlement });
}
