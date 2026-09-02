/**
 * `POST /api/complaints/[id]/convert` — **민원 → 작업 의뢰 전환** (T5.1). 임대인 전용.
 *
 * T2.6 이 스레드에 자리만 만들어 둔 「작업 의뢰로 전환」 버튼(`complaint-workorder-cta`)의 목적지다.
 * 전환하면 두 가지가 한 번에 일어난다:
 *
 * 1. `WorkOrder` 생성 — `complaintId` 로 민원과 **1:1** 로 묶인다(`@unique`).
 *    대상(건물·호실)은 민원이 이미 알고 있다(민원 → 계약 → 호실 → 건물). 임대인이 고를 것은 업종뿐이고,
 *    작업 내용을 비우면 민원 본문을 그대로 옮겨 적는다.
 * 2. 민원 상태 → `IN_PROGRESS` — 임대인 홈(T1.9)의 "미확인 민원" 배지에서 빠진다.
 *    **이미 `IN_PROGRESS` 면 그대로 둔다**(전이표는 같은 상태로의 전이를 막지만, 여기서 하려는 일은
 *    상태 변경이 아니라 전환이므로 409 가 아니다).
 *
 * 생성 직후 `dispatchWorkOrderTargets` 로 **추천(push)도 같이 나간다** — 직접 생성 경로
 * (`POST /api/work-orders`)와 같은 함수다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 없는 민원 | 404 `NOT_FOUND` |
 * | 제3자 · **세입자**(스레드는 보지만 전환은 임대인만) | 403 `FORBIDDEN` |
 * | **이미 전환된 민원** | 409 `CONFLICT` |
 * | 업종 누락·작업 내용 형식 오류 | 400 `VALIDATION_ERROR` |
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
import { ComplaintStatus, prisma } from "@zari/db";
import { requireComplaintLandlord } from "@/features/complaint/ownership";
import { parseDateOnly } from "@/features/lease/rules";
import { dispatchWorkOrderTargets } from "@/features/workorder/matching";
import { getLandlordWorkOrder } from "@/features/workorder/queries";
import { convertComplaintSchema } from "@/features/workorder/schema";
import { created, fail, parseJson } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  const access = await requireComplaintLandlord(id);
  if (access.response) return access.response;
  const { complaint, profileId } = access.data;

  const parsed = await parseJson(request, convertComplaintSchema);
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  // 이미 전환됐으면 409. 아래 create 도 `complaintId @unique` 로 한 번 더 막는다
  // (두 요청이 동시에 들어와도 한쪽만 성공하게).
  const existing = await prisma.workOrder.findUnique({
    where: { complaintId: complaint.id },
    select: { id: true },
  });
  if (existing) {
    return fail("CONFLICT", "이미 작업 의뢰로 전환된 민원입니다.");
  }

  let desiredDate: Date | null = null;
  if (input.desiredDate) {
    desiredDate = parseDateOnly(input.desiredDate);
    if (!desiredDate) return fail("VALIDATION_ERROR", "희망일이 올바른 날짜가 아닙니다.");
  }

  const unit = complaint.lease.unit;
  let workOrderId: string;
  try {
    const row = await prisma.$transaction(async (tx) => {
      const workOrder = await tx.workOrder.create({
        data: {
          requesterProfileId: profileId,
          buildingId: unit.buildingId,
          unitId: unit.id,
          complaintId: complaint.id,
          category: input.category,
          // 비워서 보내면 민원 본문이 그대로 작업 내용이 된다(제목은 DTO 의 `complaintTitle` 로 따라간다)
          description: input.description ?? complaint.body,
          desiredDate,
        },
      });
      // 손을 댄 민원이므로 미확인(OPEN)에서 빼 준다. 이미 진행중이면 그대로 둔다
      if (complaint.status !== ComplaintStatus.IN_PROGRESS) {
        await tx.complaint.update({
          where: { id: complaint.id },
          data: { status: ComplaintStatus.IN_PROGRESS },
        });
      }
      return workOrder;
    });
    workOrderId = row.id;
  } catch (error) {
    // `WorkOrder.complaintId @unique` 위반 = 그 사이에 다른 요청이 먼저 전환했다
    if ((error as { code?: string }).code === "P2002") {
      return fail("CONFLICT", "이미 작업 의뢰로 전환된 민원입니다.");
    }
    throw error;
  }

  const dispatchedCount = await dispatchWorkOrderTargets(workOrderId);

  const workOrder = await getLandlordWorkOrder(workOrderId);
  if (!workOrder) return fail("INTERNAL_ERROR", "작업 의뢰를 저장하지 못했습니다.");
  return created({
    workOrder,
    dispatchedCount,
    complaintStatus: ComplaintStatus.IN_PROGRESS,
  });
}
