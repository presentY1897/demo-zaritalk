/**
 * `PATCH /api/work-orders/[id]` — 작업 의뢰 완료·취소 (T5.1, T5.3 이 민원 연동을 얹었다).
 * **의뢰를 낸 임대인 전용.**
 *
 * 권한 판정은 `features/workorder/ownership.ts` 한 곳(`requireOwnWorkOrder`),
 * 전이 허용 여부는 `features/workorder/status.ts` 의 전이표(`canTransitionWorkOrder`) 한 곳에서만 한다.
 *
 * ## 완료하면 **연결된 민원도 함께 닫는다** (T5.3)
 *
 * `WorkOrder.complaintId` 가 있는 의뢰(= 민원에서 전환된 의뢰)를 `DONE` 으로 옮기면
 * 그 민원도 `RESOLVED` 로 닫는다. 세입자가 접수한 일이 실제로 끝났다는 사실이 세입자 화면에
 * 닿아야 3역할 여정이 닫히기 때문이다. 규칙 셋:
 *
 * 1. **전이 판정은 T2.6 의 `canTransition` 을 그대로 부른다** — 민원 전이표를 여기서 다시 쓰지 않는다.
 * 2. **허용되지 않는 전이면 민원은 그대로 두고, 의뢰 완료는 성공시킨다.** 막히는 경우는 둘이다 —
 *    이미 `RESOLVED`(원하는 상태에 이미 있다)와 `REJECTED`(임대인이 반려로 닫은 판단을
 *    작업 완료가 조용히 뒤집으면 안 된다). 어느 쪽도 "의뢰를 완료하지 못할" 이유는 아니다.
 * 3. **의뢰와 민원은 같은 트랜잭션에서 바뀐다** — 둘이 갈라지면 "작업은 끝났는데 민원은 진행중"
 *    같은 거짓말이 세입자 화면에 남는다.
 *
 * 응답의 `complaintStatus` 는 **실제로 저장된 민원 상태**다(막힌 경우 바뀌지 않은 원래 값).
 * 연결 민원이 없으면 null.
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
 * > **`ASSIGNED` 를 요청 스키마에 넣지 않은 이유** — 배정은 사람이 고르는 값이 아니라
 * > 견적 수락(`POST /api/quotes/[id]/accept`)이 옮기는 값이다. T5.1 이 세운 이 규칙은
 * > T5.3 에서도 그대로다(그래서 이 라우트의 요청 enum 은 손대지 않았다).
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
import { prisma } from "@zari/db";
import { canTransition } from "@/features/complaint/status";
import type { ComplaintStatusValue } from "@/features/complaint/types";
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

  // 연결된 민원(민원에서 전환된 의뢰)이면 지금 상태를 읽어 둔다
  const complaintId = owned.data.complaintId;
  const complaint = complaintId
    ? await prisma.complaint.findUnique({
        where: { id: complaintId },
        select: { id: true, status: true },
      })
    : null;
  const complaintFrom = (complaint?.status ?? null) as ComplaintStatusValue | null;
  // 완료할 때만, 그리고 T2.6 전이표가 허용할 때만 민원을 닫는다(막히면 그대로 둔다)
  const resolvesComplaint =
    to === "DONE" && complaintFrom !== null && canTransition(complaintFrom, "RESOLVED");

  // 전이 전 상태를 조건에 넣은 단일 UPDATE — 두 요청이 겹쳐도 한쪽만 성공한다(T2.6 과 같은 패턴).
  // 민원까지 같은 트랜잭션에 넣어 "작업은 끝났는데 민원은 진행중" 이 남지 않게 한다.
  const changedComplaint = await prisma.$transaction(async (tx) => {
    const result = await tx.workOrder.updateMany({
      where: { id, status: from },
      data: { status: to },
    });
    if (result.count === 0) return null;
    if (!resolvesComplaint || !complaint) return false;
    await tx.complaint.updateMany({
      where: { id: complaint.id, status: complaintFrom },
      data: { status: "RESOLVED" },
    });
    return true;
  });
  if (changedComplaint === null) return fail("CONFLICT", "이미 다른 상태로 처리된 의뢰입니다.");

  const workOrder = await getLandlordWorkOrder(id);
  if (!workOrder) return fail("INTERNAL_ERROR", "의뢰 상태를 저장하지 못했습니다.");

  const complaintStatus: ComplaintStatusValue | null = changedComplaint
    ? "RESOLVED"
    : complaintFrom;
  return ok({ workOrder, complaintStatus });
}
