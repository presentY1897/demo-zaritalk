/**
 * `PATCH /api/work-orders/[id]` — 작업 의뢰 완료·취소 (T5.1). **의뢰를 낸 임대인 전용.**
 *
 * 권한 판정은 `features/workorder/ownership.ts` 한 곳(`requireOwnWorkOrder`),
 * 전이 허용 여부는 `features/workorder/status.ts` 의 전이표(`canTransitionWorkOrder`) 한 곳에서만 한다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 임대인 프로필 없음 | 403 `FORBIDDEN` |
 * | 없는 의뢰 | 404 `NOT_FOUND` |
 * | **남의 의뢰** | 403 `FORBIDDEN` |
 * | `QUOTED`·`ASSIGNED` 등 고를 수 없는 값 | 400 `VALIDATION_ERROR` |
 * | 이미 종결된 의뢰·같은 상태 | 409 `CONFLICT` |
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
import { prisma } from "@zari/db";
import { requireLandlord } from "@/features/landlord/ownership";
import { requireOwnWorkOrder } from "@/features/workorder/ownership";
import { getLandlordWorkOrder } from "@/features/workorder/queries";
import { updateWorkOrderSchema } from "@/features/workorder/schema";
import {
  canTransitionWorkOrder,
  workOrderTransitionRejectReason,
} from "@/features/workorder/status";
import type { WorkOrderStatusValue } from "@/features/workorder/types";
import { fail, ok, parseJson } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  const landlord = await requireLandlord();
  if (landlord.response) return landlord.response;

  const owned = await requireOwnWorkOrder(landlord.data, id);
  if (owned.response) return owned.response;

  const parsed = await parseJson(request, updateWorkOrderSchema);
  if (parsed.response) return parsed.response;

  const from = owned.data.status as WorkOrderStatusValue;
  const to = parsed.data.status;
  if (!canTransitionWorkOrder(from, to)) {
    return fail("CONFLICT", workOrderTransitionRejectReason(from, to));
  }

  // 전이 전 상태를 조건에 넣은 단일 UPDATE — 두 요청이 겹쳐도 한쪽만 성공한다(T2.6 과 같은 패턴)
  const updated = await prisma.workOrder.updateMany({
    where: { id, status: from },
    data: { status: to },
  });
  if (updated.count === 0) return fail("CONFLICT", "이미 다른 상태로 처리된 의뢰입니다.");

  const workOrder = await getLandlordWorkOrder(id);
  if (!workOrder) return fail("INTERNAL_ERROR", "의뢰 상태를 저장하지 못했습니다.");
  return ok({ workOrder });
}
