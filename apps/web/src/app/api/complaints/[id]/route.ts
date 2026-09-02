/**
 * `PATCH /api/complaints/[id]` — 민원 상태 변경 (T2.6). **임대인 전용.**
 *
 * 권한 판정은 `features/complaint/ownership.ts` 한 곳에서만 한다(`requireComplaintLandlord`),
 * 전이 허용 여부는 `features/complaint/status.ts` 의 전이표(`canTransition`) 한 곳에서만 한다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 없는 민원 | 404 `NOT_FOUND` |
 * | **제3자** | 403 `FORBIDDEN` |
 * | **세입자**(스레드는 보지만 상태는 못 바꾼다) | 403 `FORBIDDEN` |
 * | `OPEN` 으로 되돌리기·형식 오류 | 400 `VALIDATION_ERROR` |
 * | 전이표가 막은 전이(같은 상태, 해결 ↔ 반려) | 409 `CONFLICT` |
 *
 * `params` 는 Next 16 규약대로 Promise 다.
 */
import { prisma } from "@zari/db";
import { requireComplaintLandlord } from "@/features/complaint/ownership";
import { getComplaintDetail } from "@/features/complaint/queries";
import { updateComplaintStatusSchema } from "@/features/complaint/schema";
import { canTransition, transitionRejectReason } from "@/features/complaint/status";
import type { ComplaintStatusValue } from "@/features/complaint/types";
import { fail, ok, parseJson } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  const access = await requireComplaintLandlord(id);
  if (access.response) return access.response;

  const parsed = await parseJson(request, updateComplaintStatusSchema);
  if (parsed.response) return parsed.response;

  const from = access.data.complaint.status as ComplaintStatusValue;
  const to = parsed.data.status;
  if (!canTransition(from, to)) return fail("CONFLICT", transitionRejectReason(from, to));

  // 전이 전 상태를 조건에 넣은 단일 UPDATE — 두 요청이 겹쳐도 한쪽만 성공한다(count 0 → 409)
  const updated = await prisma.complaint.updateMany({
    where: { id, status: from },
    data: { status: to },
  });
  if (updated.count === 0) return fail("CONFLICT", "이미 다른 상태로 처리된 민원입니다.");

  const complaint = await getComplaintDetail(id);
  if (!complaint) return fail("INTERNAL_ERROR", "민원 상태를 저장하지 못했습니다.");
  return ok({ complaint });
}
