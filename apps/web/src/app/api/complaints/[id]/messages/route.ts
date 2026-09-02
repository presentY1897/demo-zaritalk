/**
 * `POST /api/complaints/[id]/messages` — 민원 스레드 메시지 (T2.6).
 *
 * **이 task 의 최소 테스트가 겨냥하는 자리다** — 해당 계약의 세입자와 임대인만 쓸 수 있고
 * 제3자는 403 이다. 판정은 `features/complaint/ownership.ts` 의 `requireComplaintAccess` 한 곳뿐이고,
 * 작성자(`authorProfileId`)는 **그 판정이 돌려준 프로필 id** 를 그대로 쓴다 —
 * 클라이언트가 보낸 값을 믿지 않는다.
 *
 * | 실패 | status · code |
 * |---|---|
 * | 비로그인 | 401 `UNAUTHORIZED` |
 * | 없는 민원 | 404 `NOT_FOUND` |
 * | **제3자**(그 계약의 세입자도 임대인도 아님) | 403 `FORBIDDEN` |
 * | 빈 메시지·1,000자 초과 | 400 `VALIDATION_ERROR` |
 *
 * 종결된 민원(해결·반려)에도 메시지는 남길 수 있다 — 대화를 막을 이유가 없고,
 * 다시 손봐야 하면 임대인이 「진행중」으로 재개하면 된다(상태 전이표는 `status.ts`).
 */
import { prisma } from "@zari/db";
import { requireComplaintAccess } from "@/features/complaint/ownership";
import { getComplaintDetail } from "@/features/complaint/queries";
import { createComplaintMessageSchema } from "@/features/complaint/schema";
import { created, fail, parseJson } from "@/lib/api/response";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;

  const access = await requireComplaintAccess(id);
  if (access.response) return access.response;

  const parsed = await parseJson(request, createComplaintMessageSchema);
  if (parsed.response) return parsed.response;

  await prisma.complaintMessage.create({
    data: {
      complaintId: id,
      authorProfileId: access.data.profileId,
      body: parsed.data.body,
    },
  });

  // 목록 정렬(최근 활동 순)과 "마지막 활동" 표시가 답장을 따라오게 한다
  await prisma.complaint.update({ where: { id }, data: { updatedAt: new Date() } });

  const complaint = await getComplaintDetail(id);
  if (!complaint) return fail("INTERNAL_ERROR", "메시지를 저장하지 못했습니다.");

  const message = complaint.messages.at(-1);
  if (!message) return fail("INTERNAL_ERROR", "메시지를 저장하지 못했습니다.");
  return created({ message, complaint });
}
